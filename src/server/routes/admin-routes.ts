import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, gte } from "drizzle-orm";
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
  gradeRecords,
  weeklyExamResults,
  weeklyExamWeeks,
  passwordResetTokens,
  studyRecords,
  platformSettings,
  challenges,
  challengeParticipants,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, fingerprint, notFound, toCsv, monthStart, randomToken, sha256 } from "../core";
import { adminLog, grantMembership, grantNova, grantXp } from "../economy";
import { notify, resolveAudience, sendPush, pushConfigured } from "../notify";
import { providerMetrics, recentAiFailures, aiConfigured } from "../ai";

function csvResponse(filename: string, rows: Array<Record<string, unknown>>) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const routes: RouteDef[] = [
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
      return {
        link,
        expiresAt: new Date(Date.now() + body.expiresMinutes * 60_000).toISOString(),
        customerMessage: `${target.displayName} 您好，\n\n這裡是 StudyNova 客服。依您提出的「${body.reason}」，我們已為您建立密碼重設連結。請於 ${body.expiresMinutes} 分鐘內點擊下方連結完成設定；連結僅能使用一次。\n\n${link}\n\n若這不是您提出的申請，請忽略此信件。` ,
      };
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
    path: "/admin/users/bulk",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          userIds: z.array(z.string().uuid()).min(1).max(200),
          action: z.enum(["block", "unblock", "grant_pro", "extend_pro", "revoke_pro", "gift_nova", "gift_xp", "reset_quota", "set_unlimited", "set_role", "send_notification"]),
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
              await db.update(users).set({ status: body.action === "block" ? "blocked" : "active", updatedAt: new Date() }).where(eq(users.userId, userId));
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
    path: "/admin/features",
    auth: "admin",
    handler: async () => {
      return { features: await db.select().from(featurePermissions).orderBy(asc(featurePermissions.feature)) };
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
          image: z.string().max(400).default(""),
          audience: z.enum(["all", "pro", "users", "group"]).default("all"),
          audienceIds: z.array(z.string().uuid()).max(500).default([]),
          pinned: z.boolean().default(false),
          marquee: z.boolean().default(false),
          notify: z.boolean().default(true),
          push: z.boolean().default(false),
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
          image: body.image,
          audience: body.audience,
          audienceIds: body.audienceIds,
          pinned: body.pinned,
          marquee: body.marquee,
          notify: body.notify,
          push: body.push,
          sortOrder: body.sortOrder,
          startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          createdBy: admin.userId,
        })
        .returning();
      let notified = 0;
      if (body.notify) {
        const targets = await resolveAudience(body.audience, body.audienceIds);
        for (const userId of targets) {
          const created = await notify({
            userId,
            kind: "announcement",
            title: `📢 ${body.title}`,
            body: body.body.slice(0, 200),
            link: "/dashboard",
            dedupeKey: `ann:${rows[0].id}:${userId}`,
            push: body.push,
          });
          if (created) notified += 1;
        }
      }
      await adminLog({ actorId: admin.userId, action: "announcement.create", targetType: "announcement", targetId: rows[0].id, after: { title: body.title, notified }, ip: ctx.ip });
      return { announcement: rows[0], notified };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/announcements/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({ pinned: z.boolean().optional(), marquee: z.boolean().optional(), sortOrder: z.number().int().min(0).max(999).optional(), title: z.string().min(1).max(120).optional(), body: z.string().max(4000).optional() }),
      );
      const rows = await db.update(announcements).set(body).where(eq(announcements.id, ctx.params.id)).returning();
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
          cover: z.string().max(8).default("🎉"),
          kind: z.enum(["weekend_double", "festival", "limited", "streak", "quiz", "focus"]).default("limited"),
          goalMetric: z.enum(["minutes", "quiz", "words", "wrong"]).default("minutes"),
          goalValue: z.number().int().min(1).max(100000),
          rewardNova: z.number().int().min(0).max(10000),
          rewardXp: z.number().int().min(0).max(100000),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          published: z.boolean().default(false),
          sortOrder: z.number().int().min(0).max(999).default(0),
        }),
      );
      const rows = await db
        .insert(activities)
        .values({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) })
        .returning();
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
    path: "/admin/questions/import",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          items: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
        }),
      );
      const schema = z.object({
        subject: z.string().min(1).max(20),
        topic: z.string().max(80).default(""),
        level: z.enum(["junior", "senior"]).default("junior"),
        difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).default("normal"),
        type: z.enum(["single", "multiple", "fill", "truefalse", "short", "reading"]).default("single"),
        stem: z.string().min(1).max(2000),
        options: z.array(z.string().max(400)).max(8).default([]),
        answer: z.array(z.string().max(400)).min(1).max(8),
        explanation: z.string().max(2000).default(""),
      });
      let accepted = 0;
      let imported = 0;
      let skipped = 0;
      const invalid: Array<{ index: number; subject?: string; error: string }> = [];
      for (let i = 0; i < body.items.length; i += 1) {
        const parsed = schema.safeParse(body.items[i]);
        if (!parsed.success) {
          invalid.push({ index: i, subject: String((body.items[i] as Record<string, unknown>).subject ?? ""), error: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
          continue;
        }
        const q = parsed.data;
        if ((q.type === "single" || q.type === "multiple") && !q.answer.every((a) => q.options.includes(a))) {
          invalid.push({ index: i, subject: q.subject, error: "answer 必須是 options 之一" });
          continue;
        }
        accepted += 1;
        const fp = fingerprint(q.subject, q.stem, q.answer.join("|"));
        const rows = await db
          .insert(questions)
          .values({ ownerId: null, origin: "bank", ...q, fingerprint: fp })
          .onConflictDoNothing()
          .returning({ id: questions.id });
        if (rows[0]) imported += 1;
        else skipped += 1;
      }
      await adminLog({ actorId: admin.userId, action: "questions.import", targetType: "questions", targetId: "bank", after: { submitted: body.items.length, accepted, imported, skipped, invalid: invalid.length }, ip: ctx.ip });
      return { submitted: body.items.length, accepted, imported, skipped, invalid };
    },
  }),

  route({
    method: "GET",
    path: "/admin/questions",
    auth: "admin",
    handler: async (ctx) => {
      const subject = ctx.query.get("subject");
      const rows = await db
        .select()
        .from(questions)
        .where(and(eq(questions.origin, "bank"), subject ? eq(questions.subject, subject) : sql`true`))
        .orderBy(desc(questions.createdAt))
        .limit(100);
      const [count] = await db.select({ c: sql<number>`count(*)::int` }).from(questions).where(eq(questions.origin, "bank"));
      return { questions: rows, total: count?.c ?? 0 };
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
