import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  deletedAccounts,
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
  announcementTemplates,
  activities,
  activityParticipants,
  activityQuestions,
  adminLogs,
  systemLogs,
  aiProviderHealth,
  aiUsageLogs,
  aiPolicies,
  aiPolicyVersions,
  questions,
  dailyWords,
  questionBanks,
  questionVersions,
  questionImportJobs,
  questionAnalysisJobs,
  questionAnalysisBatches,
  gradeRecords,
  grades,
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
  customizationCategories,
  customizationVersions,
  pushSubscriptions,
  auditLogs,
  pkActivities,
  pkAuditLogs,
  pkMatchEvents,
  pkMatchQuestions,
  pkMatchPlayers,
  pkMatches,
  pkPresence,
  pkRooms,
} from "@/db/schema";
import { normalizeQuestionRows } from "../question-import";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, fingerprint, notFound, toCsv, monthStart, randomToken, sha256 } from "../core";
import { adminLog, adjustNovaByAdmin, grantMembership, grantNova, grantXp } from "../economy";
import { notify, resolveAudience, sendPush, pushConfigured } from "../notify";
import { queue } from "../queue";
import { providerMetrics, recentAiFailures, aiConfigured, runAiJson } from "../ai";
import { accountEmailTemplate, accountLinkCopy, sendAccountEmail, smtpConfigured, systemAnnouncementEmailTemplate } from "../email";
import { analysisPrompt, qualityGate } from "../question-analysis";
import { getAiPolicy, policyInstructions } from "../ai-policy";
import { checkDisplayName } from "../name-moderation";
import { getRegistrationControl } from "../registration";
import { getPkConfig, normalizePkConfig } from "../pk-config";
import { finishPkMatch } from "./pk-routes";
import { publishPkEvent } from "../pk-realtime";

function validateCustomizationTokens(tokens: Record<string, string>) {
  const allowed = new Set(["primary", "secondary", "accent", "surface", "line", "radius", "shadow", "glow", "buttonRadius", "motion", "pageBackground", "fontSize", "fontWeight", "spacing"]);
  for (const [key, value] of Object.entries(tokens)) {
    if (!allowed.has(key)) throw badRequest(`不支援的客製化 token：${key}`);
    if (value.length > 240 || /[;{}<>]|url\s*\(/i.test(value)) throw badRequest(`token ${key} 含有不支援的樣式內容`);
    if (["radius", "buttonRadius", "motion", "fontSize", "spacing", "fontWeight"].includes(key) && !/^[0-9.]+(px|rem|ms)?$/.test(value)) throw badRequest(`token ${key} 的數值格式錯誤`);
    if (["primary", "secondary", "accent"].includes(key) && !/^#[0-9a-fA-F]{6}$/.test(value)) throw badRequest(`token ${key} 必須是六碼色碼`);
  }
}

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

const EXPERT_SETTINGS_SCHEMA = z.object({
  sourceStrictness: z.enum(["strict", "guided", "creative"]).default("strict"),
  requireAnswerVerification: z.boolean().default(true),
  requireExplanation: z.boolean().default(true),
  avoidDuplicates: z.boolean().default(true),
  avoidSensitiveContent: z.boolean().default(true),
  bloomLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]).default("understand"),
  cognitiveSkills: z.array(z.enum(["concept", "application", "reasoning", "calculation", "reading", "comparison"])).min(1).max(6).default(["concept", "application"]),
  distractorStrategy: z.enum(["plausible", "misconception", "mixed", "none"]).default("plausible"),
  scenarioStyle: z.enum(["direct", "balanced", "real_world", "exam"]).default("balanced"),
  language: z.enum(["zh-TW", "en", "bilingual"]).default("zh-TW"),
  temperature: z.number().min(0).max(0.8).default(0.2),
  qualityThreshold: z.number().int().min(50).max(100).default(80),
  maxRetries: z.number().int().min(0).max(3).default(1),
  outputFormat: z.enum(["structured", "compact"]).default("structured"),
  referencePriority: z.enum(["reference_only", "reference_first", "knowledge_allowed"]).default("reference_only"),
});

function expertSettingsInstructions(settings: z.infer<typeof EXPERT_SETTINGS_SCHEMA>) {
  return `\n【AI Question Studio Expert Settings】\n資料嚴格度：${settings.sourceStrictness}；答案驗證：${settings.requireAnswerVerification ? "必須" : "可選"}；解析：${settings.requireExplanation ? "必須" : "可選"}；避免重複：${settings.avoidDuplicates ? "是" : "否"}；避免敏感內容：${settings.avoidSensitiveContent ? "是" : "否"}；Bloom 層級：${settings.bloomLevel}；認知技能：${settings.cognitiveSkills.join(", ")}；干擾選項：${settings.distractorStrategy}；情境：${settings.scenarioStyle}；語言：${settings.language}；品質門檻：${settings.qualityThreshold}；輸出：${settings.outputFormat}；參考資料優先：${settings.referencePriority}。${settings.requireAnswerVerification ? "每題先獨立驗證答案，不確定就標記 NEEDS_REVIEW，不得猜測。" : "答案仍須與提供資料一致。"}${settings.avoidDuplicates ? "不要產生與參考資料或同批題目高度重複的題目。" : ""}`;
}

async function loadExpertSettings(input?: unknown) {
  if (input) return EXPERT_SETTINGS_SCHEMA.parse(input);
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_question_studio_expert_settings")).limit(1))[0];
  return EXPERT_SETTINGS_SCHEMA.parse(row?.value ?? {});
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
      const page = Math.max(1, Number(ctx.query.get("page") ?? 1) || 1);
      const pageSize = Math.min(50, Math.max(10, Number(ctx.query.get("pageSize") ?? 25) || 25));
      const like = `%${q}%`;
      const [rows, total] = await Promise.all([db
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
          lastSeenAt: users.lastSeenAt,
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
        .limit(pageSize)
        .offset((page - 1) * pageSize), db.select({ count: sql<number>`count(*)::int` }).from(users).where(q ? or(ilike(users.novaId, like), ilike(users.email, like), ilike(users.displayName, like)) : sql`true`)]);
      return { users: rows, total: total[0]?.count ?? 0, page, pageSize };
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
          action: z.enum(["block", "unblock", "grant_pro", "extend_pro", "revoke_pro", "gift_nova", "gift_xp", "reset_quota", "set_unlimited", "set_role", "send_notification", "logout", "delete_account"]),
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
          if (before.role === "owner" && ["block", "set_role", "revoke_pro", "delete_account"].includes(body.action) && before.userId !== admin.userId) {
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
              await adjustNovaByAdmin({
                userId,
                amount: body.amount,
                reason: body.reason,
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
            case "delete_account": {
              if (before.userId === admin.userId) throw fail("ADMIN_TARGET_PROTECTED", { message: "不能刪除目前登入中的管理員帳號" });
              const administrators = await db.select({ userId: users.userId }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "owner")));
              for (const administrator of administrators) {
                await notify({ userId: administrator.userId, kind: "security", title: "管理員刪除帳號通知", body: `管理員 ${admin.displayName} 已刪除帳號 ${before.displayName}（${before.email}）。原因：${body.reason}`, link: "/admin", dedupeKey: `account-delete:${userId}:${administrator.userId}:${Date.now()}` });
              }
              await db.insert(deletedAccounts).values([{ identifierType: "email", identifier: before.email.toLowerCase(), reason: body.reason }, { identifierType: "nova_id", identifier: before.novaId.toUpperCase(), reason: body.reason }]).onConflictDoUpdate({ target: [deletedAccounts.identifierType, deletedAccounts.identifier], set: { reason: body.reason, deletedAt: new Date() } });
              await db.delete(users).where(eq(users.userId, userId));
              await adminLog({ actorId: admin.userId, action: "user.delete_account", targetType: "user", targetId: userId, reason: body.reason, before, ip: ctx.ip });
              results.push({ userId, ok: true, detail: "帳號與所屬資料已刪除" });
              continue;
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
    method: "PATCH",
    path: "/admin/users/:id/nova",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ amount: z.number().int().min(-1000000).max(1000000).refine((value) => value !== 0, "Nova 調整不可為 0"), reason: z.string().min(1).max(300) }));
      const target = (await db.select({ userId: users.userId }).from(users).where(eq(users.userId, ctx.params.id)).limit(1))[0];
      if (!target) throw notFound("找不到使用者");
      const result = await adjustNovaByAdmin({ userId: target.userId, amount: body.amount, reason: body.reason, actorId: admin.userId, idempotencyKey: `adminnova-single:${admin.userId}:${target.userId}:${Date.now()}` });
      await adminLog({ actorId: admin.userId, action: "nova.admin_adjust", targetType: "user", targetId: target.userId, reason: body.reason, after: { amount: body.amount, balance: result.balance }, ip: ctx.ip });
      return { ...result, userId: target.userId };
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
      const gradeGoals = await db.select().from(grades).where(eq(grades.userId, u.userId)).orderBy(asc(grades.subject));
      const activityLogs = await db.select().from(auditLogs).where(eq(auditLogs.userId, u.userId)).orderBy(desc(auditLogs.occurredAt)).limit(200);
      const loginSessions = await db.select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, rotatedAt: sessions.rotatedAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, u.userId)).orderBy(desc(sessions.createdAt)).limit(20);
      return { user: { ...u, passwordHash: undefined }, membership: m, nova, ledger, usage, gradeGoals, activityLogs, loginSessions };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/users/:id/profile",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ displayName: z.string().min(1).max(40), bio: z.string().max(200).optional(), reason: z.string().min(1).max(300) }));
      const check = checkDisplayName(body.displayName);
      if (!check.ok) throw badRequest("管理員設定的名稱也必須符合名稱規範。", { reason: check.reason });
      const before = (await db.select().from(users).where(eq(users.userId, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到使用者");
      const updated = (await db.update(users).set({ displayName: body.displayName.trim(), ...(body.bio === undefined ? {} : { bio: body.bio }), nameModerationStatus: "clear", nameModerationReason: "", nameLastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(users.userId, before.userId)).returning({ userId: users.userId, displayName: users.displayName, bio: users.bio }))[0];
      await adminLog({ actorId: admin.userId, action: "user.rename", targetType: "user", targetId: before.userId, reason: body.reason, before: { displayName: before.displayName, bio: before.bio }, after: updated, ip: ctx.ip });
      await notify({ userId: before.userId, kind: "admin_notice", title: "你的 StudyNova 名稱已由管理員調整", body: `新名稱：${updated.displayName}。原因：${body.reason}`, link: "/profile", dedupeKey: `rename:${before.userId}:${Date.now()}` });
      return { profile: updated };
    },
  }),

  route({
    method: "PUT",
    path: "/admin/users/:id/grade-goals",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ subject: z.string().min(1).max(20), targetScore: z.number().min(1).max(100), baselineScore: z.number().min(0).max(100).nullable().optional(), reason: z.string().min(1).max(300) }));
      const target = (await db.select({ userId: users.userId }).from(users).where(eq(users.userId, ctx.params.id)).limit(1))[0];
      if (!target) throw notFound("找不到使用者");
      const before = (await db.select().from(grades).where(and(eq(grades.userId, target.userId), eq(grades.subject, body.subject))).limit(1))[0] ?? null;
      const rows = await db.insert(grades).values({ userId: target.userId, subject: body.subject, targetScore: body.targetScore, baselineScore: body.baselineScore ?? null }).onConflictDoUpdate({ target: [grades.userId, grades.subject], set: { targetScore: body.targetScore, baselineScore: body.baselineScore ?? null, achievedAt: null, updatedAt: new Date() } }).returning();
      await adminLog({ actorId: admin.userId, action: "grade_goal.admin_update", targetType: "user", targetId: target.userId, reason: body.reason, before: before ? { subject: before.subject, targetScore: before.targetScore, baselineScore: before.baselineScore } : null, after: { subject: rows[0].subject, targetScore: rows[0].targetScore, baselineScore: rows[0].baselineScore }, ip: ctx.ip });
      return { goal: rows[0] };
    },
  }),

  /* ------------------------------------------------ feature control */
  route({
    method: "GET",
    path: "/admin/service-control",
    auth: "admin",
    handler: async () => {
      const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
      const value = (row?.value ?? {}) as Record<string, unknown>;
      return {
        enabled: value.enabled !== false,
        title: typeof value.title === "string" ? value.title : "系統施工中",
        description: typeof value.description === "string" ? value.description : "StudyNova 目前正在進行系統維護與更新，暫時無法使用。",
        badgeText: typeof value.badgeText === "string" ? value.badgeText : "系統維護中，請稍候",
        estimatedRecoveryAt: typeof value.estimatedRecoveryAt === "string" ? value.estimatedRecoveryAt : null,
        message: typeof value.message === "string" ? value.message : "請稍後再回來看看！",
        startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
        updatedByName: typeof value.updatedByName === "string" ? value.updatedByName : null,
        updatedAt: row?.updatedAt?.toISOString?.() ?? null,
      };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/service-control",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const existing = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
      const current = (existing?.value ?? {}) as Record<string, unknown>;
      const body = await ctx.json(z.object({
        enabled: z.boolean(),
        title: z.string().trim().min(1).max(120).default("系統施工中"),
        description: z.string().trim().max(1000).default("StudyNova 目前正在進行系統維護與更新，暫時無法使用。"),
        badgeText: z.string().trim().max(120).default("系統維護中，請稍候"),
        estimatedRecoveryAt: z.string().datetime().nullable().default(null),
        message: z.string().trim().max(500).default("請稍後再回來看看！"),
        announceOnEnable: z.boolean().default(false),
      }));
      const now = new Date().toISOString();
      const value = {
        ...current,
        ...body,
        startedAt: body.enabled ? null : (typeof current.startedAt === "string" ? current.startedAt : now),
        updatedByName: admin.displayName,
        updatedAt: now,
      };
      await db.insert(platformSettings).values({ key: "service_control", value, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
      if (body.enabled && current.enabled === false && body.announceOnEnable) {
        const announcement = (await db.insert(announcements).values({ title: "StudyNova 維護完成", body: "網站維護已完成，所有主要功能現在可以正常使用。感謝你的耐心等候。", link: "/dashboard", targetFeature: "all", category: "system", announcementType: "maintenance", importance: "high", audience: "all", audienceIds: [], notify: true, push: true, showHome: true, showPwa: true, pinned: true, marquee: true, status: "published", startsAt: new Date(), createdBy: admin.userId }).returning())[0];
        if (announcement) for (const userId of await resolveAudience("all", [])) await notify({ userId, kind: "announcement", title: `📢 ${announcement.title}`, body: announcement.body, link: announcement.link, push: true, dedupeKey: `maintenance-complete:${announcement.id}:${userId}` });
      }
      await adminLog({ actorId: admin.userId, action: body.enabled ? "service.enable" : "service.disable", targetType: "platform", targetId: "service_control", after: value, ip: ctx.ip });
      return { ...value, updatedAt: now };
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
    path: "/admin/announcement-templates",
    auth: "admin",
    handler: async () => ({ templates: await db.select().from(announcementTemplates).where(eq(announcementTemplates.enabled, true)).orderBy(asc(announcementTemplates.name)) }),
  }),
  route({
    method: "POST",
    path: "/admin/announcement-templates",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ name: z.string().min(1).max(120), title: z.string().min(1).max(120), body: z.string().max(4000).default(""), announcementType: z.string().max(30).default("general"), icon: z.string().max(20).default("▤"), ctaLabel: z.string().max(80).default(""), ctaUrl: z.string().max(400).default(""), defaultSettings: z.record(z.string(), z.unknown()).default({}) }));
      const template = (await db.insert(announcementTemplates).values(body).returning())[0];
      return { template };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/announcement-templates/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ name: z.string().min(1).max(120).optional(), title: z.string().min(1).max(120).optional(), body: z.string().max(4000).optional(), announcementType: z.string().max(30).optional(), icon: z.string().max(20).optional(), ctaLabel: z.string().max(80).optional(), ctaUrl: z.string().max(400).optional(), defaultSettings: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional() }));
      const template = (await db.update(announcementTemplates).set({ ...body, updatedAt: new Date() }).where(eq(announcementTemplates.id, ctx.params.id)).returning())[0];
      if (!template) throw notFound("找不到公告範例");
      return { template };
    },
  }),
  route({
    method: "GET",
    path: "/admin/announcements",
    auth: "admin",
    handler: async () => {
      try { return { announcements: await db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(100) }; }
      catch (error) { console.error("[StudyNova][admin-announcements] fallback query", error); return { announcements: await db.select({ id: announcements.id, title: announcements.title, body: announcements.body, link: announcements.link, status: announcements.status, startsAt: announcements.startsAt, endsAt: announcements.endsAt, pinned: announcements.pinned, sortOrder: announcements.sortOrder, createdAt: announcements.createdAt }).from(announcements).orderBy(desc(announcements.createdAt)).limit(100) }; }
    },
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
          // The database column is text and templates may introduce new types.
          // Do not reject a valid custom announcement type with SN-REQ-2002.
          announcementType: z.string().trim().min(1).max(30).default("general"),
          importance: z.enum(["low", "normal", "high", "critical"]).default("normal"),
          tags: z.union([z.array(z.string().max(30)), z.string()]).transform((value) => (Array.isArray(value) ? value : value.split(",")).map((tag) => tag.trim()).filter(Boolean).slice(0, 12)),
          image: z.string().max(400).default(""),
          audience: z.enum(["all", "pro", "users", "group"]).default("all"),
          audienceIds: z.array(z.string().uuid()).max(500).default([]),
          pinned: z.boolean().default(false),
          marquee: z.boolean().default(false),
          notify: z.boolean().default(true),
          push: z.boolean().default(false),
          email: z.boolean().default(false),
          showHome: z.boolean().default(true),
          showPwa: z.boolean().default(false),
          ctaLabel: z.string().max(80).default(""),
          ctaUrl: z.string().max(400).default(""),
          status: z.enum(["draft", "scheduled", "published", "archived"]).default("published"),
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
          announcementType: body.announcementType,
          importance: body.importance,
          tags: body.tags,
          image: body.image,
          audience: body.audience,
          audienceIds: body.audienceIds,
          pinned: body.pinned,
          marquee: body.marquee,
          notify: body.notify,
          push: body.push,
          email: body.email,
          showHome: body.showHome,
          showPwa: body.showPwa,
          ctaLabel: body.ctaLabel,
          ctaUrl: body.ctaUrl,
          status: body.status,
          sortOrder: body.sortOrder,
          startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          createdBy: admin.userId,
        })
        .returning();
      const scheduled = Boolean(body.startsAt && new Date(body.startsAt) > new Date());
      if (scheduled && rows[0].status !== "scheduled") await db.update(announcements).set({ status: "scheduled" }).where(eq(announcements.id, rows[0].id));
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
      z.object({ pinned: z.boolean().optional(), marquee: z.boolean().optional(), sortOrder: z.number().int().min(0).max(999).optional(), title: z.string().min(1).max(120).optional(), body: z.string().max(4000).optional(), link: z.string().max(300).optional(), targetFeature: z.string().min(1).max(60).optional(), category: z.string().min(1).max(40).optional(), announcementType: z.string().max(30).optional(), importance: z.enum(["low", "normal", "high", "critical"]).optional(), showHome: z.boolean().optional(), showPwa: z.boolean().optional(), ctaLabel: z.string().max(80).optional(), ctaUrl: z.string().max(400).optional(), status: z.enum(["draft", "scheduled", "published", "archived"]).optional(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }),
      );
      const { startsAt, endsAt, ...patch } = body;
      const rows = await db.update(announcements).set({ ...patch, ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : new Date() } : {}), ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}) }).where(eq(announcements.id, ctx.params.id)).returning();
      if (!rows[0]) throw notFound("找不到公告");
      if (startsAt && new Date(startsAt) > new Date() && rows[0].status !== "archived" && rows[0].status !== "draft") await queue().enqueue({ name: "announcement_publish", payload: { announcementId: rows[0].id }, uniqueKey: `announcement-publish:${rows[0].id}:${new Date(startsAt).getTime()}`, runAt: new Date(startsAt) });
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

  route({
    method: "GET",
    path: "/admin/ai/policies",
    auth: "admin",
    handler: async () => ({ policies: await db.select().from(aiPolicies).orderBy(asc(aiPolicies.feature)) }),
  }),
  route({
    method: "PATCH",
    path: "/admin/ai/policies/:feature",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({
        strategy: z.enum(["direct", "guided", "teaching", "exam", "structured", "custom"]).optional(),
        allowDirectAnswer: z.boolean().optional(),
        requireDetailedAnalysis: z.boolean().optional(),
        allowWebSearch: z.boolean().optional(),
        maxHintLevel: z.number().int().min(0).max(5).optional(),
        systemPolicy: z.string().max(8000).optional(),
        enabled: z.boolean().optional(),
        proOnly: z.boolean().optional(),
      }));
      const before = (await db.select().from(aiPolicies).where(eq(aiPolicies.feature, ctx.params.feature)).limit(1))[0];
      if (!before) throw notFound("找不到 AI Policy");
      const after = (await db.update(aiPolicies).set({ ...body, version: before.version + 1, updatedBy: admin.userId, updatedAt: new Date() }).where(eq(aiPolicies.id, before.id)).returning())[0];
      await db.insert(aiPolicyVersions).values({ policyId: before.id, version: after.version, before: before as Record<string, unknown>, after: after as Record<string, unknown>, changedBy: admin.userId });
      await adminLog({ actorId: admin.userId, action: "ai.policy.update", targetType: "ai_policy", targetId: before.id, before, after, ip: ctx.ip });
      return { policy: after };
    },
  }),
  route({
    method: "GET",
    path: "/admin/ai/policies/:feature/versions",
    auth: "admin",
    handler: async (ctx) => {
      const policy = (await db.select({ id: aiPolicies.id }).from(aiPolicies).where(eq(aiPolicies.feature, ctx.params.feature)).limit(1))[0];
      if (!policy) throw notFound("找不到 AI Policy");
      return { versions: await db.select().from(aiPolicyVersions).where(eq(aiPolicyVersions.policyId, policy.id)).orderBy(desc(aiPolicyVersions.version)).limit(50) };
    },
  }),

  /* ----------------------------------------------- customization center */
  route({ method: "GET", path: "/admin/customization/categories", auth: "admin", handler: async () => {
    const categories = await db.select().from(customizationCategories).orderBy(asc(customizationCategories.sortOrder), asc(customizationCategories.name));
    const versions = await db.select().from(customizationVersions).orderBy(desc(customizationVersions.versionNo));
    return { categories: categories.map((category) => ({ ...category, versions: versions.filter((version) => version.categoryId === category.id).slice(0, 10) })) };
  }}),
  route({ method: "POST", path: "/admin/customization/categories", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(80), description: z.string().max(500).default(""), icon: z.string().max(30).default("spark"), routePath: z.string().max(120).default(""), componentKey: z.string().max(80).default("page"), sortOrder: z.number().int().min(0).max(9999).default(100) }));
    const category = (await db.insert(customizationCategories).values({ ...body, createdBy: admin.userId, status: "draft" }).returning())[0];
    const version = (await db.insert(customizationVersions).values({ categoryId: category.id, versionNo: 1, createdBy: admin.userId, tokens: {}, responsive: {} }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "customization.category.create", targetType: "customization_category", targetId: category.id, after: { category, version }, ip: ctx.ip });
    return { category: { ...category, versions: [version] } };
  }}),
  route({ method: "PATCH", path: "/admin/customization/categories/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ name: z.string().min(1).max(80).optional(), description: z.string().max(500).optional(), icon: z.string().max(30).optional(), routePath: z.string().max(120).optional(), componentKey: z.string().max(80).optional(), enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(9999).optional(), status: z.enum(["draft", "published", "disabled"]).optional() }));
    const before = (await db.select().from(customizationCategories).where(eq(customizationCategories.id, ctx.params.id)).limit(1))[0];
    if (!before) throw notFound("找不到客製化分類");
    const category = (await db.update(customizationCategories).set({ ...body, updatedAt: new Date() }).where(eq(customizationCategories.id, before.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "customization.category.update", targetType: "customization_category", targetId: before.id, before, after: body, ip: ctx.ip });
    return { category };
  }}),
  route({ method: "GET", path: "/admin/customization/categories/:id/versions", auth: "admin", handler: async (ctx) => ({ versions: await db.select().from(customizationVersions).where(eq(customizationVersions.categoryId, ctx.params.id)).orderBy(desc(customizationVersions.versionNo)) }) }),
  route({ method: "PATCH", path: "/admin/customization/versions/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ tokens: z.record(z.string(), z.string()).default({}), responsive: z.record(z.string(), z.unknown()).default({}), changeNote: z.string().max(500).default("") }));
    validateCustomizationTokens(body.tokens);
    const current = (await db.select().from(customizationVersions).where(eq(customizationVersions.id, ctx.params.id)).limit(1))[0];
    if (!current) throw notFound("找不到客製化版本");
    const version = current.status === "published"
      ? (await db.insert(customizationVersions).values({ categoryId: current.categoryId, versionNo: ((await db.select({ max: sql<number>`coalesce(max(${customizationVersions.versionNo}), 0)::int` }).from(customizationVersions).where(eq(customizationVersions.categoryId, current.categoryId)))[0]?.max ?? 0) + 1, status: "draft", tokens: body.tokens, responsive: body.responsive, changeNote: body.changeNote || `從 v${current.versionNo} 建立草稿`, createdBy: admin.userId }).returning())[0]
      : (await db.update(customizationVersions).set({ ...body }).where(eq(customizationVersions.id, current.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: "customization.version.draft", targetType: "customization_version", targetId: version.id, after: { ...body, sourceVersionId: current.id }, ip: ctx.ip });
    return { version };
  }}),
  route({ method: "POST", path: "/admin/customization/versions/:id/publish", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const current = (await db.select().from(customizationVersions).where(eq(customizationVersions.id, ctx.params.id)).limit(1))[0];
    if (!current) throw notFound("找不到客製化版本");
    validateCustomizationTokens(current.tokens);
    await db.update(customizationVersions).set({ status: "draft" }).where(and(eq(customizationVersions.categoryId, current.categoryId), eq(customizationVersions.status, "published")));
    const version = (await db.update(customizationVersions).set({ status: "published", publishedAt: new Date() }).where(eq(customizationVersions.id, current.id)).returning())[0];
    await db.update(customizationCategories).set({ status: "published", enabled: true, updatedAt: new Date() }).where(eq(customizationCategories.id, current.categoryId));
    await adminLog({ actorId: admin.userId, action: "customization.version.publish", targetType: "customization_version", targetId: current.id, after: version, ip: ctx.ip });
    return { version };
  }}),
  route({ method: "POST", path: "/admin/customization/versions/:id/restore", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const old = (await db.select().from(customizationVersions).where(eq(customizationVersions.id, ctx.params.id)).limit(1))[0];
    if (!old) throw notFound("找不到歷史版本");
    const [latest] = await db.select({ max: sql<number>`coalesce(max(${customizationVersions.versionNo}), 0)::int` }).from(customizationVersions).where(eq(customizationVersions.categoryId, old.categoryId));
    const version = (await db.insert(customizationVersions).values({ categoryId: old.categoryId, versionNo: (latest?.max ?? 0) + 1, status: "draft", tokens: old.tokens, responsive: old.responsive, changeNote: `從 v${old.versionNo} 恢復`, createdBy: admin.userId }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "customization.version.restore", targetType: "customization_version", targetId: version.id, after: { restoredFrom: old.id, version }, ip: ctx.ip });
    return { version };
  }}),
  route({ method: "GET", path: "/admin/customization/versions/:id/export", auth: "admin", handler: async (ctx) => {
    const version = (await db.select().from(customizationVersions).where(eq(customizationVersions.id, ctx.params.id)).limit(1))[0];
    if (!version) throw notFound("找不到客製化版本");
    const category = (await db.select().from(customizationCategories).where(eq(customizationCategories.id, version.categoryId)).limit(1))[0];
    return new Response(JSON.stringify({ schemaVersion: 1, category, version }, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="studynova-customization-v${version.versionNo}.json"` } });
  }}),
  route({ method: "POST", path: "/admin/customization/import", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ mode: z.enum(["new", "overwrite"]), categoryId: z.string().uuid().optional(), payload: z.object({ category: z.object({ slug: z.string().min(2).max(80), name: z.string().min(1).max(80), description: z.string().max(500).default(""), icon: z.string().max(30).default("spark"), routePath: z.string().max(120).default(""), componentKey: z.string().max(80).default("page") }), version: z.object({ tokens: z.record(z.string(), z.string()).default({}), responsive: z.record(z.string(), z.unknown()).default({}), changeNote: z.string().max(500).default("") }) }) }));
    validateCustomizationTokens(body.payload.version.tokens);
    let category = body.categoryId ? (await db.select().from(customizationCategories).where(eq(customizationCategories.id, body.categoryId)).limit(1))[0] : undefined;
    if (body.mode === "overwrite" && !category) throw badRequest("覆蓋草稿需要指定分類");
    if (!category) category = (await db.insert(customizationCategories).values({ ...body.payload.category, createdBy: admin.userId, status: "draft" }).returning())[0];
    const existingDraft = body.mode === "overwrite" ? (await db.select().from(customizationVersions).where(and(eq(customizationVersions.categoryId, category.id), eq(customizationVersions.status, "draft"))).orderBy(desc(customizationVersions.versionNo)).limit(1))[0] : undefined;
    const version = existingDraft
      ? (await db.update(customizationVersions).set({ tokens: body.payload.version.tokens, responsive: body.payload.version.responsive, changeNote: body.payload.version.changeNote || "JSON 覆蓋草稿" }).where(eq(customizationVersions.id, existingDraft.id)).returning())[0]
      : (await db.insert(customizationVersions).values({ categoryId: category.id, versionNo: ((await db.select({ max: sql<number>`coalesce(max(${customizationVersions.versionNo}), 0)::int` }).from(customizationVersions).where(eq(customizationVersions.categoryId, category.id)))[0]?.max ?? 0) + 1, status: "draft", tokens: body.payload.version.tokens, responsive: body.payload.version.responsive, changeNote: body.payload.version.changeNote || "JSON 匯入", createdBy: admin.userId }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "customization.import", targetType: "customization_version", targetId: version.id, after: { mode: body.mode, categoryId: category.id }, ip: ctx.ip });
    return { category, version, summary: { name: category.name, tokenCount: Object.keys(version.tokens).length, versionNo: version.versionNo, status: version.status } };
  }}),
  /* ----------------------------------------------------- question bank */
  route({
    method: "POST",
    path: "/admin/questions/generate",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ prompt: z.string().max(4000).default(""), subject: z.string().min(1).max(40), educationLevel: z.string().max(40).default(""), grade: z.string().max(40).default(""), chapter: z.string().max(120).default(""), topic: z.string().max(120).default(""), types: z.array(z.string().max(40)).min(1).max(8).default(["single"]), count: z.number().int().min(1).max(100).default(10), difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).default("normal"), referenceText: z.string().max(30000).default(""), requireExplanation: z.boolean().default(true), expertSettings: EXPERT_SETTINGS_SCHEMA.optional() }));
      const expert = await loadExpertSettings(body.expertSettings);
      const policy = await getAiPolicy("question_generation");
      const level = body.educationLevel.toLowerCase().includes("senior") || body.educationLevel.includes("高中") ? "senior" : "junior";
      const previews: Array<Record<string, unknown>> = [];
      for (let batch = 0; batch < 8 && previews.filter((item) => item.status !== "ERROR").length < body.count; batch += 1) {
        const remaining = body.count - previews.filter((item) => item.status !== "ERROR").length;
        const batchCount = Math.min(20, remaining);
        const instruction = `請產生 ${batchCount} 題${body.subject}題目。教育階段：${body.educationLevel}；年級：${body.grade}；章節：${body.chapter}；主題：${body.topic}；題型可使用：${body.types.join(",")}；難度：${body.difficulty}。${expertSettingsInstructions(expert)}\n${body.prompt}\n${body.referenceText ? `只能根據以下參考資料，不要捏造：\n${body.referenceText}` : ""}\n已產生題目不可重複：${previews.slice(-60).map((item) => String(item.stem ?? "")).join("\n")}`;
        const result = await runAiJson<unknown[]>({ feature: "admin_question_generation", userId: admin.userId, system: `你是 StudyNova 題庫出題器。${policyInstructions(policy)}\n只回傳 JSON 陣列，陣列必須盡量包含要求的 ${batchCount} 題；每題欄位 question, type, options, answer, explanation, subject, topic, difficulty。答案必須可由題目與資料支持；不要輸出 Markdown。`, parts: [{ kind: "text", text: instruction }], maxOutputTokens: 12000, temperature: expert.temperature }, []);
        const normalized = normalizeQuestionRows(result.data, { subject: body.subject, difficulty: body.difficulty, level, sourceLabel: "AI 生成草稿", bankCategory: "AI 生成待審核" });
        for (const item of normalized.previews) {
          if (item.status === "ERROR" || !item.stem || previews.some((existing) => existing.stem === item.stem)) continue;
          previews.push({ ...item, status: item.status === "READY" && body.requireExplanation && !item.explanation ? "WARNING" : item.status, sourceType: "ai", reviewStatus: "draft" });
        }
        if (!normalized.previews.length) break;
      }
      const ready = previews.filter((item) => item.status === "READY" || item.status === "WARNING");
      await adminLog({ actorId: admin.userId, action: "questions.generate", targetType: "question_draft", targetId: "preview", after: { subject: body.subject, count: body.count, generated: previews.length, errors: body.count - ready.length }, ip: ctx.ip });
      return { drafts: previews, summary: { requested: body.count, generated: previews.length, ready: ready.length, warnings: previews.filter((item) => item.status === "WARNING").length, errors: Math.max(0, body.count - ready.length) } };
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
      const expertRaw = String(form.get("expertSettings") || "{}");
      const expert = await loadExpertSettings(expertRaw === "{}" ? undefined : JSON.parse(expertRaw));
      const referenceText = String(form.get("referenceText") || "").slice(0, 30000);
      const bytes = Buffer.from(await file.arrayBuffer());
      const isText = file.type.startsWith("text/") || file.type === "application/json" || /\.(json|csv|txt)$/i.test(file.name);
      const source = isText ? bytes.toString("utf8").slice(0, 30000) : "";
      const instruction = `請根據附件完整內容產生 ${count} 題${subject}題目。難度：${difficulty}。${expertSettingsInstructions(expert)}\n${prompt}\n${referenceText ? `補充參考資料：\n${referenceText}` : ""}${source ? `\n文字附件內容：\n${source}` : ""}`;
      const policy = await getAiPolicy("question_generation");
      const result = await runAiJson<unknown[]>({
        feature: "admin_question_generation_file",
        userId: admin.userId,
        system: `你是 StudyNova 題庫出題器。${policyInstructions(policy)}\n只回傳 JSON 陣列，每題欄位 question, type, options, answer, explanation, subject, topic, difficulty。必須根據附件內容，不得捏造；答案不確定時在 explanation 標記待審核。`,
        parts: isText ? [{ kind: "text", text: instruction }] : [{ kind: "text", text: instruction }, { kind: file.type.startsWith("audio/") ? "audio" : "image", mimeType: file.type || "application/octet-stream", base64: bytes.toString("base64") }],
        maxOutputTokens: Math.min(6000, Math.max(1800, 700 * count)),
        temperature: expert.temperature,
        timeoutMs: 90_000,
      }, []);
      const normalized = normalizeQuestionRows(result.data, { subject, difficulty, level, sourceLabel: file.name, bankCategory: "AI 檔案出題待審核" });
      const drafts = normalized.previews.map((item) => ({ ...item, sourceType: "file", sourceFile: file.name, reviewStatus: "draft" }));
      await adminLog({ actorId: admin.userId, action: "questions.generate.file", targetType: "question_draft", targetId: file.name.slice(0, 120), after: { subject, count, generated: drafts.length }, ip: ctx.ip });
      return { drafts, summary: { requested: count, generated: drafts.length, ready: drafts.filter((item) => item.status === "READY").length, warnings: drafts.filter((item) => item.status === "WARNING").length, errors: drafts.filter((item) => item.status === "ERROR").length } };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/generate-vocabulary",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ level: z.enum(["junior", "senior", "all"]).default("senior"), count: z.number().int().min(1).max(8000).default(7000), offset: z.number().int().min(0).default(0), direction: z.enum(["zh2en", "en2zh"]).default("zh2en"), sourceLabel: z.string().max(120).default("高中7000單字中翻英題庫") }));
      const conditions = body.level === "all" ? undefined : eq(dailyWords.level, body.level);
      const words = await db.select({ id: dailyWords.id, word: dailyWords.word, meaning: dailyWords.meaning, partOfSpeech: dailyWords.partOfSpeech, level: dailyWords.level }).from(dailyWords).where(conditions).orderBy(asc(dailyWords.word)).limit(body.count).offset(body.offset);
      if (!words.length) throw badRequest("找不到可轉換的單字；請先執行7000單字 seed");
      const optionPool = words.filter((word) => word.word.trim());
      const rows = words.map((word, index) => {
        const meaning = word.meaning.trim() || "請選出與此單字相符的中文意思";
        const answer = body.direction === "zh2en" ? word.word.trim() : meaning;
        const stem = body.direction === "zh2en" ? `中文意思：${meaning}${word.partOfSpeech ? `（${word.partOfSpeech}）` : ""}\n請選出正確的英文單字。` : `英文單字：${word.word.trim()}\n請選出正確的中文意思。`;
        const options = [answer];
        for (let step = 1; options.length < 4 && step <= optionPool.length; step += 1) {
          const candidate = body.direction === "zh2en" ? optionPool[(index + step) % optionPool.length].word.trim() : (optionPool[(index + step) % optionPool.length].meaning.trim() || "其他意思");
          if (candidate && !options.includes(candidate)) options.push(candidate);
        }
        return { ownerId: null, origin: "bank", targetBank: "general", bankCategory: body.direction === "zh2en" ? "7000單字・中翻英" : "7000單字・英翻中", sourceLabel: body.sourceLabel, subject: "英文", topic: "國高中7000單字", chapter: word.level === "senior" ? "高中" : "國中", sourceType: "vocabulary", status: "published", level: word.level, difficulty: "normal", type: "single", stem, options, answer: [answer], explanation: `${word.word.trim()}：${meaning}`, metadata: { dailyWordId: word.id, direction: body.direction, generatedBy: "vocabulary-bank" }, fingerprint: fingerprint("vocabulary-bank", word.id, body.direction) };
      });
      let imported = 0;
      for (let start = 0; start < rows.length; start += 250) {
        const inserted = await db.insert(questions).values(rows.slice(start, start + 250)).onConflictDoNothing().returning({ id: questions.id });
        imported += inserted.length;
      }
      await adminLog({ actorId: admin.userId, action: "questions.generate.vocabulary", targetType: "questions", targetId: body.sourceLabel, after: { requested: body.count, selected: rows.length, imported, level: body.level, direction: body.direction }, ip: ctx.ip });
      return { requested: body.count, selected: rows.length, imported, skipped: rows.length - imported, level: body.level, direction: body.direction, sourceLabel: body.sourceLabel };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/:id/analyze",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const question = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!question) throw notFound("找不到題目");
      const policy = await getAiPolicy("question_analysis");
      const job = (await db.insert(questionAnalysisJobs).values({ questionId: question.id, requestedBy: admin.userId, status: "analyzing", attempts: 1 }).returning())[0];
      try {
        const result = await runAiJson<Record<string, unknown>>({ feature: "question_analysis", userId: admin.userId, system: `你是 StudyNova 專業題目分析器。${policyInstructions(policy)}\n答案衝突時不要覆蓋題庫答案，請在 answer 欄標記 ANSWER_CONFLICT 並說明推導答案與題庫答案。`, parts: [{ kind: "text", text: analysisPrompt(question) }], maxOutputTokens: 2400, temperature: 0.15 }, {});
        const quality = qualityGate(result.data, question);
        const answerConflict = Boolean(result.data.answer && question.answer.length && !question.answer.some((answer) => String(result.data.answer).includes(answer)));
        const finalQuality = { ...quality, answerConflict, answerConflictStatus: answerConflict ? "ANSWER_CONFLICT" : "MATCHED" };
        const status = quality.passed ? "completed" : "quality_failed";
        const updated = (await db.update(questionAnalysisJobs).set({ status, result: result.data, quality: finalQuality, updatedAt: new Date() }).where(eq(questionAnalysisJobs.id, job.id)).returning())[0];
        await adminLog({ actorId: admin.userId, action: "question.analyze", targetType: "question_analysis_job", targetId: job.id, after: { questionId: question.id, status, quality: finalQuality }, ip: ctx.ip });
        return { job: updated, quality: finalQuality };
      } catch (error) {
        await db.update(questionAnalysisJobs).set({ status: "failed", errorMessage: String(error instanceof Error ? error.message : error).slice(0, 500), updatedAt: new Date() }).where(eq(questionAnalysisJobs.id, job.id));
        throw error instanceof Error ? error : new Error("題目分析失敗");
      }
    },
  }),
  route({
    method: "GET",
    path: "/admin/questions/:id/analysis",
    auth: "admin",
    handler: async (ctx) => ({ analyses: await db.select().from(questionAnalysisJobs).where(eq(questionAnalysisJobs.questionId, ctx.params.id)).orderBy(desc(questionAnalysisJobs.createdAt)).limit(20) }),
  }),
  route({
    method: "POST",
    path: "/admin/questions/analyze-batch",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ questionIds: z.array(z.string().uuid()).min(1).max(500), expertSettings: z.record(z.string(), z.unknown()).optional() }));
      const ids = (await db.select({ id: questions.id }).from(questions).where(inArray(questions.id, body.questionIds))).map((row) => row.id);
      if (!ids.length) throw notFound("找不到可分析的題目");
      const batch = (await db.insert(questionAnalysisBatches).values({ requestedBy: admin.userId, total: ids.length, questionIds: ids, status: "queued" }).returning())[0];
      const queued = await queue().enqueue({ name: "question_analysis_batch", payload: { batchId: batch.id, expertSettings: body.expertSettings ?? {} }, uniqueKey: `question-analysis-batch:${batch.id}` });
      if (!queued.queued) throw conflict("批次分析已建立，請查看進度");
      void queue().drain(1);
      return { batch };
    },
  }),
  route({
    method: "GET",
    path: "/admin/questions/analyze-batch/:id",
    auth: "admin",
    handler: async (ctx) => {
      const batch = (await db.select().from(questionAnalysisBatches).where(eq(questionAnalysisBatches.id, ctx.params.id)).limit(1))[0];
      if (!batch) throw notFound("找不到批次分析");
      return { batch, progress: batch.total ? Math.round((batch.processed / batch.total) * 100) : 0 };
    },
  }),
  route({
    method: "POST",
    path: "/admin/questions/analyze-batch/:id/cancel",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const batch = (await db.select().from(questionAnalysisBatches).where(eq(questionAnalysisBatches.id, ctx.params.id)).limit(1))[0];
      if (!batch) throw notFound("找不到批次分析");
      const updated = (await db.update(questionAnalysisBatches).set({ status: "cancelled", errorMessage: `由管理員 ${admin.userId} 取消`, updatedAt: new Date(), completedAt: new Date() }).where(and(eq(questionAnalysisBatches.id, batch.id), eq(questionAnalysisBatches.status, "running"))).returning())[0];
      return { batch: updated ?? batch, cancelled: Boolean(updated) };
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
        const logs = await db.select({ id: systemLogs.id, userId: systemLogs.userId, userName: users.displayName, userNovaId: users.novaId, level: systemLogs.level, scope: systemLogs.scope, message: systemLogs.message, meta: systemLogs.meta, createdAt: systemLogs.createdAt }).from(systemLogs).leftJoin(users, eq(users.userId, systemLogs.userId)).orderBy(desc(systemLogs.createdAt)).limit(100);
        return { logs };
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
          .select({ userId: aiUsageLogs.userId, displayName: users.displayName, novaId: users.novaId, provider: aiUsageLogs.provider, model: aiUsageLogs.model, feature: aiUsageLogs.feature, success: aiUsageLogs.success, inputTokens: aiUsageLogs.inputTokens, outputTokens: aiUsageLogs.outputTokens, latencyMs: aiUsageLogs.latencyMs, createdAt: aiUsageLogs.createdAt })
          .from(aiUsageLogs)
          .leftJoin(users, eq(users.userId, aiUsageLogs.userId))
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

  /* ----------------------------------------------- registration control */
  route({
    method: "GET",
    path: "/admin/registration-control",
    auth: "admin",
    handler: async () => ({ registration: await getRegistrationControl() }),
  }),
  route({
    method: "PUT",
    path: "/admin/registration-control",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ enabled: z.boolean(), reason: z.string().max(500).default(""), reopeningAt: z.string().datetime().nullable().default(null), notice: z.string().max(1000).default("") }));
      const before = await getRegistrationControl();
      const value = { ...body, updatedAt: new Date().toISOString() };
      const rows = await db.insert(platformSettings).values({ key: "registration_control", value }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } }).returning();
      await adminLog({ actorId: admin.userId, action: "settings.registration_control.update", targetType: "setting", targetId: "registration_control", reason: body.reason || (body.enabled ? "重新開放註冊" : "暫停註冊"), before, after: value, ip: ctx.ip });
      return { registration: { ...body, updatedAt: rows[0]?.updatedAt?.toISOString?.() ?? value.updatedAt } };
    },
  }),

  /* -------------------------------------------------------- online PK */
  route({
    method: "GET",
    path: "/admin/pk/config",
    auth: "admin",
    handler: async () => ({ config: await getPkConfig() }),
  }),
  route({
    method: "PUT",
    path: "/admin/pk/config",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ value: z.record(z.string(), z.unknown()) }));
      const config = normalizePkConfig(body.value);
      const rows = await db.insert(platformSettings).values({ key: "online_pk_config", value: config }).onConflictDoUpdate({ target: platformSettings.key, set: { value: config, updatedAt: new Date() } }).returning();
      await adminLog({ actorId: admin.userId, action: "pk.config.update", targetType: "platform", targetId: "online_pk_config", after: config, ip: ctx.ip });
      await db.insert(pkAuditLogs).values({ adminUserId: admin.userId, action: "config_update", reason: "更新線上 PK 平台設定", after: config as Record<string, unknown> });
      return { config, setting: rows[0] };
    },
  }),
  route({
    method: "GET",
    path: "/admin/pk/overview",
    auth: "admin",
    handler: async () => {
      const now = new Date();
      const [online, pkOnline, waitingRooms, liveMatches, matching, anomalies] = await Promise.all([
        db.select({ count: sql<number>`count(distinct ${pkPresence.userId})::int` }).from(pkPresence).where(gte(pkPresence.expiresAt, now)),
        db.select({ count: sql<number>`count(distinct ${pkPresence.userId})::int` }).from(pkPresence).where(and(gte(pkPresence.expiresAt, now), sql`${pkPresence.currentMatchId} is not null`)),
        db.select({ count: sql<number>`count(*)::int` }).from(pkRooms).where(eq(pkRooms.status, "waiting")),
        db.select({ count: sql<number>`count(*)::int` }).from(pkMatches).where(sql`${pkMatches.status} in ('countdown', 'in_progress', 'paused')`),
        db.select({ count: sql<number>`count(*)::int` }).from(pkMatches).where(eq(pkMatches.status, "matching")),
        db.select().from(pkMatchEvents).where(eq(pkMatchEvents.eventType, "anomaly_detected")).orderBy(desc(pkMatchEvents.createdAt)).limit(30),
      ]);
      const matches = await db.select({ match: pkMatches, roomName: pkRooms.name }).from(pkMatches).leftJoin(pkRooms, eq(pkRooms.id, pkMatches.roomId)).orderBy(desc(pkMatches.createdAt)).limit(30);
      const withCounts = [];
      for (const row of matches) {
        const count = await db.select({ count: sql<number>`count(*)::int` }).from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, row.match.id), eq(pkMatchPlayers.role, "player")));
        withCounts.push({ ...row.match, roomName: row.roomName ?? null, playerCount: Number(count[0]?.count ?? 0) });
      }
      return { config: await getPkConfig(), stats: { online: Number(online[0]?.count ?? 0), pkOnline: Number(pkOnline[0]?.count ?? 0), waitingRooms: Number(waitingRooms[0]?.count ?? 0), liveMatches: Number(liveMatches[0]?.count ?? 0), matching: Number(matching[0]?.count ?? 0) }, matches: withCounts, anomalies };
    },
  }),
  route({
    method: "GET",
    path: "/admin/pk/matches/:id",
    auth: "admin",
    handler: async (ctx) => {
      const match = (await db.select().from(pkMatches).where(eq(pkMatches.id, ctx.params.id)).limit(1))[0];
      if (!match) throw notFound("找不到 PK 賽場");
      const [players, questions, events] = await Promise.all([
        db.select({ player: pkMatchPlayers, displayName: users.displayName, novaId: users.novaId }).from(pkMatchPlayers).innerJoin(users, eq(users.userId, pkMatchPlayers.userId)).where(eq(pkMatchPlayers.matchId, match.id)).orderBy(asc(pkMatchPlayers.rank), desc(pkMatchPlayers.score)),
        db.select().from(pkMatchQuestions).where(eq(pkMatchQuestions.matchId, match.id)).orderBy(asc(pkMatchQuestions.orderIndex)),
        db.select().from(pkMatchEvents).where(eq(pkMatchEvents.matchId, match.id)).orderBy(desc(pkMatchEvents.sequence)).limit(100),
      ]);
      return { match, players, questions, events };
    },
  }),
  route({
    method: "POST",
    path: "/admin/pk/matches/:id/control",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ action: z.enum(["pause", "resume", "end", "cancel", "close_join", "remove_player", "lock_room"]), reason: z.string().trim().min(1).max(500), targetUserId: z.string().uuid().optional() }));
      const match = (await db.select().from(pkMatches).where(eq(pkMatches.id, ctx.params.id)).limit(1))[0];
      if (!match) throw notFound("找不到 PK 賽場");
      const before = { status: match.status, allowLateJoin: match.allowLateJoin, roomId: match.roomId };
      if (body.action === "pause") {
        if (match.status !== "in_progress") throw conflict("只有進行中的 PK 可以暫停");
        await db.update(pkMatches).set({ status: "paused", updatedAt: new Date() }).where(and(eq(pkMatches.id, match.id), eq(pkMatches.status, "in_progress")));
      } else if (body.action === "resume") {
        if (match.status !== "paused") throw conflict("只有暫停中的 PK 可以恢復");
        await db.update(pkMatches).set({ status: "in_progress", updatedAt: new Date() }).where(and(eq(pkMatches.id, match.id), eq(pkMatches.status, "paused")));
      } else if (body.action === "end") {
        await finishPkMatch(match.id);
      } else if (body.action === "cancel") {
        await db.update(pkMatches).set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(pkMatches.id, match.id));
        await db.update(pkRooms).set({ status: "closed", updatedAt: new Date() }).where(eq(pkRooms.matchId, match.id));
      } else if (body.action === "close_join" || body.action === "lock_room") {
        await db.update(pkMatches).set({ allowLateJoin: false, updatedAt: new Date() }).where(eq(pkMatches.id, match.id));
        await db.update(pkRooms).set({ status: "locked", updatedAt: new Date() }).where(eq(pkRooms.matchId, match.id));
      } else {
        if (!body.targetUserId) throw badRequest("移除玩家需要 targetUserId");
        await db.update(pkMatchPlayers).set({ connectionState: "disconnected", role: "spectator", finishedAt: new Date() }).where(and(eq(pkMatchPlayers.matchId, match.id), eq(pkMatchPlayers.userId, body.targetUserId)));
      }
      const afterMatch = (await db.select().from(pkMatches).where(eq(pkMatches.id, match.id)).limit(1))[0];
      const after = afterMatch ? { status: afterMatch.status, allowLateJoin: afterMatch.allowLateJoin, roomId: afterMatch.roomId } : null;
      await db.insert(pkAuditLogs).values({ adminUserId: admin.userId, matchId: match.id, targetUserId: body.targetUserId ?? null, action: body.action, reason: body.reason, before, after });
      await adminLog({ actorId: admin.userId, action: `pk.match.${body.action}`, targetType: "pk_match", targetId: match.id, reason: body.reason, before, after, ip: ctx.ip });
      publishPkEvent(match.id, { type: "admin_control", payload: { action: body.action, reason: body.reason } });
      return { match: afterMatch, action: body.action };
    },
  }),
  route({
    method: "GET",
    path: "/admin/pk/audit",
    auth: "admin",
    handler: async (ctx) => {
      const limit = Math.min(200, Math.max(1, Number(ctx.query.get("limit") ?? 100)));
      return { logs: await db.select({ log: pkAuditLogs, adminName: users.displayName }).from(pkAuditLogs).innerJoin(users, eq(users.userId, pkAuditLogs.adminUserId)).orderBy(desc(pkAuditLogs.createdAt)).limit(limit) };
    },
  }),
  route({
    method: "GET",
    path: "/admin/pk/activities",
    auth: "admin",
    handler: async () => ({ activities: await db.select().from(pkActivities).orderBy(desc(pkActivities.startsAt)) }),
  }),
  route({
    method: "POST",
    path: "/admin/pk/activities",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ name: z.string().trim().min(1).max(120), cover: z.string().max(8).default("⚔️"), subject: z.string().min(1).max(40), scope: z.string().max(120).default(""), description: z.string().max(1000).default(""), startsAt: z.string().datetime(), endsAt: z.string().datetime(), questionCount: z.number().int().min(5).max(50).default(10), difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), eligibility: z.record(z.string(), z.unknown()).default({}), rewardNova: z.number().int().min(0).max(1000).default(50), rewardXp: z.number().int().min(0).max(2000).default(100), status: z.enum(["draft", "published", "closed"]).default("draft") }));
      if (new Date(body.endsAt) <= new Date(body.startsAt)) throw badRequest("活動結束時間必須晚於開始時間");
      const rows = await db.insert(pkActivities).values({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), createdBy: admin.userId }).returning();
      await adminLog({ actorId: admin.userId, action: "pk.activity.create", targetType: "pk_activity", targetId: rows[0].id, after: rows[0] as unknown as Record<string, unknown>, ip: ctx.ip });
      return { activity: rows[0] };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/pk/activities/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ name: z.string().trim().min(1).max(120).optional(), cover: z.string().max(8).optional(), subject: z.string().min(1).max(40).optional(), scope: z.string().max(120).optional(), description: z.string().max(1000).optional(), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional(), questionCount: z.number().int().min(5).max(50).optional(), difficulty: z.enum(["easy", "normal", "hard"]).optional(), eligibility: z.record(z.string(), z.unknown()).optional(), rewardNova: z.number().int().min(0).max(1000).optional(), rewardXp: z.number().int().min(0).max(2000).optional(), status: z.enum(["draft", "published", "closed"]).optional() }));
      const current = (await db.select().from(pkActivities).where(eq(pkActivities.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到 PK 活動");
      const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
      const endsAt = body.endsAt ? new Date(body.endsAt) : current.endsAt;
      if (endsAt <= startsAt) throw badRequest("活動結束時間必須晚於開始時間");
      const rows = await db.update(pkActivities).set({ ...body, startsAt, endsAt, updatedAt: new Date() }).where(eq(pkActivities.id, ctx.params.id)).returning();
      await adminLog({ actorId: admin.userId, action: "pk.activity.update", targetType: "pk_activity", targetId: ctx.params.id, before: current as unknown as Record<string, unknown>, after: rows[0] as unknown as Record<string, unknown>, ip: ctx.ip });
      return { activity: rows[0] };
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
      const subscribedRows = targets.length ? await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, targets)) : [];
      const subscribedUsers = new Set(subscribedRows.map((row) => row.userId));
      let notified = 0;
      let pushSent = 0;
      let pushAttempted = 0;
      let pushFailed = 0;
      for (const userId of targets) {
        const created = await notify({ userId, kind: "admin_push_test", title, body: message, link: body?.link ?? "/dashboard", push: false, dedupeKey: `push-test:${admin.userId}:${Date.now()}:${userId}` });
        if (created) notified += 1;
        if (!subscribedUsers.has(userId)) continue;
        pushAttempted += 1;
        const result = await sendPush(userId, { title, body: message, link: body?.link ?? "/dashboard", vibrate: [120, 60, 120] });
        pushSent += result.sent;
        pushFailed += result.failed;
      }
      await adminLog({ actorId: admin.userId, action: "push.test", targetType: "audience", targetId: body?.audience ?? "all", after: { title, message, targets: targets.length, subscribedUsers: subscribedUsers.size, pushAttempted, pushFailed, notified, pushSent, configured: pushConfigured() }, ip: ctx.ip });
      return { targets: targets.length, subscribedUsers: subscribedUsers.size, pushAttempted, pushFailed, notified, pushSent, configured: pushConfigured() };
    },
  }),
];
