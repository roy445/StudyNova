import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, proActivationLinks, proExtensionAudits, proRenewalRequests, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound, randomToken, sha256 } from "../core";
import { grantMembership, adminLog } from "../economy";
import { notify } from "../notify";

function expiresText(value: Date | string | null | undefined) { return value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "目前沒有設定到期時間"; }
function customerLetter(input: { displayName: string; expiresAt: Date | string | null; feedback: string; note: string }) {
  return `您好 ${input.displayName}：\n\n感謝您使用 StudyNova，也謝謝您提供的回饋。\n\n我們已完成 Nova Pro 會員延長處理，新到期時間為：${expiresText(input.expiresAt)}。\n\n您提供的回饋：${input.feedback || "（未提供）"}\n\n管理員備註：${input.note || "（無）"}\n\n祝學習順利！\nStudyNova 團隊`;
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/membership/renewal", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const membership = (await db.select().from(memberships).where(eq(memberships.userId, user.userId)).limit(1))[0] ?? null;
    const request = (await db.select().from(proRenewalRequests).where(eq(proRenewalRequests.userId, user.userId)).limit(1))[0] ?? null;
    return { membership, isPro: user.isPro, request, daysRemaining: membership?.expiresAt ? Math.max(0, Math.ceil((new Date(membership.expiresAt).getTime() - Date.now()) / 86_400_000)) : null };
  }}),
  route({ method: "POST", path: "/membership/renewal", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ wantsRenewal: z.boolean(), reason: z.string().max(2000).default(""), requestedFeatures: z.array(z.string().max(100)).max(20).default([]), otherFeedback: z.string().max(2000).default("") }));
    const row = (await db.insert(proRenewalRequests).values({ userId: user.userId, ...body }).onConflictDoUpdate({ target: proRenewalRequests.userId, set: { ...body, updatedAt: new Date() } }).returning())[0];
    await notify({ userId: user.userId, kind: "membership", title: "已收到 Nova Pro 續約意願", body: "管理員已可查看你的續約意願與回饋。", link: "/profile?tab=pass", dedupeKey: `pro-renewal-submitted:${user.userId}:${row.updatedAt.getTime()}` });
    return { request: row };
  }}),
  route({ method: "GET", path: "/admin/pro-renewals", auth: "admin", handler: async (ctx) => {
    const status = ctx.query.get("status") ?? "all";
    const rows = await db.select({ request: proRenewalRequests, user: { userId: users.userId, displayName: users.displayName, email: users.email }, membership: memberships }).from(users).leftJoin(proRenewalRequests, eq(proRenewalRequests.userId, users.userId)).leftJoin(memberships, eq(memberships.userId, users.userId)).where(and(eq(users.role, "student"), eq(users.status, "active"), status === "pending" ? eq(proRenewalRequests.wantsRenewal, true) : undefined)).orderBy(desc(proRenewalRequests.updatedAt), asc(users.displayName)).limit(500);
    return { requests: rows };
  }}),
  route({ method: "POST", path: "/admin/pro-renewals/:userId/extend", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ days: z.number().int().min(1).max(365), reason: z.string().min(2).max(500), adminNote: z.string().max(2000).default("") }));
    const target = (await db.select({ userId: users.userId, displayName: users.displayName, email: users.email }).from(users).where(eq(users.userId, ctx.params.userId)).limit(1))[0]; if (!target) throw notFound("找不到使用者");
    const before = (await db.select().from(memberships).where(eq(memberships.userId, target.userId)).limit(1))[0] ?? null;
    const result = await grantMembership({ userId: target.userId, days: body.days, actorId: admin.userId, reason: body.reason, action: "extend" });
    const after = result[0];
    const audit = (await db.insert(proExtensionAudits).values({ adminUserId: admin.userId, userId: target.userId, beforeExpiresAt: before?.expiresAt ?? null, afterExpiresAt: after?.expiresAt ?? null, days: body.days, reason: body.reason, adminNote: body.adminNote }).returning())[0];
    const request = (await db.select().from(proRenewalRequests).where(eq(proRenewalRequests.userId, target.userId)).limit(1))[0];
    const letter = customerLetter({ displayName: target.displayName, expiresAt: after?.expiresAt, feedback: request?.otherFeedback || request?.reason || "", note: body.adminNote });
    await adminLog({ actorId: admin.userId, action: "membership.extend", targetType: "user", targetId: target.userId, reason: body.reason, before: before as Record<string, unknown> | null, after: after as Record<string, unknown> | null, ip: ctx.ip });
    return { membership: after, audit, customerLetter: letter, target: { displayName: target.displayName, email: target.email } };
  }}),
  route({ method: "POST", path: "/admin/pro-renewals/:userId/customer-letter", auth: "admin", handler: async (ctx) => {
    const target = (await db.select({ userId: users.userId, displayName: users.displayName }).from(users).where(eq(users.userId, ctx.params.userId)).limit(1))[0];
    if (!target) throw notFound("找不到使用者");
    const membership = (await db.select().from(memberships).where(eq(memberships.userId, target.userId)).limit(1))[0];
    const request = (await db.select().from(proRenewalRequests).where(eq(proRenewalRequests.userId, target.userId)).limit(1))[0];
    return { customerLetter: customerLetter({ displayName: target.displayName, expiresAt: membership?.expiresAt, feedback: request?.otherFeedback || request?.reason || "", note: "請由管理員確認後再寄送。" }) };
  }}),
  route({ method: "POST", path: "/admin/pro-activation-links", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ targetUserId: z.string().uuid().optional(), targetEmail: z.string().email().optional(), baseUrl: z.string().url().optional() }).refine((v) => v.targetUserId || v.targetEmail, "必須指定使用者或 Email"));
    let targetUserId = body.targetUserId; let targetEmail = body.targetEmail?.trim().toLowerCase() ?? "";
    if (targetUserId) { const target = (await db.select({ email: users.email }).from(users).where(eq(users.userId, targetUserId)).limit(1))[0]; if (!target) throw notFound("找不到指定使用者"); targetEmail = target.email; }
    else { const target = (await db.select({ userId: users.userId }).from(users).where(eq(users.email, targetEmail)).limit(1))[0]; if (!target) throw notFound("找不到指定 Email 的使用者"); targetUserId = target.userId; }
    const token = randomToken(32); const expiresAt = new Date(Date.now() + 60 * 60_000);
    const row = (await db.insert(proActivationLinks).values({ tokenHash: sha256(token), targetUserId, targetEmail, days: 3, expiresAt, createdBy: admin.userId }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "membership.activation_link.create", targetType: "user", targetId: targetUserId, reason: "Nova Pro 3 天一次性啟用連結", after: { linkId: row.id, expiresAt: expiresAt.toISOString(), days: 3 }, ip: ctx.ip });
    const baseUrl = body.baseUrl ?? "";
    return { link: `${baseUrl}/profile?tab=pass&proActivation=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString(), days: 3, customerMessage: `您好！管理員已為您準備 Nova Pro 3 天啟用連結。此連結只能使用一次，並於 ${expiresText(expiresAt)} 失效。\n\n請開啟：${baseUrl}/profile?tab=pass&proActivation=${encodeURIComponent(token)}` };
  }}),
  route({ method: "POST", path: "/membership/pro-activation/redeem", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ token: z.string().min(40).max(200) }));
    const now = new Date();
    const link = (await db.select().from(proActivationLinks).where(and(eq(proActivationLinks.tokenHash, sha256(body.token)), isNull(proActivationLinks.usedAt), gte(proActivationLinks.expiresAt, now))).limit(1))[0];
    if (!link || (link.targetUserId && link.targetUserId !== user.userId) || (link.targetEmail && link.targetEmail !== user.email.toLowerCase())) throw fail("SYS_CONFLICT", { message: "Nova Pro 啟用連結無效、過期或不符合指定使用者。" });
    const claimed = (await db.update(proActivationLinks).set({ usedAt: now }).where(and(eq(proActivationLinks.id, link.id), isNull(proActivationLinks.usedAt))).returning())[0];
    if (!claimed) throw fail("SYS_CONFLICT", { message: "Nova Pro 啟用連結已經使用過。" });
    const membershipResult = await grantMembership({ userId: user.userId, days: 3, actorId: user.userId, reason: "管理員 Nova Pro 3 天一次性啟用連結", action: "extend" });
    await notify({ userId: user.userId, kind: "membership", title: "✨ Nova Pro 3 天已啟用", body: `新到期日：${expiresText(membershipResult[0]?.expiresAt)}`, link: "/profile?tab=pass", dedupeKey: `pro-activation:${link.id}` });
    return { activated: true, membership: membershipResult[0] };
  }}),
];
