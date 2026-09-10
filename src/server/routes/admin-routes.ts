import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  memberships,
  novaAccounts,
  novaTransactions,
  assistantProfiles,
  assistantItems,
  featurePermissions,
  featureUsage,
  coupons,
  couponRedemptions,
  announcements,
  activities,
  activityParticipants,
  activityQuestions,
  adminLogs,
  systemLogs,
  aiProviderHealth,
  aiUsageLogs,
  questions,
  questionBanks,
  questionVersions,
  questionImportJobs,
  gradeRecords,
  weeklyExamResults,
  weeklyExamWeeks,
  weeklyExamQuestions,
  answers,
  passwordResetTokens,
  studyRecords,
  platformSettings,
  challenges,
  challengeParticipants,
  achievements,
  accountAppeals,
  sessions,
  linkGenerationLogs,
  emailMessageLogs,
} from "@/db/schema";
import { normalizeQuestionRows } from "../question-import";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, fingerprint, notFound, toCsv, monthStart, randomToken, sha256 } from "../core";
import { adminLog, grantMembership, grantNova, grantXp } from "../economy";
import { notify, resolveAudience, sendPush, pushConfigured } from "../notify";
import { queue } from "../queue";
import { providerMetrics, recentAiFailures, aiConfigured, runAiJson } from "../ai";
import { accountEmailTemplate, accountLinkCopy, sendAccountEmail, smtpConfigured, systemAnnouncementEmailTemplate } from "../email";

function csvResponse(filename: string, rows: Array<Record<string, unknown>>) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function recordGeneratedLink(values: typeof linkGenerationLogs.$inferInsert) {
  try {
    await db.insert(linkGenerationLogs).values(values);
  } catch (error) {
    console.error("[support] link log unavailable", error);
  }
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/admin/achievements",
    auth: "admin",
    handler: async () => ({ achievements: await db.select().from(achievements).orderBy(asc(achievements.sortOrder)) }),
  }),
  route({
    method: "POST",
    path: "/admin/achievements",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ code: z.string().min(2).max(80), title: z.string().min(1).max(120), description: z.string().max(500), icon: z.string().max(12).default("🏅"), target: z.number().int().min(1).max(100000).default(1), metric: z.string().max(80), rewardNova: z.number().int().min(0).max(100000).default(0), rewardXp: z.number().int().min(0).max(100000).default(0), rule: z.record(z.string(), z.unknown()).default({}), enabled: z.boolean().default(true), sortOrder: z.number().int().min(0).max(9999).default(0) }));
      const rows = await db.insert(achievements).values(body).returning();
      await adminLog({ actorId: admin.userId, action: "achievement.create", targetType: "achievement", targetId: rows[0].id, after: rows[0], ip: ctx.ip });
      return { achievement: rows[0] };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/achievements/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().min(1).max(120).optional(), description: z.string().max(500).optional(), icon: z.string().max(12).optional(), target: z.number().int().min(1).max(100000).optional(), metric: z.string().max(80).optional(), rewardNova: z.number().int().min(0).max(100000).optional(), rewardXp: z.number().int().min(0).max(100000).optional(), rule: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(9999).optional() }));
      const before = (await db.select().from(achievements).where(eq(achievements.id, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到成就");
      const rows = await db.update(achievements).set(body).where(eq(achievements.id, before.id)).returning();
      await adminLog({ actorId: admin.userId, action: "achievement.update", targetType: "achievement", targetId: before.id, before, after: rows[0], ip: ctx.ip });
      return { achievement: rows[0] };
    },
  }),
  route({
    method: "GET",
    path: "/admin/challenges",
    auth: "admin",
    handler: async () => {
      const rows = await db.select({ id: challenges.id, title: challenges.title, kind: challenges.kind, status: challenges.status, expiresAt: challenges.expiresAt, createdAt: challenges.createdAt, creatorName: users.displayName }).from(challenges).innerJoin(users, eq(users.userId, challenges.creatorId)).orderBy(desc(challenges.createdAt)).limit(100);
      const out = [];
      for (const row of rows) {
        const [count] = await db.select({ c: sql<number>`count(*)::int` }).from(challengeParticipants).where(eq(challengeParticipants.challengeId, row.id));
        out.push({ ...row, participants: count?.c ?? 0 });
      }
      return { challenges: out };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/challenges/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ status: z.enum(["open", "paused", "closed"]).optional(), expiresAt: z.string().datetime().optional() }));
      const current = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到挑戰");
      const rows = await db.update(challenges).set({ ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : current.expiresAt }).where(eq(challenges.id, current.id)).returning();
      await adminLog({ actorId: admin.userId, action: "challenge.update", targetType: "challenge", targetId: current.id, before: current, after: rows[0], ip: ctx.ip });
      return { challenge: rows[0] };
    },
  }),
  route({
    method: "DELETE",
    path: "/admin/challenges/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const current = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到挑戰");
      await db.update(challenges).set({ status: "closed", expiresAt: new Date() }).where(eq(challenges.id, current.id));
      await adminLog({ actorId: admin.userId, action: "challenge.close", targetType: "challenge", targetId: current.id, before: current, after: { status: "closed" }, ip: ctx.ip });
      return { closed: true, preservedHistory: true };
    },
  }),
  route({
    method: "POST",
    path: "/admin/password-reset-links",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ email: z.string().email().max(180), expiresMinutes: z.number().int().min(10).max(10080).default(60), reason: z.string().min(1).max(300) }));
      const target = (await db.select({ userId: users.userId, displayName: users.displayName, email: users.email }).from(users).where(eq(users.email, body.email.toLowerCase().trim())).limit(1))[0];
      if (!target) throw notFound("找不到這個 Email 對應的使用者");
      const token = randomToken(32);
      await db.insert(passwordResetTokens).values({ userId: target.userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + body.expiresMinutes * 60_000) });
      await adminLog({ actorId: admin.userId, action: "password-reset-link.create", targetType: "user", targetId: target.userId, reason: body.reason, after: { expiresMinutes: body.expiresMinutes }, ip: ctx.ip });
      const origin = new URL(ctx.req.url).origin;
      const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
      await recordGeneratedLink({ actorId: admin.userId, kind: "password_reset", targetType: "user", targetId: target.userId, recipient: target.email, url: link, expiresAt: new Date(Date.now() + body.expiresMinutes * 60_000), reason: body.reason, metadata: { source: "password-reset-links" } });
      return {
        link,
        expiresAt: new Date(Date.now() + body.expiresMinutes * 60_000).toISOString(),
        customerMessage: `${target.displayName} 您好，\n\n這裡是 StudyNova 客服。依您提出的「${body.reason}」，我們已為您建立密碼重設連結。請於 ${body.expiresMinutes} 分鐘內點擊下方連結完成設定；連結僅能使用一次。\n\n${link}\n\n若這不是您提出的申請，請忽略此信件。` ,
      };
    },
  }),

  route({
    method: "POST",
    path: "/admin/action-links",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ kind: z.enum(["password_reset", "appeal", "reactivate", "pro_reward", "nova_reward"]), email: z.string().email().optional(), value: z.number().int().min(1).max(3650).optional(), expiresMinutes: z.number().int().min(10).max(10080).default(60), reason: z.string().max(300).optional(), baseUrl: z.string().url().optional() }));
      const origin = body.baseUrl ?? new URL(ctx.req.url).origin;
      if (body.kind === "password_reset") {
        if (!body.email) throw badRequest("密碼重設連結需要使用者 Email");
        const target = (await db.select({ userId: users.userId, displayName: users.displayName, email: users.email }).from(users).where(eq(users.email, body.email.toLowerCase().trim())).limit(1))[0];
        if (!target) throw notFound("找不到這個 Email 對應的使用者");
        const token = randomToken(32);
        const expiresAt = new Date(Date.now() + body.expiresMinutes * 60_000);
        await db.insert(passwordResetTokens).values({ userId: target.userId, tokenHash: sha256(token), expiresAt });
        const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
        await recordGeneratedLink({ actorId: admin.userId, kind: "password_reset", targetType: "user", targetId: target.userId, recipient: target.email, url: link, expiresAt, reason: body.reason ?? "管理員連結中心", metadata: { source: "action-links" } });
        await adminLog({ actorId: admin.userId, action: "action-link.password-reset", targetType: "user", targetId: target.userId, reason: "管理員連結中心", after: { expiresMinutes: body.expiresMinutes }, ip: ctx.ip });
        return { kind: body.kind, link, expiresAt: expiresAt.toISOString(), label: "密碼重設連結", customerMessage: accountLinkCopy({ kind: body.kind, link, expiresText: `${body.expiresMinutes} 分鐘`, reason: body.reason }) };
      }
      if (body.kind === "appeal") { const link = `${origin}/login?appeal=1`; return { kind: body.kind, link, label: "帳號申訴入口", customerMessage: accountLinkCopy({ kind: body.kind, link, reason: body.reason }) }; }
      if (body.kind === "reactivate") { const link = `${origin}/login`; return { kind: body.kind, link, label: "帳號重新啟動入口", customerMessage: accountLinkCopy({ kind: body.kind, link, reason: body.reason }) }; }
      const code = `SN-${body.kind === "pro_reward" ? "PRO" : "NOVA"}-${randomToken(8).toUpperCase()}`;
      const coupon = await db.insert(coupons).values({ code, kind: body.kind === "pro_reward" ? "pro" : "nova", value: body.value ?? (body.kind === "pro_reward" ? 30 : 100), maxRedemptions: 1, endsAt: new Date(Date.now() + body.expiresMinutes * 60_000), createdBy: admin.userId }).returning({ id: coupons.id, code: coupons.code, endsAt: coupons.endsAt, value: coupons.value });
      await adminLog({ actorId: admin.userId, action: `action-link.${body.kind}`, targetType: "coupon", targetId: coupon[0].id, reason: "管理員連結中心", after: coupon[0], ip: ctx.ip });
      const link = `${origin}/profile?tab=pass&coupon=${encodeURIComponent(code)}`;
      await recordGeneratedLink({ actorId: admin.userId, kind: body.kind, targetType: "coupon", targetId: coupon[0].id, recipient: body.email ?? "", url: link, code, value: coupon[0].value, expiresAt: coupon[0].endsAt, reason: body.reason ?? "管理員連結中心", metadata: { source: "action-links", emailProvided: Boolean(body.email) } });
      return { kind: body.kind, link, code, value: coupon[0].value, expiresAt: coupon[0].endsAt?.toISOString?.() ?? null, label: body.kind === "pro_reward" ? "Pro 資格連結" : "Nova 獎勵連結", customerMessage: accountLinkCopy({ kind: body.kind, link, value: coupon[0].value, expiresText: `${body.expiresMinutes} 分鐘`, reason: body.reason }) };
    },
  }),

  route({
    method: "GET",
    path: "/admin/overview",
    auth: "admin",
    handler: async () => {
      const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
      const [proCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.tier, "pro"), sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`));
      const [novaSum] = await db.select({ s: sql<number>`coalesce(sum(${novaAccounts.balance}),0)::int` }).from(novaAccounts);
      const [aiCalls] = await db.select({ c: sql<number>`count(*)::int` }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, monthStart()));
      const [minutes] = await db.select({ m: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` }).from(studyRecords);
      const [weeks] = await db.select({ c: sql<number>`count(*)::int` }).from(weeklyExamWeeks);
      const newUsers = await db
        .select({ day: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`, c: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.createdAt} > now() - interval '14 days'`)
        .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);
      return {
        users: userCount?.c ?? 0,
        pro: proCount?.c ?? 0,
        novaCirculating: novaSum?.s ?? 0,
        aiCallsThisMonth: aiCalls?.c ?? 0,
        totalMinutes: minutes?.m ?? 0,
        weeks: weeks?.c ?? 0,
        newUsers,
      };
    },
  }),

  /* --------------------------------------------------------- users */
  route({
    method: "GET",
    path: "/admin/users",
    auth: "admin",
    handler: async (ctx) => {
      const q = (ctx.query.get("q") ?? "").trim();
      const like = `%${q}%`;
      const rows = await db
        .select({
          userId: users.userId,
          novaId: users.novaId,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
          blockedReason: users.blockedReason,
          blockedAt: users.blockedAt,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
          tier: memberships.tier,
          expiresAt: memberships.expiresAt,
          nova: novaAccounts.balance,
          level: assistantProfiles.level,
          xp: assistantProfiles.xp,
        })
        .from(users)
        .leftJoin(memberships, eq(memberships.userId, users.userId))
        .leftJoin(novaAccounts, eq(novaAccounts.userId, users.userId))
        .leftJoin(assistantProfiles, eq(assistantProfiles.userId, users.userId))
        .where(q ? or(ilike(users.novaId, like), ilike(users.email, like), ilike(users.displayName, like)) : sql`true`)
        .orderBy(desc(users.createdAt))
        .limit(100);
      return { users: rows };
    },
  }),

  route({
    method: "POST",
    path: "/admin/usage/reset-all",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ reason: z.string().min(1).max(300), feature: z.string().max(60).optional() }));
      await db.delete(featureUsage).where(body.feature ? eq(featureUsage.feature, body.feature) : sql`true`);
      await adminLog({ actorId: admin.userId, action: "usage.reset_all", targetType: "system", targetId: "feature_usage", reason: body.reason, ip: ctx.ip });
      return { ok: true };
    },
  }),

  route({
    method: "POST",
    path: "/admin/users/bulk",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          userIds: z.array(z.string().uuid()).min(1).max(200),
          action: z.enum(["block", "unblock", "grant_pro", "extend_pro", "revoke_pro", "gift_nova", "gift_xp", "reset_quota", "set_unlimited", "set_role", "send_notification", "logout"]),
          reason: z.string().min(1, "請填寫操作原因").max(300),
          amount: z.number().int().min(-100000).max(100000).optional(),
          days: z.number().int().min(1).max(3650).optional(),
          feature: z.string().max(60).optional(),
          role: z.enum(["student", "admin"]).optional(),
          title: z.string().max(120).optional(),
          message: z.string().max(400).optional(),
          link: z.string().max(240).optional(),
        }),
      );
      const results: Array<{ userId: string; ok: boolean; detail: string }> = [];
      for (const userId of body.userIds) {
        try {
          const before = (await db.select().from(users).where(eq(users.userId, userId)).limit(1))[0];
          if (!before) throw notFound("找不到使用者");
          if (before.role === "owner" && ["block", "set_role", "revoke_pro"].includes(body.action) && before.userId !== admin.userId) {
            throw fail("ADMIN_TARGET_PROTECTED");
          }
          switch (body.action) {
            case "block":
            case "unblock": {
              const blocked = body.action === "block";
              const blockedAt = blocked ? new Date() : null;
              const blockedUntil = blocked && body.days ? new Date(blockedAt!.getTime() + body.days * 86400000) : null;
              await db.update(users).set({ status: blocked ? "blocked" : "active", blockedReason: blocked ? body.reason : "", blockedAt, blockedUntil, updatedAt: new Date() }).where(eq(users.userId, userId));
              if (blocked) await db.delete(sessions).where(eq(sessions.userId, userId));
              break;
            }
            case "set_role": {
              if (!body.role) throw fail("ADMIN_MISSING_PARAM", { message: "請選擇角色" });
              await db.update(users).set({ role: body.role, updatedAt: new Date() }).where(eq(users.userId, userId));
              break;
            }
            case "grant_pro":
            case "extend_pro": {
              await grantMembership({ userId, days: body.days ?? 30, actorId: admin.userId, reason: body.reason, action: body.action === "grant_pro" ? "grant" : "extend" });
              break;
            }
            case "revoke_pro": {
              await grantMembership({ userId, days: 0, actorId: admin.userId, reason: body.reason, action: "revoke" });
              break;
            }
            case "gift_nova": {
              if (!body.amount) throw fail("ADMIN_MISSING_PARAM", { message: "請輸入 Nova 數量" });
              await grantNova({
                userId,
                amount: body.amount,
                reason: body.reason,
                source: "admin",
                actorId: admin.userId,
                idempotencyKey: `adminnova:${admin.userId}:${userId}:${Date.now()}`,
              });
              await notify({ userId, kind: "reward", title: `🎁 管理員贈送 ${body.amount} Nova`, body: body.reason, link: "/profile?tab=nova", push: true });
              break;
            }
            case "gift_xp": {
              if (!body.amount || body.amount <= 0) throw fail("ADMIN_MISSING_PARAM", { message: "請輸入大於 0 的 XP 數量" });
              await grantXp({ userId, amount: body.amount, reason: body.reason, idempotencyKey: `adminxp:${admin.userId}:${userId}:${Date.now()}` });
              break;
            }
            case "reset_quota": {
              await db.delete(featureUsage).where(and(eq(featureUsage.userId, userId), body.feature ? eq(featureUsage.feature, body.feature) : sql`true`));
              break;
            }
            case "logout": {
              await db.delete(sessions).where(eq(sessions.userId, userId));
              break;
            }
            case "send_notification": {
              if (!body.title || !body.message) throw fail("ADMIN_MISSING_PARAM", { message: "請輸入通知標題與內容" });
              await notify({ userId, kind: "admin_notice", title: body.title, body: body.message, link: body.link ?? "/dashboard", push: true, dedupeKey: `adminnotice:${admin.userId}:${userId}:${Date.now()}` });
              break;
            }
            case "set_unlimited": {
              if (!body.feature) throw fail("ADMIN_MISSING_PARAM", { message: "請指定功能" });
              const today = new Date().toISOString().slice(0, 10);
              await db
                .insert(featureUsage)
                .values({ userId, feature: body.feature, usageDate: today, unlimited: true })
                .onConflictDoUpdate({ target: [featureUsage.userId, featureUsage.feature, featureUsage.usageDate], set: { unlimited: true } });
              break;
            }
          }
          const after = (await db.select().from(users).where(eq(users.userId, userId)).limit(1))[0];
          await adminLog({ actorId: admin.userId, action: `user.${body.action}`, targetType: "user", targetId: userId, reason: body.reason, before, after, ip: ctx.ip });
          results.push({ userId, ok: true, detail: "完成" });
        } catch (err) {
          results.push({ userId, ok: false, detail: err instanceof Error ? err.message : "失敗" });
        }
      }
      return { results };
    },
  }),

  route({
    method: "GET",
    path: "/admin/users/:id",
    auth: "admin",
    handler: async (ctx) => {
      const u = (await db.select().from(users).where(eq(users.userId, ctx.params.id)).limit(1))[0];
      if (!u) throw notFound("找不到使用者");
      const m = (await db.select().from(memberships).where(eq(memberships.userId, u.userId)).limit(1))[0];
      const nova = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, u.userId)).limit(1))[0];
      const ledger = await db.select().from(novaTransactions).where(eq(novaTransactions.userId, u.userId)).orderBy(desc(novaTransactions.createdAt)).limit(30);
      const usage = await db.select().from(featureUsage).where(eq(featureUsage.userId, u.userId)).orderBy(desc(featureUsage.usageDate)).limit(40);
      return { user: { ...u, passwordHash: undefined }, membership: m, nova, ledger, usage };
    },
  }),

  /* ------------------------------------------------ feature control */
  route({
    method: "GET",
    path: "/admin/service-control",
    auth: "admin",
    handler: async () => {
      const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
      const value = (row?.value ?? {}) as { enabled?: boolean; message?: string };
      return { enabled: value.enabled !== false, message: value.message ?? "服務目前暫停中，請稍後再試。" };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/service-control",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ enabled: z.boolean(), message: z.string().max(240).default("服務目前暫停中，請稍後再試。") }));
      await db.insert(platformSettings).values({ key: "service_control", value: body, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { value: body, updatedAt: new Date() } });
      await adminLog({ actorId: admin.userId, action: body.enabled ? "service.enable" : "service.disable", targetType: "platform", targetId: "service_control", after: body, ip: ctx.ip });
      return body;
    },
  }),
  route({
    method: "GET",
    path: "/admin/features",
    auth: "admin",
    handler: async () => {
      try {
        return { features: await db.select().from(featurePermissions).orderBy(asc(featurePermissions.feature)) };
      } catch {
        const features = await db.select({
          id: featurePermissions.id,
          feature: featurePermissions.feature,
          label: featurePermissions.label,
          enabled: featurePermissions.enabled,
          proOnly: featurePermissions.proOnly,
          freeDailyLimit: featurePermissions.freeDailyLimit,
          proDailyLimit: featurePermissions.proDailyLimit,
          monthlyLimit: featurePermissions.monthlyLimit,
          novaCost: featurePermissions.novaCost,
          updatedAt: featurePermissions.updatedAt,
        }).from(featurePermissions).orderBy(asc(featurePermissions.feature));
        return { features: features.map((feature) => ({ ...feature, category: "系統與其他" })) };
      }
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/features/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          enabled: z.boolean().optional(),
          category: z.string().max(40).optional(),
          proOnly: z.boolean().optional(),
          freeDailyLimit: z.number().int().min(-1).max(100000).optional(),
          proDailyLimit: z.number().int().min(-1).max(100000).optional(),
          monthlyLimit: z.number().int().min(0).max(1000000).optional(),
          novaCost: z.number().int().min(0).max(10000).optional(),
          announce: z.boolean().default(true),
        }),
      );
      const before = (await db.select().from(featurePermissions).where(eq(featurePermissions.id, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到功能設定");
      const { announce, ...updates } = body;
      const rows = await db.update(featurePermissions).set({ ...updates, updatedAt: new Date() }).where(eq(featurePermissions.id, ctx.params.id)).returning();
      if (announce && body.enabled !== undefined && before.enabled !== body.enabled) {
        const announcement = (await db.insert(announcements).values({ title: `功能${body.enabled ? "已開啟" : "已暫停"}：${before.label}`, body: `管理員已${body.enabled ? "開啟" : "關閉"}「${before.label}」，請重新整理頁面查看最新狀態。`, audience: "all", audienceIds: [], pinned: false, marquee: false, notify: true, push: false, sortOrder: 0, startsAt: new Date(), endsAt: null, createdBy: admin.userId }).returning())[0];
        for (const userId of await resolveAudience("all", [])) await notify({ userId, kind: "announcement", title: `📢 ${announcement.title}`, body: announcement.body, link: "/dashboard", dedupeKey: `ann:${announcement.id}:${userId}` });
      }
      await adminLog({ actorId: admin.userId, action: "feature.update", targetType: "feature", targetId: before.feature, before, after: rows[0], ip: ctx.ip });
      return { feature: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/admin/features/bulk",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ enabled: z.boolean(), category: z.string().max(40).optional() }));
      const all = await db.select().from(featurePermissions);
      const selected = body.category ? all.filter((feature) => feature.category === body.category || feature.feature.startsWith(`${body.category}:`)) : all;
      if (!selected.length) return { updated: 0 };
      for (const feature of selected) {
        await db.update(featurePermissions).set({ enabled: body.enabled, updatedAt: new Date() }).where(eq(featurePermissions.id, feature.id));
        await adminLog({ actorId: admin.userId, action: "feature.bulk_update", targetType: "feature", targetId: feature.feature, reason: body.enabled ? "bulk_enable" : "bulk_disable", before: feature, after: { ...feature, enabled: body.enabled }, ip: ctx.ip });
      }
      return { updated: selected.length, enabled: body.enabled, category: body.category ?? "all" };
    },
  }),

  /* -------------------------------------------------- announcements */
  route({
    method: "GET",
    path: "/admin/announcements",
    auth: "admin",
    handler: async () => ({ announcements: await db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(100) }),
  }),

  route({
    method: "POST",
    path: "/admin/announcements",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(120),
          body: z.string().max(4000).default(""),
          link: z.string().max(300).default("/dashboard"),
          targetFeature: z.string().min(1).max(60).default("all"),
          category: z.string().min(1).max(40).default("general"),
          tags: z.union([z.array(z.string().max(30)), z.string()]).transform((value) => (Array.isArray(value) ? value : value.split(",")).map((tag) => tag.trim()).filter(Boolean).slice(0, 12)),
          image: z.string().max(400).default(""),
          audience: z.enum(["all", "pro", "users", "group"]).default("all"),
          audienceIds: z.array(z.string().uuid()).max(500).default([]),
          pinned: z.boolean().default(false),
          marquee: z.boolean().default(false),
          notify: z.boolean().default(true),
          push: z.boolean().default(false),
          email: z.boolean().default(false),
          sortOrder: z.number().int().min(0).max(999).default(0),
          startsAt: z.string().datetime().optional(),
          endsAt: z.string().datetime().nullable().optional(),
        }),
      );
      const rows = await db
        .insert(announcements)
        .values({
          title: body.title,
          body: body.body,
          link: body.link,
          targetFeature: body.targetFeature,
          category: body.category,
          tags: body.tags,
          image: body.image,
          audience: body.audience,
          audienceIds: body.audienceIds,
          pinned: body.pinned,
          marquee: body.marquee,
          notify: body.notify,
          push: body.push,
          email: body.email,
          sortOrder: body.sortOrder,
          startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          createdBy: admin.userId,
        })
        .returning();
      const scheduled = Boolean(body.startsAt && new Date(body.startsAt) > new Date());
      if (scheduled) await queue().enqueue({ name: "announcement_publish", payload: { announcementId: rows[0].id }, uniqueKey: `announcement-publish:${rows[0].id}`, runAt: new Date(body.startsAt!) });
      let notified = 0;
      let emailSent = 0;
      if (body.notify && !scheduled) {
        const targets = await resolveAudience(body.audience, body.audienceIds);
        for (const userId of targets) {
          const created = await notify({
            userId,
            kind: "announcement",
            title: `📢 ${body.title}`,
            body: body.body.slice(0, 200),
            link: body.link,
            dedupeKey: `ann:${rows[0].id}:${userId}`,
            push: body.push,
          });
          if (created) notified += 1;
        }
      }
      if (body.email && !scheduled) {
        const targets = await resolveAudience(body.audience, body.audienceIds);
        for (const userId of targets) {
          const target = (await db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.userId, userId)).limit(1))[0];
          if (!target?.email) continue;
          const result = await sendAccountEmail(target.email, systemAnnouncementEmailTemplate({ displayName: target.displayName, title: body.title, body: body.body, link: body.link, category: body.category, tags: body.tags }));
          if (result.sent) emailSent += 1;
        }
      }
      await adminLog({ actorId: admin.userId, action: "announcement.create", targetType: "announcement", targetId: rows[0].id, after: { title: body.title, notified, emailSent }, ip: ctx.ip });
      return { announcement: rows[0], notified, emailSent, scheduled };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/announcements/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({ pinned: z.boolean().optional(), marquee: z.boolean().optional(), sortOrder: z.number().int().min(0).max(999).optional(), title: z.string().min(1).max(120).optional(), body: z.string().max(4000).optional(), link: z.string().max(300).optional(), targetFeature: z.string().min(1).max(60).optional(), endsAt: z.string().datetime().nullable().optional() }),
      );
      const { endsAt, ...patch } = body;
      const rows = await db.update(announcements).set({ ...patch, ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}) }).where(eq(announcements.id, ctx.params.id)).returning();
      if (!rows[0]) throw notFound("找不到公告");
      return { announcement: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/announcements/:id",
    auth: "admin",
    handler: async (ctx) => {
      await db.delete(announcements).where(eq(announcements.id, ctx.params.id));
      return { deleted: true };
    },
  }),

  /* ------------------------------------------------------ activities */
  route({
    method: "GET",
    path: "/admin/activities",
    auth: "admin",
    handler: async () => {
      const rows = await db.select().from(activities).orderBy(asc(activities.sortOrder), desc(activities.startsAt));
      const out = [];
      for (const a of rows) {
        const [p] = await db.select({ c: sql<number>`count(*)::int`, done: sql<number>`sum(case when ${activityParticipants.completedAt} is not null then 1 else 0 end)::int` }).from(activityParticipants).where(eq(activityParticipants.activityId, a.id));
        out.push({ ...a, participants: p?.c ?? 0, completed: p?.done ?? 0 });
      }
      return { activities: out };
    },
  }),

  route({
    method: "POST",
    path: "/admin/activities",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(80),
          description: z.string().max(1000).default(""),
          accessSchoolName: z.string().trim().max(120).default(""),
          cover: z.string().max(8).default("🎉"),
          kind: z.enum(["weekend_double", "festival", "limited", "streak", "quiz", "focus"]).default("limited"),
          goalMetric: z.enum(["minutes", "quiz", "words", "wrong"]).default("minutes"),
          goalValue: z.number().int().min(1).max(100000),
          rewardNova: z.number().int().min(0).max(10000),
          rewardXp: z.number().int().min(0).max(100000),
          questionSources: z.array(z.enum(["activity", "general_bank", "imported_files", "weekly_exams"])).min(1).max(4).default(["activity"]),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          published: z.boolean().default(false),
          notifyOnStart: z.boolean().default(true),
          sortOrder: z.number().int().min(0).max(999).default(0),
        }),
      );
      const rows = await db
        .insert(activities)
        .values({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) })
        .returning();
      const activityId = rows[0].id;
      if (body.published && new Date(body.startsAt) > new Date()) await queue().enqueue({ name: "activity_promote", payload: { activityId }, uniqueKey: `activity-promote:${activityId}`, runAt: new Date(body.startsAt) });
      const sourceQuestions = [] as Array<{ activityId: string; subject: string; type: string; stem: string; options: string[]; answer: string[]; explanation: string; orderIndex: number }>;
      if (body.questionSources.includes("general_bank") || body.questionSources.includes("imported_files")) {
        const origins = body.questionSources.includes("general_bank") && body.questionSources.includes("imported_files") ? ["bank", "admin"] : body.questionSources.includes("imported_files") ? ["bank"] : ["admin"];
        const imported = await db.select().from(questions).where(inArray(questions.origin, origins)).limit(500);
        sourceQuestions.push(...imported.map((q, index) => ({ activityId, subject: q.subject, type: q.type, stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, orderIndex: index })));
      }
      if (body.questionSources.includes("weekly_exams")) {
        const weekly = await db.select().from(weeklyExamQuestions).where(eq(weeklyExamQuestions.published, true)).limit(500);
        sourceQuestions.push(...weekly.map((q, index) => ({ activityId, subject: "英文", type: "single", stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, orderIndex: sourceQuestions.length + index })));
      }
      if (sourceQuestions.length) await db.insert(activityQuestions).values(sourceQuestions);
      await adminLog({ actorId: admin.userId, action: "activity.create", targetType: "activity", targetId: rows[0].id, after: { title: body.title }, ip: ctx.ip });
      return { activity: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/activities/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(80).optional(),
          description: z.string().max(1000).optional(),
          accessSchoolName: z.string().trim().max(120).optional(),
          published: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(999).optional(),
          goalValue: z.number().int().min(1).max(100000).optional(),
          rewardNova: z.number().int().min(0).max(10000).optional(),
          rewardXp: z.number().int().min(0).max(100000).optional(),
          startsAt: z.string().datetime().optional(),
          endsAt: z.string().datetime().optional(),
        }),
      );
      const patch: Record<string, unknown> = { ...body };
      if (body.startsAt) patch.startsAt = new Date(body.startsAt);
      if (body.endsAt) patch.endsAt = new Date(body.endsAt);
      const rows = await db.update(activities).set(patch).where(eq(activities.id, ctx.params.id)).returning();
      if (!rows[0]) throw notFound("找不到活動");
      return { activity: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/admin/activities/:id/questions",
    auth: "admin",
    handler: async (ctx) => ({ questions: await db.select().from(activityQuestions).where(eq(activityQuestions.activityId, ctx.params.id)).orderBy(asc(activityQuestions.orderIndex)) }),
  }),
  route({
    method: "POST",
    path: "/admin/activities/:id/questions",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ questions: z.array(z.object({ subject: z.string().max(30).default("英文"), type: z.string().max(30).default("single"), stem: z.string().min(1).max(10000), options: z.array(z.string().max(500)).max(12).default([]), answer: z.array(z.string().max(500)).min(1).max(12), explanation: z.string().max(20000).default(""), orderIndex: z.number().int().min(0).default(0) })).min(1).max(500) }));
      const activity = (await db.select({ id: activities.id }).from(activities).where(eq(activities.id, ctx.params.id)).limit(1))[0];
      if (!activity) throw notFound("找不到活動");
      const rows = await db.insert(activityQuestions).values(body.questions.map((q) => ({ ...q, activityId: ctx.params.id }))).returning();
      return { questions: rows };
    },
  }),
  route({
    method: "DELETE",
    path: "/admin/activities/:id/questions/:qid",
    auth: "admin",
    handler: async (ctx) => { await db.delete(activityQuestions).where(and(eq(activityQuestions.id, ctx.params.qid), eq(activityQuestions.activityId, ctx.params.id))); return { deleted: true }; },
  }),
  route({
    method: "POST",
    path: "/admin/activities/:id/duplicate",
    auth: "admin",
    handler: async (ctx) => {
      const src = (await db.select().from(activities).where(eq(activities.id, ctx.params.id)).limit(1))[0];
      if (!src) throw notFound("找不到活動");
      const rows = await db
        .insert(activities)
        .values({ ...src, id: undefined as never, title: `${src.title}（複製）`, published: false, createdAt: undefined as never })
        .returning();
      return { activity: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/activities/:id",
    auth: "admin",
    handler: async (ctx) => {
      await db.delete(activities).where(eq(activities.id, ctx.params.id));
      return { deleted: true };
    },
  }),

  /* --------------------------------------------------------- coupons */
  route({
    method: "GET",
    path: "/admin/coupons",
    auth: "admin",
    handler: async () => {
      const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(100);
      return { coupons: rows };
    },
  }),

  route({
    method: "POST",
    path: "/admin/coupons/generate",
    auth: "admin",
    handler: async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = `SN-${randomToken(8).replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
        const exists = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
        if (!exists[0]) return { code };
      }
      throw fail("SYS_CONFLICT", { message: "暫時無法產生唯一優惠碼，請稍後再試" });
    },
  }),
  route({
    method: "POST",
    path: "/admin/coupons",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          code: z.string().min(3).max(40),
          kind: z.enum(["nova", "xp", "pro"]),
          value: z.number().int().min(1).max(100000),
          maxRedemptions: z.number().int().min(1).max(100000).default(1),
          endsAt: z.string().datetime().nullable().optional(),
        }),
      );
      const rows = await db
        .insert(coupons)
        .values({ code: body.code.toUpperCase().trim(), kind: body.kind, value: body.value, maxRedemptions: body.maxRedemptions, endsAt: body.endsAt ? new Date(body.endsAt) : null, createdBy: admin.userId })
        .onConflictDoNothing()
        .returning();
      if (!rows[0]) throw fail("ADMIN_COUPON_EXISTS");
      await adminLog({ actorId: admin.userId, action: "coupon.create", targetType: "coupon", targetId: rows[0].id, after: { code: body.code }, ip: ctx.ip });
      return { coupon: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/coupons/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ enabled: z.boolean() }));
      const rows = await db.update(coupons).set(body).where(eq(coupons.id, ctx.params.id)).returning();
      if (!rows[0]) throw notFound("找不到優惠碼");
      const used = await db.select({ c: sql<number>`count(*)::int` }).from(couponRedemptions).where(eq(couponRedemptions.couponId, rows[0].id));
      return { coupon: rows[0], used: used[0]?.c ?? 0 };
    },
  }),

  /* -------------------------------------------------------- AI admin */
  route({
    method: "GET",
    path: "/admin/ai/health",
    auth: "admin",
    handler: async () => {
      const metrics = await providerMetrics();
      const failures = await recentAiFailures(15);
      const byFeature = await db
        .select({ feature: aiUsageLogs.feature, c: sql<number>`count(*)::int`, ok: sql<number>`sum(case when ${aiUsageLogs.success} then 1 else 0 end)::int` })
        .from(aiUsageLogs)
        .where(gte(aiUsageLogs.createdAt, monthStart()))
        .groupBy(aiUsageLogs.feature)
        .orderBy(desc(sql`count(*)`));
      return { providers: metrics, failures, byFeature, configured: aiConfigured(), updatedAt: new Date().toISOString() };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/ai/providers/:provider",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          enabled: z.boolean().optional(),
          model: z.string().max(80).optional(),
          inputRatePerMillion: z.number().min(0).max(1000).optional(),
          outputRatePerMillion: z.number().min(0).max(1000).optional(),
          clearCooldown: z.boolean().optional(),
        }),
      );
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (body.enabled !== undefined) patch.enabled = body.enabled;
      if (body.model) patch.model = body.model;
      if (body.inputRatePerMillion !== undefined) patch.inputRatePerMillion = body.inputRatePerMillion;
      if (body.outputRatePerMillion !== undefined) patch.outputRatePerMillion = body.outputRatePerMillion;
      if (body.clearCooldown) patch.cooldownUntil = null;
      const rows = await db.update(aiProviderHealth).set(patch).where(eq(aiProviderHealth.provider, ctx.params.provider)).returning();
      if (!rows[0]) throw notFound("找不到 AI Provider 紀錄");
      await adminLog({ actorId: admin.userId, action: "ai.provider.update", targetType: "provider", targetId: ctx.params.provider, after: patch, ip: ctx.ip });
      return { provider: rows[0] };
    },
  }),

  /* ----------------------------------------------------- question bank */
  route({
    method: "POST",
    path: "/admin/questions/generate",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ prompt: z.string().max(4000).default(""), subject: z.string().min(1).max(40), educationLevel: z.string().max(40).default(""), grade: z.string().max(40).default(""), chapter: z.string().max(120).default(""), topic: z.string().max(120).default(""), types: z.array(z.string().max(40)).min(1).max(8).default(["single"]), count: z.number().int().min(1).max(100).default(10), difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).default("normal"), referenceText: z.string().max(30000).default(""), requireExplanation: z.boolean().default(true) }));
      const instruction = `請產生 ${body.count} 題${body.subject}題目。教育階段：${body.educationLevel}；年級：${body.grade}；章節：${body.chapter}；主題：${body.topic}；題型可使用：${body.types.join(",")}；難度：${body.difficulty}。${body.prompt}\n${body.referenceText ? `只能根據以下參考資料，不要捏造：\n${body.referenceText}` : ""}`;
      const result = await runAiJson<unknown[]>({ feature: "admin_question_generation", userId: admin.userId, system: "你是 StudyNova 題庫出題器。只回傳 JSON 陣列，每題欄位 question, type, options, answer, explanation, subject, topic, difficulty。答案必須可由題目與資料支持；不要輸出 Markdown。", parts: [{ kind: "text", text: instruction }], maxOutputTokens: Math.min(12000, 900 * body.count) }, []);
      const level = body.educationLevel.toLowerCase().includes("senior") || body.educationLevel.includes("高中") ? "senior" : "junior";
      const normalized = normalizeQuestionRows(result.data, { subject: body.subject, difficulty: body.difficulty, level, sourceLabel: "AI 生成草稿", bankCategory: "AI 生成待審核" });
      const previews = normalized.previews.map((item) => ({ ...item, status: item.status === "READY" && body.requireExplanation && !item.explanation ? "WARNING" : item.status, sourceType: "ai", reviewStatus: "draft" }));
      await adminLog({ actorId: admin.userId, action: "questions.generate", targetType: "question_draft", targetId: "preview", after: { subject: body.subject, count: body.count, generated: previews.length, errors: previews.filter((item) => item.status === "ERROR").length }, ip: ctx.ip });
      return { drafts: previews, summary: { requested: body.count, generated: previews.length, ready: previews.filter((item) => item.status === "READY").length, warnings: previews.filter((item) => item.status === "WARNING").length, errors: previews.filter((item) => item.status === "ERROR").length } };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/generate-file",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const form = await ctx.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw badRequest("請選擇要分析的檔案");
      if (file.size > 18 * 1024 * 1024) throw badRequest("檔案不可超過 18MB");
      const subject = String(form.get("subject") || "").trim();
      if (!subject) throw badRequest("請先選擇科目");
      const count = Math.max(1, Math.min(100, Number(form.get("count") || 10)));
      const rawDifficulty = String(form.get("difficulty") || "normal");
      const difficulty = (["easy", "normal", "hard", "exam", "advanced"] as const).includes(rawDifficulty as "easy" | "normal" | "hard" | "exam" | "advanced") ? rawDifficulty as "easy" | "normal" | "hard" | "exam" | "advanced" : "normal";
      const educationLevel = String(form.get("educationLevel") || "junior");
      const level = educationLevel.toLowerCase().includes("senior") || educationLevel.includes("高中") ? "senior" : "junior";
      const prompt = String(form.get("prompt") || "").slice(0, 4000);
      const referenceText = String(form.get("referenceText") || "").slice(0, 30000);
      const bytes = Buffer.from(await file.arrayBuffer());
      const isText = file.type.startsWith("text/") || file.type === "application/json" || /\.(json|csv|txt)$/i.test(file.name);
      const source = isText ? bytes.toString("utf8").slice(0, 30000) : "";
      const instruction = `請根據附件完整內容產生 ${count} 題${subject}題目。難度：${difficulty}。${prompt}\n${referenceText ? `補充參考資料：\n${referenceText}` : ""}${source ? `\n文字附件內容：\n${source}` : ""}`;
      const result = await runAiJson<unknown[]>({
        feature: "admin_question_generation_file",
        userId: admin.userId,
        system: "你是 StudyNova 題庫出題器。只回傳 JSON 陣列，每題欄位 question, type, options, answer, explanation, subject, topic, difficulty。必須根據附件內容，不得捏造；答案不確定時在 explanation 標記待審核。",
        parts: isText ? [{ kind: "text", text: instruction }] : [{ kind: "text", text: instruction }, { kind: file.type.startsWith("audio/") ? "audio" : "image", mimeType: file.type || "application/octet-stream", base64: bytes.toString("base64") }],
        maxOutputTokens: Math.min(12000, 900 * count),
      }, []);
      const normalized = normalizeQuestionRows(result.data, { subject, difficulty, level, sourceLabel: file.name, bankCategory: "AI 檔案出題待審核" });
      const drafts = normalized.previews.map((item) => ({ ...item, sourceType: "file", sourceFile: file.name, reviewStatus: "draft" }));
      await adminLog({ actorId: admin.userId, action: "questions.generate.file", targetType: "question_draft", targetId: file.name.slice(0, 120), after: { subject, count, generated: drafts.length }, ip: ctx.ip });
      return { drafts, summary: { requested: count, generated: drafts.length, ready: drafts.filter((item) => item.status === "READY").length, warnings: drafts.filter((item) => item.status === "WARNING").length, errors: drafts.filter((item) => item.status === "ERROR").length } };
    },
  }),
  route({
    method: "GET",
    path: "/admin/question-banks",
    auth: "admin",
    handler: async (ctx) => {
      const subject = ctx.query.get("subject");
      const status = ctx.query.get("status");
      const rows = await db.select({ bank: questionBanks, questionCount: sql<number>`(select count(*) from ${questions} where ${questions.bankId} = ${questionBanks.id})::int` }).from(questionBanks).where(and(subject ? eq(questionBanks.subject, subject) : sql`true`, status ? eq(questionBanks.status, status) : sql`true`)).orderBy(desc(questionBanks.updatedAt));
      return { banks: rows };
    },
  }),
  route({
    method: "POST",
    path: "/admin/question-banks",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ name: z.string().min(1).max(120), description: z.string().max(3000).default(""), subject: z.string().min(1).max(40), grade: z.string().max(40).default(""), educationLevel: z.string().max(40).default(""), semester: z.string().max(40).default(""), publisher: z.string().max(120).default(""), source: z.string().max(300).default(""), tags: z.array(z.string().max(60)).max(30).default([]), visibility: z.enum(["private", "school", "public"]).default("private") }));
      const rows = await db.insert(questionBanks).values({ ...body, createdBy: admin.userId }).returning();
      await adminLog({ actorId: admin.userId, action: "question-bank.create", targetType: "question_bank", targetId: rows[0].id, after: body, ip: ctx.ip });
      return { bank: rows[0] };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/question-banks/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(3000).optional(), subject: z.string().min(1).max(40).optional(), grade: z.string().max(40).optional(), educationLevel: z.string().max(40).optional(), semester: z.string().max(40).optional(), publisher: z.string().max(120).optional(), source: z.string().max(300).optional(), tags: z.array(z.string().max(60)).max(30).optional(), visibility: z.enum(["private", "school", "public"]).optional(), status: z.enum(["draft", "review", "published", "archived"]).optional() }));
      const rows = await db.update(questionBanks).set({ ...body, updatedAt: new Date() }).where(eq(questionBanks.id, ctx.params.id)).returning();
      if (!rows[0]) throw notFound("找不到題庫");
      await adminLog({ actorId: admin.userId, action: "question-bank.update", targetType: "question_bank", targetId: rows[0].id, after: body, ip: ctx.ip });
      return { bank: rows[0] };
    },
  }),
  route({
    method: "POST",
    path: "/admin/question-imports",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ totalFiles: z.number().int().min(1).max(50), bankCategory: z.string().min(1).max(40), sourceLabel: z.string().min(1).max(120), targetBank: z.enum(["general", "activity", "exclusive", "weekly"]) }));
      const job = (await db.insert(questionImportJobs).values({ adminId: admin.userId, totalFiles: body.totalFiles, bankCategory: body.bankCategory, sourceLabel: body.sourceLabel, targetBank: body.targetBank, status: "uploading" }).returning())[0];
      return { jobId: job.id, status: job.status };
    },
  }),
  route({
    method: "GET",
    path: "/admin/question-imports/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const job = (await db.select().from(questionImportJobs).where(and(eq(questionImportJobs.id, ctx.params.id), eq(questionImportJobs.adminId, admin.userId))).limit(1))[0];
      if (!job) throw notFound("找不到匯入工作");
      return { ...job, progress: job.totalFiles ? Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100)) : 0 };
    },
  }),
  route({
    method: "POST",
    path: "/admin/question-imports/:id/auto-metadata",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const job = (await db.select().from(questionImportJobs).where(and(eq(questionImportJobs.id, ctx.params.id), eq(questionImportJobs.adminId, admin.userId))).limit(1))[0];
      if (!job) throw notFound("找不到匯入工作");
      if (!job.preview.length) throw badRequest("目前沒有可分析的題目");
      const sample = job.preview.slice(0, 80).map((item, index) => `${index + 1}. [${item.subject || "?"}/${item.type || "?"}] ${item.stem}`).join("\n").slice(0, 28000);
      const result = await runAiJson<{ name: string; category: string; subject: string; type: string; level: "junior" | "senior" }>({
        feature: "question_bank_auto_metadata",
        userId: admin.userId,
        system: "你是題庫整理助手。只回傳 JSON，欄位 name、category、subject、type、level。根據題目內容判斷主要科目、學段、最常見題型，並取一個清楚且不超過 80 字的繁體中文題庫名稱。不要使用檔名，不要捏造。",
        parts: [{ kind: "text", text: `請分析以下題庫題目，回傳自動分類資訊：\n${sample}` }],
        maxOutputTokens: 800,
      }, { name: "未命名題庫", category: "自動分析題庫", subject: "其他", type: "short", level: "junior" });
      const metadata = result.data;
      const name = String(metadata.name || "自動分析題庫").slice(0, 120);
      const category = String(metadata.category || `${String(metadata.subject || "其他")}題庫`).slice(0, 40);
      const rows = await db.update(questionImportJobs).set({ sourceLabel: name, bankCategory: category, updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id)).returning();
      await adminLog({ actorId: admin.userId, action: "question-import.auto-metadata", targetType: "question_import_job", targetId: job.id, after: { name, category, subject: metadata.subject, type: metadata.type, level: metadata.level }, ip: ctx.ip });
      return { metadata: { ...metadata, name, category }, job: rows[0] };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/question-imports/:id/items",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({
        index: z.number().int().min(0).max(2000).optional(),
        indexes: z.array(z.number().int().min(0).max(2000)).max(2000).optional(),
        patch: z.record(z.string(), z.unknown()).optional(),
        action: z.enum(["include", "exclude", "duplicate", "review"]).optional(),
        field: z.enum(["subject", "level", "difficulty", "type", "topic"]).optional(),
        value: z.string().max(200).optional(),
      }));
      const job = (await db.select().from(questionImportJobs).where(and(eq(questionImportJobs.id, ctx.params.id), eq(questionImportJobs.adminId, admin.userId))).limit(1))[0];
      if (!job) throw notFound("找不到匯入工作");
      if (!["uploading", "analyzing", "ready"].includes(job.status)) throw badRequest("這個匯入工作已不能編輯");
      const indexes = body.indexes ?? (body.index === undefined ? [] : [body.index]);
      if (!indexes.length) throw badRequest("請選擇至少一題");
      const next = job.preview.map((item, index) => {
        if (!indexes.includes(index)) return item;
        const patch = body.patch ?? {};
        const updated = { ...item, ...patch } as Record<string, unknown>;
        if (body.field && body.value !== undefined) updated[body.field] = body.value;
        if (body.action === "exclude") updated.importAction = "exclude";
        if (body.action === "include") updated.importAction = "include";
        if (body.action === "duplicate") updated.status = "DUPLICATE";
        if (body.action === "review") updated.status = "NEEDS_REVIEW";
        return updated;
      });
      const rows = await db.update(questionImportJobs).set({ preview: next, updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id)).returning();
      return { job: rows[0] };
    },
  }),
  route({
    method: "POST",
    path: "/admin/question-imports/:id/confirm",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const job = (await db.select().from(questionImportJobs).where(and(eq(questionImportJobs.id, ctx.params.id), eq(questionImportJobs.adminId, admin.userId))).limit(1))[0];
      if (!job) throw notFound("找不到匯入工作");
      if (job.status !== "ready") throw badRequest("題目尚未分析完成，不能確認匯入");
      let imported = 0;
      for (const item of job.preview) {
        if (item.importAction === "exclude" || item.status === "DUPLICATE") continue;
        const subject = String(item.subject || "其他");
        const stem = String(item.stem || "");
        if (!stem) continue;
        const answer = Array.isArray(item.answer) ? item.answer.map(String) : [];
        const rows = await db.insert(questions).values({ ownerId: null, origin: "bank", targetBank: job.targetBank, bankCategory: job.bankCategory, sourceLabel: job.sourceLabel, subject, topic: String(item.topic || ""), level: item.level === "senior" ? "senior" : "junior", difficulty: String(item.difficulty || "normal"), type: String(item.type || "short"), stem, options: Array.isArray(item.options) ? item.options.map(String) : [], answer, explanation: String(item.explanation || ""), metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {}, fingerprint: fingerprint(subject, stem, answer.join("|")) }).onConflictDoNothing().returning({ id: questions.id });
        if (rows[0]) imported += 1;
      }
      await db.update(questionImportJobs).set({ status: "confirmed", acceptedQuestions: imported, updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id));
      return { jobId: job.id, imported };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/preview",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ items: z.unknown(), subject: z.string().max(20).optional(), bankCategory: z.string().max(40).optional(), sourceLabel: z.string().max(120).optional(), level: z.enum(["junior", "senior"]).optional(), difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).optional() }));
      const result = normalizeQuestionRows(body.items, body);
      await adminLog({ actorId: admin.userId, action: "questions.preview", targetType: "questions", targetId: "preview", after: { total: result.previews.length, errors: result.previews.filter((item) => item.status === "ERROR").length }, ip: ctx.ip });
      return { ...result, summary: { total: result.previews.length, ready: result.previews.filter((item) => item.status === "READY").length, warnings: result.previews.filter((item) => item.status === "WARNING").length, errors: result.previews.filter((item) => item.status === "ERROR").length, duplicates: result.previews.filter((item) => item.status === "DUPLICATE").length } };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/import",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ items: z.unknown(), subject: z.string().max(20).optional(), bankCategory: z.string().max(40).optional(), sourceLabel: z.string().max(120).optional(), level: z.enum(["junior", "senior"]).optional(), difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).optional() }));
      const preview = normalizeQuestionRows(body.items, body).previews;
      let accepted = 0;
      let imported = 0;
      let skipped = 0;
      const invalid = preview.flatMap((item) => item.issues.filter((issue) => issue.severity === "error").map((issue) => ({ index: item.index, field: issue.field, code: issue.code, error: issue.message })));
      for (const q of preview) {
        if (q.status === "ERROR" || q.status === "DUPLICATE") { skipped += 1; continue; }
        accepted += 1;
        const rows = await db.insert(questions).values({ ownerId: null, origin: "bank", targetBank: "general", bankCategory: q.bankCategory, sourceLabel: q.sourceLabel, subject: q.subject, topic: q.topic, level: q.level, difficulty: q.difficulty, type: q.type, stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, metadata: q.metadata, fingerprint: q.fingerprint }).onConflictDoNothing().returning({ id: questions.id });
        if (rows[0]) imported += 1; else skipped += 1;
      }
      await adminLog({ actorId: admin.userId, action: "questions.import", targetType: "questions", targetId: "bank", after: { submitted: preview.length, accepted, imported, skipped, invalid: invalid.length }, ip: ctx.ip });
      return { submitted: preview.length, accepted, imported, skipped, invalid, warnings: preview.flatMap((item) => item.issues.filter((issue) => issue.severity === "warning").map((issue) => ({ index: item.index, field: issue.field, code: issue.code, warning: issue.message }))) };
    },
  }),

  route({
    method: "GET",
    path: "/admin/questions",
    auth: "admin",
    handler: async (ctx) => {
      const subject = ctx.query.get("subject");
      const origin = ctx.query.get("origin");
      const rows = await db
        .select({
          id: questions.id,
          origin: questions.origin,
          subject: questions.subject,
          topic: questions.topic,
          level: questions.level,
          difficulty: questions.difficulty,
          type: questions.type,
          stem: questions.stem,
          options: questions.options,
          answer: questions.answer,
          explanation: questions.explanation,
          createdAt: questions.createdAt,
          appearedCount: sql<number>`(select count(*) from ${answers} where ${answers.questionId} = ${questions.id})::int`,
        })
        .from(questions)
        .where(and(origin ? eq(questions.origin, origin) : sql`true`, subject ? eq(questions.subject, subject) : sql`true`))
        .orderBy(desc(questions.createdAt))
        .limit(100);
      const [count] = await db.select({ c: sql<number>`count(*)::int` }).from(questions).where(origin ? eq(questions.origin, origin) : sql`true`);
      return { questions: rows, total: count?.c ?? 0 };
    },
  }),

  route({
    method: "GET",
    path: "/admin/questions/:id",
    auth: "admin",
    handler: async (ctx) => {
      const question = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!question) throw notFound("找不到題目");
      const versions = await db.select().from(questionVersions).where(eq(questionVersions.questionId, question.id)).orderBy(desc(questionVersions.version));
      return { question, versions };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/questions/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const current = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到題目");
      const body = await ctx.json(z.object({ subject: z.string().min(1).max(20).optional(), topic: z.string().max(120).optional(), chapter: z.string().max(120).optional(), unit: z.string().max(120).optional(), level: z.enum(["junior", "senior"]).optional(), difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).optional(), type: z.string().min(1).max(40).optional(), stem: z.string().min(1).max(20000).optional(), options: z.array(z.string().max(2000)).max(20).optional(), answer: z.array(z.string().max(2000)).max(20).optional(), explanation: z.string().max(30000).optional(), tags: z.array(z.string().max(60)).max(30).optional(), points: z.number().int().min(1).max(100).optional(), estimatedSeconds: z.number().int().min(5).max(3600).optional(), status: z.enum(["draft", "review", "published", "archived"]).optional(), changeReason: z.string().max(500).default("管理員編輯") }));
      const { changeReason, ...patch } = body;
      if ((patch.type === "single" || patch.type === "multiple") && patch.options && patch.answer && !patch.answer.every((answer) => patch.options!.includes(answer))) throw badRequest("答案必須存在於選項中");
      const latest = (await db.select({ version: sql<number>`coalesce(max(${questionVersions.version}), 0)::int` }).from(questionVersions).where(eq(questionVersions.questionId, current.id)))[0]?.version ?? 0;
      await db.insert(questionVersions).values({ questionId: current.id, version: latest + 1, snapshot: current as unknown as Record<string, unknown>, changeReason, createdBy: admin.userId });
      const rows = await db.update(questions).set({ ...patch, updatedAt: new Date() }).where(eq(questions.id, current.id)).returning();
      await adminLog({ actorId: admin.userId, action: "question.update", targetType: "question", targetId: current.id, after: patch, ip: ctx.ip });
      return { question: rows[0], version: latest + 1 };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/:id/publish",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ status: z.enum(["review", "published", "archived"]), note: z.string().max(500).default("") }));
      const question = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!question) throw notFound("找不到題目");
      if (body.status === "published" && (!question.stem.trim() || !question.answer.length)) throw badRequest("題目與答案完整後才能發布");
      const rows = await db.update(questions).set({ status: body.status, updatedAt: new Date() }).where(eq(questions.id, question.id)).returning();
      await adminLog({ actorId: admin.userId, action: `question.${body.status}`, targetType: "question", targetId: question.id, after: { note: body.note }, ip: ctx.ip });
      return { question: rows[0] };
    },
  }),
  route({
    method: "DELETE",
    path: "/admin/questions/:id",
    auth: "admin",
    handler: async (ctx) => {
      await db.delete(questions).where(eq(questions.id, ctx.params.id));
      return { deleted: true };
    },
  }),

  route({
    method: "GET",
    path: "/admin/account-appeals",
    auth: "admin",
    handler: async (ctx) => {
      const status = ctx.query.get("status");
      const rows = await db.select({ appeal: accountAppeals, user: { novaId: users.novaId, displayName: users.displayName, status: users.status, blockedAt: users.blockedAt } }).from(accountAppeals).leftJoin(users, eq(users.userId, accountAppeals.userId)).where(status ? eq(accountAppeals.status, status) : sql`true`).orderBy(desc(accountAppeals.createdAt)).limit(100);
      return { appeals: rows.map((row) => ({ ...row.appeal, user: row.user })) };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/account-appeals/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ status: z.enum(["open", "reviewing", "approved", "rejected"]), adminNote: z.string().max(3000).optional(), sendEmail: z.boolean().default(false), baseUrl: z.string().url().optional() }));
      const appeal = (await db.select().from(accountAppeals).where(eq(accountAppeals.id, ctx.params.id)).limit(1))[0];
      if (!appeal) throw notFound("找不到申訴案件");
      const handledAt = ["approved", "rejected"].includes(body.status) ? new Date() : null;
      await db.update(accountAppeals).set({ status: body.status, adminNote: body.adminNote ?? "", handledBy: admin.userId, handledAt, updatedAt: new Date() }).where(eq(accountAppeals.id, appeal.id));
      if (body.status === "approved" && appeal.userId) {
        await db.update(users).set({ status: "active", blockedReason: "", blockedAt: null, blockedUntil: null, updatedAt: new Date() }).where(eq(users.userId, appeal.userId));
        const target = (await db.select({ displayName: users.displayName }).from(users).where(eq(users.userId, appeal.userId)).limit(1))[0];
        const link = `${body.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://study-nova-psi.vercel.app"}/login`;
        const message = accountEmailTemplate({ kind: "reactivate", displayName: target?.displayName ?? "StudyNova 使用者", link, note: body.adminNote });
        await recordGeneratedLink({ actorId: admin.userId, kind: "reactivate", targetType: "account_appeal", targetId: appeal.id, recipient: appeal.contactEmail, url: link, reason: body.adminNote ?? "申訴審核通過", metadata: { source: "account-appeal" } });
        const email = body.sendEmail ? await sendAccountEmail(appeal.contactEmail, message, { actorId: admin.userId, kind: "account_reactivate", displayName: target?.displayName, metadata: { appealId: appeal.id } }) : { sent: false, configured: smtpConfigured(), reason: "未要求寄信" };
        return { appealId: appeal.id, status: body.status, email, customerMessage: message.text, subject: message.subject };
      }
      return { appealId: appeal.id, status: body.status, email: { sent: false, configured: smtpConfigured(), reason: "未解封" } };
    },
  }),

  route({
    method: "POST",
    path: "/admin/account-emails",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ to: z.string().email(), displayName: z.string().min(1).max(80), kind: z.enum(["reactivate", "password_reset", "pro_reward"]), link: z.string().url(), expiresText: z.string().max(120).optional(), note: z.string().max(1000).optional() }));
      const message = accountEmailTemplate(body);
      const result = await sendAccountEmail(body.to, message, { actorId: ctx.requireUser().userId, kind: body.kind, displayName: body.displayName, metadata: { source: "account-emails", link: body.link, note: body.note ?? "" } });
      return { ...result, subject: message.subject, customerMessage: message.text };
    },
  }),

  route({
    method: "GET",
    path: "/admin/communication-logs",
    auth: "admin",
    handler: async (ctx) => {
      const limit = Math.min(200, Math.max(1, Number(ctx.query.get("limit") ?? 100)));
      const [links, emails] = await Promise.all([
        db.select().from(linkGenerationLogs).orderBy(desc(linkGenerationLogs.createdAt)).limit(limit),
        db.select().from(emailMessageLogs).orderBy(desc(emailMessageLogs.createdAt)).limit(limit),
      ]);
      return { links, emails, generatedAt: new Date().toISOString() };
    },
  }),

  /* ---------------------------------------------------- shop items */
  route({
    method: "GET",
    path: "/admin/shop/items",
    auth: "admin",
    handler: async () => ({ items: await db.select().from(assistantItems).orderBy(asc(assistantItems.category), asc(assistantItems.priceNova)) }),
  }),
  route({
    method: "POST",
    path: "/admin/shop/items",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          code: z.string().min(2).max(40),
          name: z.string().min(1).max(60),
          category: z.enum(["frame", "skin", "core", "effect", "float", "voice", "title", "badge", "pass"]),
          priceNova: z.number().int().min(0).max(100000),
          description: z.string().max(300).default(""),
          requiredLevel: z.number().int().min(1).max(5).default(1),
          proOnly: z.boolean().default(false),
          payload: z.record(z.string(), z.unknown()).default({}),
        }),
      );
      const rows = await db.insert(assistantItems).values(body as never).onConflictDoNothing().returning();
      if (!rows[0]) throw fail("ADMIN_ITEM_EXISTS");
      return { item: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/shop/items/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ enabled: z.boolean().optional(), priceNova: z.number().int().min(0).max(100000).optional(), announce: z.boolean().default(true) }));
      const before = (await db.select().from(assistantItems).where(eq(assistantItems.id, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到商品");
      const { announce, ...updates } = body;
      const rows = await db.update(assistantItems).set(updates).where(eq(assistantItems.id, ctx.params.id)).returning();
      if (announce && body.enabled !== undefined && before.enabled !== body.enabled) {
        const announcement = (await db.insert(announcements).values({ title: `商城商品${body.enabled ? "已上架" : "已下架"}：${before.name}`, body: `「${before.name}」目前${body.enabled ? "已開放購買" : "暫停購買"}。`, audience: "all", audienceIds: [], pinned: false, marquee: false, notify: true, push: false, sortOrder: 0, startsAt: new Date(), endsAt: null, createdBy: admin.userId }).returning())[0];
        for (const userId of await resolveAudience("all", [])) await notify({ userId, kind: "announcement", title: `📢 ${announcement.title}`, body: announcement.body, link: "/profile?tab=shop", dedupeKey: `ann:${announcement.id}:${userId}` });
      }
      return { item: rows[0] };
    },
  }),

  /* ------------------------------------------------------ audit/logs */
  route({
    method: "GET",
    path: "/admin/logs",
    auth: "admin",
    handler: async (ctx) => {
      const kind = ctx.query.get("kind") ?? "admin";
      if (kind === "system") {
        return { logs: await db.select().from(systemLogs).orderBy(desc(systemLogs.createdAt)).limit(100) };
      }
      const rows = await db
        .select({
          id: adminLogs.id,
          action: adminLogs.action,
          targetType: adminLogs.targetType,
          targetId: adminLogs.targetId,
          reason: adminLogs.reason,
          createdAt: adminLogs.createdAt,
          actor: users.displayName,
          actorNovaId: users.novaId,
        })
        .from(adminLogs)
        .leftJoin(users, eq(users.userId, adminLogs.actorId))
        .orderBy(desc(adminLogs.createdAt))
        .limit(150);
      return { logs: rows };
    },
  }),

  /* ------------------------------------------------------------ CSV */
  route({
    method: "GET",
    path: "/admin/export/:kind",
    auth: "admin",
    handler: async (ctx) => {
      const kind = ctx.params.kind;
      if (kind === "users") {
        const rows = await db
          .select({ novaId: users.novaId, displayName: users.displayName, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt, tier: memberships.tier, nova: novaAccounts.balance })
          .from(users)
          .leftJoin(memberships, eq(memberships.userId, users.userId))
          .leftJoin(novaAccounts, eq(novaAccounts.userId, users.userId));
        return csvResponse("studynova-users.csv", rows as never);
      }
      if (kind === "grades") {
        const rows = await db
          .select({ novaId: users.novaId, subject: gradeRecords.subject, examName: gradeRecords.examName, examDate: gradeRecords.examDate, score: gradeRecords.score, fullScore: gradeRecords.fullScore, percentage: gradeRecords.percentage })
          .from(gradeRecords)
          .innerJoin(users, eq(users.userId, gradeRecords.userId));
        return csvResponse("studynova-grades.csv", rows as never);
      }
      if (kind === "nova") {
        const rows = await db
          .select({ novaId: users.novaId, amount: novaTransactions.amount, balanceAfter: novaTransactions.balanceAfter, reason: novaTransactions.reason, source: novaTransactions.source, createdAt: novaTransactions.createdAt })
          .from(novaTransactions)
          .innerJoin(users, eq(users.userId, novaTransactions.userId))
          .orderBy(desc(novaTransactions.createdAt))
          .limit(5000);
        return csvResponse("studynova-nova-ledger.csv", rows as never);
      }
      if (kind === "ai") {
        const rows = await db
          .select({ provider: aiUsageLogs.provider, model: aiUsageLogs.model, feature: aiUsageLogs.feature, success: aiUsageLogs.success, inputTokens: aiUsageLogs.inputTokens, outputTokens: aiUsageLogs.outputTokens, latencyMs: aiUsageLogs.latencyMs, createdAt: aiUsageLogs.createdAt })
          .from(aiUsageLogs)
          .orderBy(desc(aiUsageLogs.createdAt))
          .limit(5000);
        return csvResponse("studynova-ai-usage.csv", rows as never);
      }
      if (kind === "weekly") {
        const rows = await db
          .select({ weekCode: weeklyExamWeeks.weekCode, novaId: users.novaId, displayName: users.displayName, score: weeklyExamResults.score, correct: weeklyExamResults.correctCount, total: weeklyExamResults.total, recite: weeklyExamResults.reciteCompleted })
          .from(weeklyExamResults)
          .innerJoin(users, eq(users.userId, weeklyExamResults.userId))
          .innerJoin(weeklyExamWeeks, eq(weeklyExamWeeks.id, weeklyExamResults.weekId));
        return csvResponse("studynova-weekly.csv", rows as never);
      }
      if (kind === "activities") {
        const rows = await db
          .select({ title: activities.title, novaId: users.novaId, progress: activityParticipants.progress, completedAt: activityParticipants.completedAt })
          .from(activityParticipants)
          .innerJoin(activities, eq(activities.id, activityParticipants.activityId))
          .innerJoin(users, eq(users.userId, activityParticipants.userId));
        return csvResponse("studynova-activities.csv", rows as never);
      }
      if (kind === "students") {
        const rows = await db
          .select({ novaId: users.novaId, displayName: users.displayName, minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
          .from(users)
          .leftJoin(studyRecords, eq(studyRecords.userId, users.userId))
          .groupBy(users.novaId, users.displayName);
        return csvResponse("studynova-student-stats.csv", rows as never);
      }
      throw fail("ADMIN_EXPORT_UNSUPPORTED");
    },
  }),

  /* ------------------------------------------------------- settings */
  route({
    method: "GET",
    path: "/admin/settings",
    auth: "admin",
    handler: async () => ({ settings: await db.select().from(platformSettings) }),
  }),

  route({
    method: "PUT",
    path: "/admin/settings/:key",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ value: z.record(z.string(), z.unknown()) }));
      const rows = await db
        .insert(platformSettings)
        .values({ key: ctx.params.key, value: body.value as Record<string, unknown> })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: body.value as Record<string, unknown>, updatedAt: new Date() } })
        .returning();
      await adminLog({ actorId: admin.userId, action: "settings.update", targetType: "setting", targetId: ctx.params.key, after: body.value, ip: ctx.ip });
      return { setting: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/admin/push/test",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(120).optional(),
          message: z.string().min(1).max(400).optional(),
          link: z.string().max(240).optional(),
          audience: z.enum(["all", "pro", "users", "admin"]).default("all"),
          audienceIds: z.array(z.string().uuid()).max(500).default([]),
        }).optional(),
      );
      const title = body?.title ?? "StudyNova 測試推播";
      const message = body?.message ?? "推播設定正常運作 ✅";
      const targets = await resolveAudience(body?.audience ?? "all", body?.audienceIds ?? []);
      let notified = 0;
      let pushSent = 0;
      for (const userId of targets) {
        const created = await notify({ userId, kind: "admin_push_test", title, body: message, link: body?.link ?? "/dashboard", push: false, dedupeKey: `push-test:${admin.userId}:${Date.now()}:${userId}` });
        if (created) {
          notified += 1;
          const result = await sendPush(userId, { title, body: message, link: body?.link ?? "/dashboard", vibrate: [120, 60, 120] });
          pushSent += result.sent;
        }
      }
      await adminLog({ actorId: admin.userId, action: "push.test", targetType: "audience", targetId: body?.audience ?? "all", after: { title, message, targets: targets.length, notified, pushSent, configured: pushConfigured() }, ip: ctx.ip });
      return { targets: targets.length, notified, pushSent, configured: pushConfigured() };
    },
  }),
];
