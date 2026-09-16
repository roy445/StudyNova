import { z } from "zod";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { referrals, referralEvents, shares, softwareReleases } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, forbidden, notFound } from "../core";
import { adminLog } from "../economy";

const versionSchema = z.string().regex(/^v?\d+\.\d+\.\d+$/, "版本必須使用 major.minor.patch");
function semver(value: string) { const match = value.replace(/^v/, "").split(".").map(Number); return match.length === 3 && match.every(Number.isInteger) ? match : null; }
export function compareVersions(left: string, right: string) { const a = semver(left); const b = semver(right); if (!a || !b) return 0; for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; return 0; }
const currentVersion = () => process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? "1.0.0";

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/admin/releases", auth: "admin", handler: async () => ({ releases: await db.select().from(softwareReleases).orderBy(desc(softwareReleases.createdAt)) }) }),
  route({ method: "GET", path: "/releases/latest", auth: "optional", handler: async (ctx) => {
    const now = new Date();
    const rows = await db.select().from(softwareReleases).where(and(eq(softwareReleases.status, "PUBLISHED"), or(isNull(softwareReleases.releasedAt), gt(softwareReleases.releasedAt, new Date(0))))).orderBy(desc(softwareReleases.releasedAt)).limit(1);
    const latest = rows[0] ?? null;
    const current = ctx.query.get("currentVersion") ?? currentVersion();
    if (!latest) return { currentVersion: current, latestVersion: current, updateAvailable: false, forceUpdate: false, release: null };
    const updateAvailable = compareVersions(latest.version, current) > 0;
    return { currentVersion: current, latestVersion: latest.version, updateAvailable, forceUpdate: updateAvailable && compareVersions(latest.minimumSupportedVersion, current) > 0, release: latest, checkedAt: now.toISOString() };
  }}),
  route({ method: "GET", path: "/releases/history", auth: "none", handler: async () => ({ releases: await db.select().from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED")).orderBy(desc(softwareReleases.releasedAt)) }) }),
  route({ method: "POST", path: "/admin/releases", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ version: versionSchema, previousVersion: versionSchema.optional(), releaseType: z.enum(["PATCH", "MINOR", "MAJOR"]), title: z.string().min(1).max(160), subtitle: z.string().max(300).default(""), description: z.string().max(5000).default(""), releaseNotes: z.string().max(20000).default(""), newFeatures: z.array(z.string().max(500)).max(100).default([]), improvements: z.array(z.string().max(500)).max(100).default([]), bugFixes: z.array(z.string().max(500)).max(100).default([]), breakingChanges: z.array(z.string().max(500)).max(100).default([]), migrationRequired: z.boolean().default(false), minimumSupportedVersion: versionSchema.default("1.0.0"), releasedAt: z.string().datetime().nullable().optional() }));
    const parsed = semver(body.version); if (!parsed) throw badRequest("版本格式無效");
    if (compareVersions(body.version, currentVersion()) <= 0) throw badRequest("新版版本號必須高於目前版本");
    const row = (await db.insert(softwareReleases).values({ ...body, previousVersion: body.previousVersion ?? currentVersion(), releasedAt: body.releasedAt ? new Date(body.releasedAt) : null, createdBy: admin.userId, status: "DRAFT" }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.create", targetType: "software_release", targetId: row.id, reason: "建立版本更新草稿", after: { version: row.version }, ip: ctx.ip });
    return { release: row, releaseGate: { required: true, passed: false, message: "必須完成 typecheck、lint、tests、build、migration 與 security check 後才能發布。" } };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/publish", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "DRAFT" && row.status !== "SCHEDULED") throw conflict("這個版本目前不可發布");
    if (row.migrationRequired) throw forbidden("此版本標記需要 migration，完成 migration check 後才能發布。");
    const updated = (await db.update(softwareReleases).set({ status: "PUBLISHED", releasedAt: row.releasedAt ?? new Date(), updatedAt: new Date() }).where(eq(softwareReleases.id, row.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.publish", targetType: "software_release", targetId: row.id, reason: "發布版本更新", before: { status: row.status }, after: { status: updated.status, version: updated.version }, ip: ctx.ip });
    return { release: updated, published: true };
  }}),
  route({ method: "POST", path: "/referrals/click", auth: "user", rate: { limit: 20, windowSec: 3600 }, handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ inviterId: z.string().uuid(), shareSlug: z.string().min(8).max(100).optional() }));
    if (body.inviterId === user.userId) throw badRequest("不能邀請自己");
    let shareId: string | null = null;
    if (body.shareSlug) { const share = (await db.select({ id: shares.id, userId: shares.userId }).from(shares).where(eq(shares.slug, body.shareSlug)).limit(1))[0]; if (!share || share.userId !== body.inviterId) throw notFound("找不到有效分享"); shareId = share.id; }
    const existing = (await db.select().from(referrals).where(and(eq(referrals.inviterId, body.inviterId), eq(referrals.inviteeId, user.userId))).limit(1))[0];
    if (existing) return { referral: existing, duplicate: true };
    const referral = (await db.insert(referrals).values({ inviterId: body.inviterId, inviteeId: user.userId, shareId, status: "clicked" }).returning())[0];
    await db.insert(referralEvents).values({ referralId: referral.id, eventType: "clicked", metadata: { shareSlug: body.shareSlug ?? null } }).onConflictDoNothing();
    return { referral, duplicate: false };
  }}),
];
