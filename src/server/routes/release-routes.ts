import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientVersionSessions, featureVersionGates, referrals, referralEvents, shares, softwareReleases } from "@/db/schema";
import { APP_VERSION } from "@/lib/app-version";
import { compareSemVer, isValidSemVer, parseSemVer } from "@/lib/semver";
import { isFeatureGateLive } from "@/lib/feature-version";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, forbidden, notFound, sha256 } from "../core";
import { adminLog } from "../economy";
import { queue } from "../queue";
import { publishReleaseNow } from "../release-publisher";

const versionSchema = z.string().refine(isValidSemVer, "版本必須使用 major.minor.patch，例如 1.5.0；不可含 v 前綴或前導零");
const releaseTypes = ["PATCH", "MINOR", "MAJOR", "HOTFIX"] as const;
const releaseStatuses = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
const featureStatuses = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
const lineItems = z.array(z.string().trim().min(1).max(500)).max(100).default([]);
const listReleases = () => db.select().from(softwareReleases);

function sortBySemVerDesc<T extends { version: string }>(items: T[]) {
  return [...items].sort((left, right) => compareSemVer(right.version, left.version));
}

function highestVersion(versions: Array<string | null | undefined>) {
  return versions.filter((value): value is string => Boolean(value && isValidSemVer(value))).sort(compareSemVer).at(-1) ?? "0.0.0";
}

function validateBump(previousVersion: string, version: string, releaseType: (typeof releaseTypes)[number], minimumSupportedVersion: string) {
  const previous = parseSemVer(previousVersion);
  const next = parseSemVer(version);
  if (!previous || !next) throw badRequest("版本格式無效；請使用 major.minor.patch。" );
  if (compareSemVer(version, previousVersion) <= 0) throw badRequest(`新版 ${version} 必須高於前一版 ${previousVersion}。`);
  if (compareSemVer(minimumSupportedVersion, version) > 0) throw badRequest("最低支援版本不可高於這次發布版本。" );
  const matches = releaseType === "MAJOR"
    ? next[0] > previous[0] && next[1] === 0 && next[2] === 0
    : releaseType === "MINOR"
      ? next[0] === previous[0] && next[1] > previous[1] && next[2] === 0
      : next[0] === previous[0] && next[1] === previous[1] && next[2] > previous[2];
  if (!matches) throw badRequest(`${releaseType} 版本號與 ${previousVersion} → ${version} 不相符，請修正發布類型或版本號。`);
}

async function latestPublishedVersion() {
  const rows = await db.select({ version: softwareReleases.version }).from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED"));
  return highestVersion(rows.map((row) => row.version));
}

async function ensureVersionCandidate(version: string, previousVersion: string, releaseType: (typeof releaseTypes)[number], minimumSupportedVersion: string, excludeId?: string) {
  const floor = highestVersion([APP_VERSION, await latestPublishedVersion(), previousVersion]);
  if (compareSemVer(version, floor) <= 0) throw conflict(`新版版本號必須高於目前部署／最新發布版本 ${floor}，不能重複或倒退。`);
  validateBump(previousVersion, version, releaseType, minimumSupportedVersion);
  const duplicate = await db.select({ id: softwareReleases.id }).from(softwareReleases).where(eq(softwareReleases.version, version)).limit(1);
  if (duplicate[0] && duplicate[0].id !== excludeId) throw conflict(`版本 ${version} 已存在，請使用另一個版本號。`);
}

async function recordClientVersion(ctx: Parameters<NonNullable<RouteDef["handler"]>>[0], current: string) {
  const sessionKey = ctx.req.headers.get("x-studynova-session") ?? "";
  if (!ctx.user || !isValidSemVer(current) || sessionKey.length < 8 || sessionKey.length > 200) return;
  const now = new Date();
  await db.insert(clientVersionSessions).values({ userId: ctx.user.userId, sessionHash: sha256(sessionKey), appVersion: current, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [clientVersionSessions.userId, clientVersionSessions.sessionHash], set: { appVersion: current, lastSeenAt: now } });
}

const releaseFields = z.object({
  version: versionSchema,
  releaseType: z.enum(releaseTypes),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().max(300).default(""),
  description: z.string().max(5000).default(""),
  releaseNotes: z.string().max(20000).default(""),
  newFeatures: lineItems,
  improvements: lineItems,
  bugFixes: lineItems,
  breakingChanges: lineItems,
  migrationRequired: z.boolean().default(false),
  minimumSupportedVersion: versionSchema.default("1.0.0"),
});

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/admin/releases", auth: "admin", handler: async () => ({ currentVersion: APP_VERSION, releases: await db.select().from(softwareReleases).orderBy(desc(softwareReleases.createdAt)) }) }),
  route({ method: "GET", path: "/admin/releases/analytics", auth: "admin", handler: async () => {
    const checkedAt = new Date();
    const since = new Date(checkedAt.getTime() - 30 * 86_400_000);
    const versions = await db.select({
      appVersion: clientVersionSessions.appVersion,
      activeSessions: sql<number>`count(*)::int`,
      activeUsers: sql<number>`count(distinct ${clientVersionSessions.userId})::int`,
      lastSeenAt: sql<Date>`max(${clientVersionSessions.lastSeenAt})`,
    }).from(clientVersionSessions).where(gte(clientVersionSessions.lastSeenAt, since)).groupBy(clientVersionSessions.appVersion).orderBy(desc(sql`max(${clientVersionSessions.lastSeenAt})`));
    return { windowDays: 30, checkedAt: checkedAt.toISOString(), totalActiveSessions: versions.reduce((sum, row) => sum + row.activeSessions, 0), totalActiveUsers: await db.select({ count: sql<number>`count(distinct ${clientVersionSessions.userId})::int` }).from(clientVersionSessions).where(gte(clientVersionSessions.lastSeenAt, since)).then((rows) => rows[0]?.count ?? 0), versions };
  }}),
  route({ method: "GET", path: "/admin/releases/features", auth: "admin", handler: async () => ({ features: await db.select().from(featureVersionGates).orderBy(featureVersionGates.featureKey) }) }),
  route({ method: "GET", path: "/releases/latest", auth: "optional", handler: async (ctx) => {
    const currentCandidate = ctx.req.headers.get("x-studynova-version") ?? ctx.query.get("currentVersion") ?? APP_VERSION;
    const current = isValidSemVer(currentCandidate) ? currentCandidate : APP_VERSION;
    await recordClientVersion(ctx, current);
    const published = await db.select().from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED"));
    const latest = sortBySemVerDesc(published.filter((row) => isValidSemVer(row.version)))[0] ?? null;
    if (!latest) return { currentVersion: current, latestVersion: current, minimumSupportedVersion: "1.0.0", updateAvailable: false, forceUpdate: false, release: null, checkedAt: new Date().toISOString() };
    const updateAvailable = compareSemVer(latest.version, current) > 0;
    const forceUpdate = compareSemVer(latest.minimumSupportedVersion, current) > 0;
    return {
      currentVersion: current,
      latestVersion: latest.version,
      minimumSupportedVersion: latest.minimumSupportedVersion,
      updateAvailable,
      forceUpdate,
      release: { id: latest.id, version: latest.version, versionCode: latest.versionCode, releaseType: latest.releaseType, title: latest.title, subtitle: latest.subtitle, summary: latest.subtitle, description: latest.description, releaseNotes: latest.releaseNotes, newFeatures: latest.newFeatures, improvements: latest.improvements, bugFixes: latest.bugFixes, breakingChanges: latest.breakingChanges, minimumSupportedVersion: latest.minimumSupportedVersion, releasedAt: latest.releasedAt?.toISOString() ?? null, publishedAt: latest.releasedAt?.toISOString() ?? null },
      checkedAt: new Date().toISOString(),
    };
  }}),
  route({ method: "GET", path: "/releases/history", auth: "none", handler: async () => ({ releases: sortBySemVerDesc(await db.select({ id: softwareReleases.id, version: softwareReleases.version, versionCode: softwareReleases.versionCode, releaseType: softwareReleases.releaseType, title: softwareReleases.title, subtitle: softwareReleases.subtitle, description: softwareReleases.description, releaseNotes: softwareReleases.releaseNotes, newFeatures: softwareReleases.newFeatures, improvements: softwareReleases.improvements, bugFixes: softwareReleases.bugFixes, breakingChanges: softwareReleases.breakingChanges, releasedAt: softwareReleases.releasedAt }).from(softwareReleases).where(or(eq(softwareReleases.status, "PUBLISHED"), eq(softwareReleases.status, "ARCHIVED")))) }) }),
  route({ method: "GET", path: "/feature-gates", auth: "none", handler: async () => {
    const now = new Date();
    const rows = await db.select({ featureKey: featureVersionGates.featureKey, featureName: featureVersionGates.featureName, requiredVersion: featureVersionGates.requiredVersion, minimumVersion: featureVersionGates.minimumVersion, enabled: featureVersionGates.enabled, releaseStatus: featureVersionGates.releaseStatus, releaseDate: featureVersionGates.releaseDate }).from(featureVersionGates).where(sql`${featureVersionGates.releaseStatus} <> 'ARCHIVED'`).orderBy(featureVersionGates.featureKey);
    const features = rows.map((feature) => ({ ...feature, enabled: isFeatureGateLive(feature, now) }));
    return { features };
  }}),
  route({ method: "POST", path: "/admin/releases", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(releaseFields);
    const previousVersion = highestVersion([APP_VERSION, await latestPublishedVersion()]);
    await ensureVersionCandidate(body.version, previousVersion, body.releaseType, body.minimumSupportedVersion);
    const migrationStatus = body.migrationRequired ? "PENDING" : "NOT_REQUIRED";
    const row = (await db.insert(softwareReleases).values({ ...body, previousVersion, createdBy: admin.userId, migrationStatus, status: "DRAFT" }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.create", targetType: "software_release", targetId: row.id, reason: "建立版本更新草稿", after: { version: row.version, versionCode: row.versionCode, migrationRequired: row.migrationRequired }, ip: ctx.ip });
    return { release: row, releaseGate: { passed: !row.migrationRequired, migrationStatus: row.migrationStatus, message: row.migrationRequired ? "請先在線上資料庫套用 migration，並記錄成功結果。" : "版本草稿已建立；發布前請完成測試與部署檢查。" } };
  }}),
  route({ method: "PATCH", path: "/admin/releases/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "DRAFT") throw conflict("只有草稿版本可以編輯；已排程或已發布版本請先取消排程或封存。" );
    const body = await ctx.json(releaseFields.partial().refine((value) => Object.keys(value).length > 0, "至少需要更新一個欄位"));
    const version = body.version ?? row.version;
    const releaseType = body.releaseType ?? row.releaseType as (typeof releaseTypes)[number];
    const previousVersion = row.previousVersion || APP_VERSION;
    const minimumSupportedVersion = body.minimumSupportedVersion ?? row.minimumSupportedVersion;
    await ensureVersionCandidate(version, previousVersion, releaseType, minimumSupportedVersion, row.id);
    const migrationRequired = body.migrationRequired ?? row.migrationRequired;
    const now = new Date();
    const updated = (await db.update(softwareReleases).set({ ...body, migrationStatus: body.migrationRequired === undefined ? row.migrationStatus : migrationRequired ? "PENDING" : "NOT_REQUIRED", migrationStartedAt: body.migrationRequired === undefined ? row.migrationStartedAt : null, migrationCompletedAt: body.migrationRequired === undefined ? row.migrationCompletedAt : null, migrationErrorLog: body.migrationRequired === undefined ? row.migrationErrorLog : "", updatedAt: now }).where(and(eq(softwareReleases.id, row.id), eq(softwareReleases.status, "DRAFT"))).returning())[0];
    if (!updated) throw conflict("草稿已被其他操作更新，請重新整理後再試。" );
    await adminLog({ actorId: admin.userId, action: "release.update", targetType: "software_release", targetId: row.id, reason: "編輯版本草稿", before: { version: row.version }, after: { version: updated.version }, ip: ctx.ip });
    return { release: updated };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/migration", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ status: z.enum(["RUNNING", "SUCCEEDED", "FAILED"]), errorLog: z.string().max(12000).default("") }));
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (!row.migrationRequired) throw badRequest("此版本沒有標記需要 migration。" );
    const now = new Date();
    const updated = (await db.update(softwareReleases).set({ migrationStatus: body.status, migrationStartedAt: body.status === "RUNNING" ? now : row.migrationStartedAt ?? now, migrationCompletedAt: body.status === "RUNNING" ? null : now, migrationErrorLog: body.status === "FAILED" ? body.errorLog.trim() : "", migrationUpdatedBy: admin.userId, updatedAt: now }).where(eq(softwareReleases.id, row.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.migration", targetType: "software_release", targetId: row.id, reason: `更新 migration 狀態：${body.status}`, after: { status: body.status, errorLogLength: updated.migrationErrorLog.length }, ip: ctx.ip });
    return { migrationStatus: updated.migrationStatus, startedAt: updated.migrationStartedAt, completedAt: updated.migrationCompletedAt, errorLog: updated.migrationErrorLog };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/schedule", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ scheduledAt: z.string().datetime() }));
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "DRAFT" && row.status !== "SCHEDULED") throw conflict("只有草稿或目前已排程的版本可以安排發布。" );
    if (row.migrationRequired && row.migrationStatus !== "SUCCEEDED") throw forbidden("請先完成 migration 並記錄成功結果，才能排程發布。" );
    const scheduledAt = new Date(body.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 10_000) throw badRequest("發布時間需至少在現在 10 秒後；既有 queue worker 會按每分鐘排程檢查。" );
    const previousVersion = row.previousVersion || APP_VERSION;
    await ensureVersionCandidate(row.version, previousVersion, row.releaseType as (typeof releaseTypes)[number], row.minimumSupportedVersion, row.id);
    const updated = (await db.update(softwareReleases).set({ status: "SCHEDULED", scheduledAt, publishedBy: admin.userId, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id)).returning())[0];
    try {
      const result = await queue().enqueue({ name: "release_publish", payload: { releaseId: row.id, scheduledAt: scheduledAt.toISOString() }, uniqueKey: `release-publish:${row.id}:${scheduledAt.toISOString()}:${Date.now()}`, runAt: scheduledAt });
      if (!result.queued) throw new Error("duplicate release publish queue job");
    } catch (error) {
      await db.update(softwareReleases).set({ status: "DRAFT", scheduledAt: null, publishedBy: null, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id));
      throw error;
    }
    await adminLog({ actorId: admin.userId, action: "release.schedule", targetType: "software_release", targetId: row.id, reason: "排程版本發布", after: { version: row.version, scheduledAt: scheduledAt.toISOString() }, ip: ctx.ip });
    return { release: updated, scheduled: true };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/publish", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const before = (await db.select({ status: softwareReleases.status, version: softwareReleases.version }).from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    const updated = await publishReleaseNow(ctx.params.id, admin.userId);
    await adminLog({ actorId: admin.userId, action: "release.publish", targetType: "software_release", targetId: updated.id, reason: "立即發布版本更新", before: { status: before?.status }, after: { status: updated.status, version: updated.version }, ip: ctx.ip });
    return { release: updated, published: true };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/cancel", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "SCHEDULED") throw conflict("只有排程中的版本可以取消發布。" );
    const updated = (await db.update(softwareReleases).set({ status: "DRAFT", scheduledAt: null, publishedBy: null, updatedAt: new Date() }).where(and(eq(softwareReleases.id, row.id), eq(softwareReleases.status, "SCHEDULED"))).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.cancel", targetType: "software_release", targetId: row.id, reason: "取消版本發布排程", before: { status: row.status, scheduledAt: row.scheduledAt?.toISOString() }, after: { status: updated?.status }, ip: ctx.ip });
    return { release: updated, cancelled: true };
  }}),
  route({ method: "POST", path: "/admin/releases/:id/archive", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status === "PUBLISHED" && row.version === await latestPublishedVersion()) throw conflict("最新已發布版本不可封存，避免目前版本指標倒退。" );
    if (row.status === "ARCHIVED") return { release: row, archived: true };
    const updated = (await db.update(softwareReleases).set({ status: "ARCHIVED", archivedAt: new Date(), scheduledAt: null, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.archive", targetType: "software_release", targetId: row.id, reason: "封存版本", before: { status: row.status }, after: { status: updated.status }, ip: ctx.ip });
    return { release: updated, archived: true };
  }}),
  route({ method: "DELETE", path: "/admin/releases/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const row = (await db.select().from(softwareReleases).where(eq(softwareReleases.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "DRAFT") throw conflict("只能刪除草稿；已排程或發布的版本請取消排程或封存。" );
    await db.delete(softwareReleases).where(eq(softwareReleases.id, row.id));
    await adminLog({ actorId: admin.userId, action: "release.delete", targetType: "software_release", targetId: row.id, reason: "刪除未發布版本草稿", before: { version: row.version }, ip: ctx.ip });
    return { deleted: true };
  }}),
  route({ method: "POST", path: "/admin/releases/features", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ featureKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/), featureName: z.string().trim().min(1).max(120), requiredVersion: versionSchema, minimumVersion: versionSchema, enabled: z.boolean().default(true), releaseStatus: z.enum(featureStatuses).default("DRAFT"), releaseDate: z.string().datetime().nullable().optional() }));
    if (compareSemVer(body.minimumVersion, body.requiredVersion) > 0) throw badRequest("Feature 的最低版本不可高於功能所需版本。" );
    if (body.releaseStatus === "SCHEDULED" && (!body.releaseDate || new Date(body.releaseDate).getTime() <= Date.now())) throw badRequest("排程發布的 Feature Gate 必須設定未來時間。" );
    const now = new Date();
    const values = { ...body, releaseDate: body.releaseDate ? new Date(body.releaseDate) : null, updatedBy: admin.userId, updatedAt: now };
    const feature = (await db.insert(featureVersionGates).values(values).onConflictDoUpdate({ target: featureVersionGates.featureKey, set: { featureName: values.featureName, requiredVersion: values.requiredVersion, minimumVersion: values.minimumVersion, enabled: values.enabled, releaseStatus: values.releaseStatus, releaseDate: values.releaseDate, updatedBy: admin.userId, updatedAt: now } }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.feature_gate", targetType: "feature_version_gate", targetId: feature.id, reason: "新增或更新 feature version gate", after: { featureKey: feature.featureKey, requiredVersion: feature.requiredVersion, releaseStatus: feature.releaseStatus }, ip: ctx.ip });
    return { feature };
  }}),
  route({ method: "POST", path: "/admin/releases/features/:key/publish", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const feature = (await db.update(featureVersionGates).set({ releaseStatus: "PUBLISHED", releaseDate: new Date(), updatedBy: admin.userId, updatedAt: new Date() }).where(eq(featureVersionGates.featureKey, ctx.params.key)).returning())[0];
    if (!feature) throw notFound("找不到 feature gate");
    await adminLog({ actorId: admin.userId, action: "release.feature_publish", targetType: "feature_version_gate", targetId: feature.id, reason: "發布 feature gate", after: { featureKey: feature.featureKey }, ip: ctx.ip });
    return { feature };
  }}),
  route({ method: "POST", path: "/admin/releases/features/:key/archive", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const feature = (await db.update(featureVersionGates).set({ releaseStatus: "ARCHIVED", updatedBy: admin.userId, updatedAt: new Date() }).where(eq(featureVersionGates.featureKey, ctx.params.key)).returning())[0];
    if (!feature) throw notFound("找不到 feature gate");
    await adminLog({ actorId: admin.userId, action: "release.feature_archive", targetType: "feature_version_gate", targetId: feature.id, reason: "封存 feature gate", after: { featureKey: feature.featureKey }, ip: ctx.ip });
    return { feature };
  }}),
  route({ method: "PATCH", path: "/admin/releases/features/:key", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ featureName: z.string().trim().min(1).max(120).optional(), requiredVersion: versionSchema.optional(), minimumVersion: versionSchema.optional(), enabled: z.boolean().optional(), releaseStatus: z.enum(featureStatuses).optional(), releaseDate: z.string().datetime().nullable().optional() }).refine((value) => Object.keys(value).length > 0, "至少需要更新一個欄位"));
    const current = (await db.select().from(featureVersionGates).where(eq(featureVersionGates.featureKey, ctx.params.key)).limit(1))[0];
    if (!current) throw notFound("找不到 feature gate");
    const requiredVersion = body.requiredVersion ?? current.requiredVersion;
    const minimumVersion = body.minimumVersion ?? current.minimumVersion;
    if (compareSemVer(minimumVersion, requiredVersion) > 0) throw badRequest("Feature 的最低版本不可高於功能所需版本。" );
    const releaseStatus = body.releaseStatus ?? current.releaseStatus;
    const releaseDate = body.releaseDate === undefined ? current.releaseDate : body.releaseDate ? new Date(body.releaseDate) : null;
    if (releaseStatus === "SCHEDULED" && (!releaseDate || releaseDate.getTime() <= Date.now())) throw badRequest("排程發布的 Feature Gate 必須設定未來時間。" );
    const updated = (await db.update(featureVersionGates).set({ ...body, releaseDate, updatedBy: admin.userId, updatedAt: new Date() }).where(eq(featureVersionGates.featureKey, ctx.params.key)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "release.feature_update", targetType: "feature_version_gate", targetId: updated.id, reason: "編輯 feature gate", after: { featureKey: updated.featureKey, requiredVersion: updated.requiredVersion, releaseStatus: updated.releaseStatus }, ip: ctx.ip });
    return { feature: updated };
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
