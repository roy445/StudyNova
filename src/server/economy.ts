import { and, eq, sql, desc, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  novaAccounts,
  novaTransactions,
  xpTransactions,
  assistantProfiles,
  assistantLevels,
  memberships,
  membershipHistory,
  featurePermissions,
  featureUsage,
  achievements,
  userAchievements,
  dailyTasks,
  notifications,
  adminLogs,
  activities,
  activityParticipants,
  users,
} from "@/db/schema";
import { fail, todayStr } from "./core";
import { classifyQuotaDatabaseError, type FeaturePermissionPolicy, serverDefaultForFeature } from "./quota-policy";

/* ------------------------------------------------------------ helpers */

export async function ensureUserEconomy(userId: string) {
  await db.insert(novaAccounts).values({ userId }).onConflictDoNothing();
  await db.insert(assistantProfiles).values({ userId }).onConflictDoNothing();
  await db.insert(memberships).values({ userId, tier: "free" }).onConflictDoNothing();
}

export async function isProUser(userId: string): Promise<boolean> {
  const rows = await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1);
  const m = rows[0];
  if (!m || m.tier !== "pro") return false;
  return !m.expiresAt || new Date(m.expiresAt) > new Date();
}

/* --------------------------------------------------------------- NOVA */

export type NovaGrant = {
  userId: string;
  amount: number;
  reason: string;
  source?: string;
  actorId?: string | null;
  idempotencyKey: string;
};

/** Atomic, idempotent Nova mutation. Negative amount = spend (never below zero). */
export async function grantNova(g: NovaGrant): Promise<{ applied: boolean; balance: number }> {
  if (!Number.isInteger(g.amount) || g.amount === 0) throw fail("NOVA_INVALID_AMOUNT");
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ balanceAfter: novaTransactions.balanceAfter })
      .from(novaTransactions)
      .where(eq(novaTransactions.idempotencyKey, g.idempotencyKey))
      .limit(1);
    if (existing[0]) return { applied: false, balance: existing[0].balanceAfter };

    await tx.insert(novaAccounts).values({ userId: g.userId }).onConflictDoNothing();

    const updated = await tx
      .update(novaAccounts)
      .set({
        balance: sql`${novaAccounts.balance} + ${g.amount}`,
        lifetimeEarned: sql`${novaAccounts.lifetimeEarned} + ${g.amount > 0 ? g.amount : 0}`,
        lifetimeSpent: sql`${novaAccounts.lifetimeSpent} + ${g.amount < 0 ? -g.amount : 0}`,
        updatedAt: new Date(),
      })
      .where(
        g.amount < 0
          ? and(eq(novaAccounts.userId, g.userId), gte(novaAccounts.balance, -g.amount))
          : eq(novaAccounts.userId, g.userId),
      )
      .returning({ balance: novaAccounts.balance });

    if (!updated[0]) throw fail("NOVA_INSUFFICIENT");

    await tx.insert(novaTransactions).values({
      userId: g.userId,
      amount: g.amount,
      balanceAfter: updated[0].balance,
      reason: g.reason.slice(0, 200),
      source: g.source ?? "system",
      actorId: g.actorId ?? null,
      idempotencyKey: g.idempotencyKey,
    });
    return { applied: true, balance: updated[0].balance };
  });
}

export async function novaBalance(userId: string): Promise<number> {
  const rows = await db.select({ balance: novaAccounts.balance }).from(novaAccounts).where(eq(novaAccounts.userId, userId)).limit(1);
  return rows[0]?.balance ?? 0;
}

/** Admin-only adjustment: unlike normal spending, this may intentionally produce a negative balance. */
export async function adjustNovaByAdmin(params: { userId: string; amount: number; reason: string; actorId: string; idempotencyKey: string }) {
  if (!Number.isInteger(params.amount) || params.amount === 0) throw fail("NOVA_INVALID_AMOUNT");
  return db.transaction(async (tx) => {
    const existing = await tx.select({ balanceAfter: novaTransactions.balanceAfter }).from(novaTransactions).where(eq(novaTransactions.idempotencyKey, params.idempotencyKey)).limit(1);
    if (existing[0]) return { applied: false, balance: existing[0].balanceAfter };
    await tx.insert(novaAccounts).values({ userId: params.userId }).onConflictDoNothing();
    const updated = await tx.update(novaAccounts).set({ balance: sql`${novaAccounts.balance} + ${params.amount}`, lifetimeEarned: sql`${novaAccounts.lifetimeEarned} + ${params.amount > 0 ? params.amount : 0}`, lifetimeSpent: sql`${novaAccounts.lifetimeSpent} + ${params.amount < 0 ? -params.amount : 0}`, updatedAt: new Date() }).where(eq(novaAccounts.userId, params.userId)).returning({ balance: novaAccounts.balance });
    if (!updated[0]) throw new Error("找不到使用者");
    await tx.insert(novaTransactions).values({ userId: params.userId, amount: params.amount, balanceAfter: updated[0].balance, reason: params.reason.slice(0, 200), source: "admin_adjustment", actorId: params.actorId, idempotencyKey: params.idempotencyKey });
    return { applied: true, balance: updated[0].balance };
  });
}

/* ----------------------------------------------------------------- XP */

export async function grantXp(params: { userId: string; amount: number; reason: string; idempotencyKey: string }) {
  if (!Number.isInteger(params.amount) || params.amount <= 0) throw fail("NOVA_XP_INVALID");
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ totalAfter: xpTransactions.totalAfter })
      .from(xpTransactions)
      .where(eq(xpTransactions.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing[0]) return { applied: false, total: existing[0].totalAfter, levelUp: false, level: 0 };

    await tx.insert(assistantProfiles).values({ userId: params.userId }).onConflictDoNothing();
    const updated = await tx
      .update(assistantProfiles)
      .set({ xp: sql`${assistantProfiles.xp} + ${params.amount}`, updatedAt: new Date() })
      .where(eq(assistantProfiles.userId, params.userId))
      .returning({ xp: assistantProfiles.xp, level: assistantProfiles.level });

    const total = updated[0]?.xp ?? params.amount;
    await tx.insert(xpTransactions).values({
      userId: params.userId,
      amount: params.amount,
      totalAfter: total,
      reason: params.reason.slice(0, 200),
      idempotencyKey: params.idempotencyKey,
    });

    const levels = await tx.select().from(assistantLevels).orderBy(assistantLevels.level);
    const eligible = levels.filter((l) => total >= l.requiredXp).pop();
    let levelUp = false;
    let level = updated[0]?.level ?? 1;
    if (eligible && eligible.level > level) {
      await tx.update(assistantProfiles).set({ level: eligible.level }).where(eq(assistantProfiles.userId, params.userId));
      level = eligible.level;
      levelUp = true;
      await tx.insert(notifications).values({
        userId: params.userId,
        kind: "novi",
        title: `Novi 升級到 Lv.${eligible.level}｜${eligible.name}`,
        body: `新能力解鎖：${eligible.ability}`,
        link: "/profile",
        dedupeKey: `novi-level-${params.userId}-${eligible.level}`,
      }).onConflictDoNothing();
    }
    return { applied: true, total, levelUp, level };
  });
}

/** Learning reward: Nova Pro doubles both Nova and XP. */
export async function grantLearningReward(params: {
  userId: string;
  nova: number;
  xp: number;
  reason: string;
  idempotencyKey: string;
}) {
  const pro = await isProUser(params.userId);
  const mult = pro ? 2 : 1;
  const nova = params.nova * mult;
  const xp = params.xp * mult;
  const novaRes = nova > 0 ? await grantNova({ userId: params.userId, amount: nova, reason: params.reason, source: "learning", idempotencyKey: `nova:${params.idempotencyKey}` }) : null;
  const xpRes = xp > 0 ? await grantXp({ userId: params.userId, amount: xp, reason: params.reason, idempotencyKey: `xp:${params.idempotencyKey}` }) : null;
  return { nova, xp, doubled: pro, balance: novaRes?.balance ?? (await novaBalance(params.userId)), levelUp: xpRes?.levelUp ?? false, level: xpRes?.level ?? 0 };
}

/* ------------------------------------------------------- FEATURE GATE */
type QuotaPermission = FeaturePermissionPolicy;

function throwQuotaDatabaseError(error: unknown, subsystem: string): never {
  const raw = error instanceof Error ? error.message : String(error);
  const category = classifyQuotaDatabaseError(error);
  console.error("[quota] database failure", { subsystem, category, error: raw.slice(0, 240) });
  if (category === "connection") throw fail("SYS_DB_UNAVAILABLE", { details: { subsystem, category } });
  if (category === "permission_denied") throw fail("PERM_DENIED", { details: { subsystem, category } });
  throw fail("SYS_INTERNAL", { details: { subsystem, category } });
}

export type QuotaState = {
  feature: string;
  label: string;
  enabled: boolean;
  proOnly: boolean;
  limit: number;
  used: number;
  remaining: number;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  unlimited: boolean;
  novaCost: number;
};

export async function featureState(userId: string, feature: string): Promise<QuotaState> {
  let perm: QuotaPermission | undefined;
  try {
    // `feature` has a unique index; avoid parameterized LIMIT in the production pg path.
    // Some hosted PostgreSQL proxies have emitted an incomplete `limit` fragment here.
    const rows = await db.select().from(featurePermissions).where(eq(featurePermissions.feature, feature));
    perm = rows[0] as QuotaPermission | undefined;
  } catch (error) {
    throwQuotaDatabaseError(error, "feature_permissions");
  }
  perm = perm ?? serverDefaultForFeature(feature);
  if (!perm) {
    return { feature, label: feature, enabled: true, proOnly: false, limit: 0, used: 0, remaining: 0, monthlyLimit: 0, monthlyUsed: 0, monthlyRemaining: Number.MAX_SAFE_INTEGER, unlimited: true, novaCost: 0 };
  }
  const adminRows = await db.select({ role: users.role }).from(users).where(eq(users.userId, userId)).limit(1);
  const isAdmin = adminRows[0]?.role === "admin" || adminRows[0]?.role === "owner";
  if (isAdmin) {
    return { feature, label: perm.label, enabled: perm.enabled, proOnly: false, limit: -1, used: 0, remaining: Number.MAX_SAFE_INTEGER, monthlyLimit: -1, monthlyUsed: 0, monthlyRemaining: Number.MAX_SAFE_INTEGER, unlimited: true, novaCost: 0 };
  }
  const pro = await isProUser(userId);
  const today = todayStr();
  const usageRows = await db
    .select()
    .from(featureUsage)
    .where(and(eq(featureUsage.userId, userId), eq(featureUsage.feature, feature), eq(featureUsage.usageDate, today)))
    .limit(1);
  const usage = usageRows[0];
  const month = today.slice(0, 7);
  const monthlyRows = await db.select({ total: sql<number>`coalesce(sum(${featureUsage.count}), 0)` }).from(featureUsage).where(and(eq(featureUsage.userId, userId), eq(featureUsage.feature, feature), sql`${featureUsage.usageDate} like ${month + "%"}`));
  const monthlyUsed = Number(monthlyRows[0]?.total ?? 0);
  const limit = pro ? Number(perm.proDailyLimit ?? 0) : Number(perm.freeDailyLimit ?? 0);
  // 舊資料可能尚未填 monthly_limit；對已有每日配額的功能採用 30 天預設，
  // 管理員若填入明確月度上限則以後台設定為準。
  const monthlyLimit = perm.monthlyLimit > 0 ? perm.monthlyLimit : limit > 0 ? limit * 30 : 0;
  const unlimited = Boolean(usage?.unlimited) || limit < 0;
  const used = usage?.count ?? 0;
  return {
    feature,
    label: perm.label,
    enabled: perm.enabled,
    proOnly: perm.proOnly,
    limit,
    used,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    monthlyLimit,
    monthlyUsed,
    monthlyRemaining: monthlyLimit <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, monthlyLimit - monthlyUsed),
    unlimited,
    novaCost: perm.novaCost,
  };
}

/** Atomically consume one unit of a gated feature. Throws when unavailable. */
export async function consumeFeature(userId: string, feature: string, units = 1, idempotencyKey?: string): Promise<QuotaState> {
  const state = await featureState(userId, feature);
  const chargeKey = idempotencyKey ?? `feat:${userId}:${feature}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  if (idempotencyKey && state.novaCost > 0) {
    const priorCharge = await db.select({ id: novaTransactions.id }).from(novaTransactions).where(eq(novaTransactions.idempotencyKey, chargeKey)).limit(1);
    if (priorCharge[0]) return state;
  }
  if (!state.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: `「${state.label}」目前已停用` });
  const pro = await isProUser(userId);
  if (state.proOnly && !pro) throw fail("QUOTA_PRO_REQUIRED", { message: `「${state.label}」是 Nova Pro 專屬功能` });
  if (!state.unlimited && state.limit <= 0) {
    throw fail("QUOTA_NOT_IN_PLAN", { message: `「${state.label}」在你目前的方案中未開放` });
  }
  if (state.monthlyLimit > 0 && state.monthlyUsed + units > state.monthlyLimit) {
    throw fail("QUOTA_EXHAUSTED", { message: `本月「${state.label}」已達上限（${state.monthlyLimit} 次）`, details: { feature, limit: state.monthlyLimit, period: "monthly" } });
  }
  const today = todayStr();
  await db
    .insert(featureUsage)
    .values({ userId, feature, usageDate: today, count: 0 })
    .onConflictDoNothing();

  if (!state.unlimited) {
    const updated = await db
      .update(featureUsage)
      .set({ count: sql`${featureUsage.count} + ${units}` })
      .where(
        and(
          eq(featureUsage.userId, userId),
          eq(featureUsage.feature, feature),
          eq(featureUsage.usageDate, today),
          sql`(${featureUsage.unlimited} = true or ${featureUsage.count} + ${units} <= ${state.limit})`,
        ),
      )
      .returning({ count: featureUsage.count });
    if (!updated[0]) {
      throw fail("QUOTA_EXHAUSTED", { message: `今日「${state.label}」已達上限（${state.limit} 次）`, details: { feature, limit: state.limit } });
    }
  } else {
    await db
      .update(featureUsage)
      .set({ count: sql`${featureUsage.count} + ${units}` })
      .where(and(eq(featureUsage.userId, userId), eq(featureUsage.feature, feature), eq(featureUsage.usageDate, today)));
  }

  if (state.novaCost > 0) {
    await grantNova({
      userId,
      amount: -state.novaCost * units,
      reason: `使用功能：${state.label}`,
      source: "feature",
      idempotencyKey: chargeKey,
    });
  }
  return featureState(userId, feature);
}

export async function allFeatureStates(userId: string): Promise<QuotaState[]> {
  let features: string[];
  try {
    const perms = await db.select({ feature: featurePermissions.feature }).from(featurePermissions).orderBy(featurePermissions.feature);
    features = perms.map((p) => p.feature);
  } catch (error) {
    throwQuotaDatabaseError(error, "feature_permissions.list");
  }
  const out: QuotaState[] = [];
  for (const feature of features) out.push(await featureState(userId, feature));
  return out;
}

/* ---------------------------------------------------------- ACHIEVEMENT */

export async function bumpAchievement(userId: string, metric: string, value: number) {
  const defs = await db.select().from(achievements).where(eq(achievements.metric, metric));
  const unlocked: Array<{ code: string; title: string; icon: string }> = [];
  for (const def of defs) {
    await db.insert(userAchievements).values({ userId, achievementId: def.id, progress: 0 }).onConflictDoNothing();
    const rows = await db
      .update(userAchievements)
      .set({ progress: sql`greatest(${userAchievements.progress}, ${value})` })
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, def.id)))
      .returning({ progress: userAchievements.progress, unlockedAt: userAchievements.unlockedAt });
    const row = rows[0];
    if (row && !row.unlockedAt && row.progress >= def.target) {
      const claim = await db
        .update(userAchievements)
        .set({ unlockedAt: new Date() })
        .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, def.id), sql`${userAchievements.unlockedAt} is null`))
        .returning({ id: userAchievements.id });
      if (claim[0]) {
        unlocked.push({ code: def.code, title: def.title, icon: def.icon });
        if (def.rewardNova > 0) {
          await grantNova({ userId, amount: def.rewardNova, reason: `成就解鎖：${def.title}`, source: "achievement", idempotencyKey: `ach:nova:${userId}:${def.code}` });
        }
        if (def.rewardXp > 0) {
          await grantXp({ userId, amount: def.rewardXp, reason: `成就解鎖：${def.title}`, idempotencyKey: `ach:xp:${userId}:${def.code}` });
        }
        await db.insert(notifications).values({
          userId,
          kind: "achievement",
          title: `${def.icon} 成就解鎖：${def.title}`,
          body: def.description,
          link: "/profile",
          dedupeKey: `ach:${userId}:${def.code}`,
        }).onConflictDoNothing();
      }
    }
  }
  return unlocked;
}

/* --------------------------------------------------------- DAILY TASKS */

export const DAILY_TASK_TEMPLATES = [
  { code: "focus_minutes", title: "專注學習 25 分鐘", target: 25, rewardNova: 10, rewardXp: 20 },
  { code: "words", title: "完成今日單字練習", target: 5, rewardNova: 8, rewardXp: 15 },
  { code: "quiz", title: "完成 1 份測驗", target: 1, rewardNova: 12, rewardXp: 25 },
  { code: "wrong_review", title: "複習 3 題錯題", target: 3, rewardNova: 10, rewardXp: 20 },
  { code: "material", title: "整理 1 份教材或筆記", target: 1, rewardNova: 8, rewardXp: 15 },
  { code: "sentence", title: "練習 3 個句子", target: 3, rewardNova: 8, rewardXp: 15 },
];

export async function ensureDailyTasks(userId: string, date = todayStr()) {
  for (const t of DAILY_TASK_TEMPLATES) {
    await db
      .insert(dailyTasks)
      .values({ userId, taskDate: date, code: t.code, title: t.title, target: t.target, rewardNova: t.rewardNova, rewardXp: t.rewardXp })
      .onConflictDoNothing();
  }
  return db.select().from(dailyTasks).where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.taskDate, date)));
}

export async function progressDailyTask(userId: string, code: string, delta: number) {
  const date = todayStr();
  await ensureDailyTasks(userId, date);
  await db
    .update(dailyTasks)
    .set({ progress: sql`${dailyTasks.progress} + ${delta}` })
    .where(and(eq(dailyTasks.userId, userId), eq(dailyTasks.taskDate, date), eq(dailyTasks.code, code)));
}

export async function claimDailyTask(userId: string, taskId: string) {
  const rows = await db
    .update(dailyTasks)
    .set({ claimedAt: new Date() })
    .where(and(eq(dailyTasks.id, taskId), eq(dailyTasks.userId, userId), sql`${dailyTasks.claimedAt} is null`, sql`${dailyTasks.progress} >= ${dailyTasks.target}`))
    .returning();
  const task = rows[0];
  if (!task) throw fail("NOVA_TASK_NOT_CLAIMABLE");
  const reward = await grantLearningReward({
    userId,
    nova: task.rewardNova,
    xp: task.rewardXp,
    reason: `每日任務：${task.title}`,
    idempotencyKey: `daily:${task.id}`,
  });
  return { task, reward };
}

/* ---------------------------------------------------------- MEMBERSHIP */

export async function grantMembership(params: {
  userId: string;
  days: number;
  actorId: string;
  reason: string;
  action?: "grant" | "extend" | "revoke";
}) {
  const action = params.action ?? "grant";
  await db.insert(memberships).values({ userId: params.userId, tier: "free" }).onConflictDoNothing();
  const current = (await db.select().from(memberships).where(eq(memberships.userId, params.userId)).limit(1))[0];

  if (action === "revoke") {
    await db
      .update(memberships)
      .set({ tier: "free", expiresAt: null, grantedBy: params.actorId, updatedAt: new Date() })
      .where(eq(memberships.userId, params.userId));
  } else {
    const base = action === "extend" && current?.expiresAt && new Date(current.expiresAt) > new Date() ? new Date(current.expiresAt) : new Date();
    const expiresAt = new Date(base.getTime() + params.days * 86_400_000);
    await db
      .update(memberships)
      .set({ tier: "pro", expiresAt, grantedBy: params.actorId, updatedAt: new Date() })
      .where(eq(memberships.userId, params.userId));
    await db.insert(notifications).values({
      userId: params.userId,
      kind: "membership",
      title: "🎉 恭喜！你已獲得 Nova Pro！",
      body: `到期日：${expiresAt.toISOString().slice(0, 10)}，享有雙倍 Nova 與 XP、金色身分與全部進階 AI 額度。`,
      link: "/profile",
      dedupeKey: `pro:${params.userId}:${expiresAt.getTime()}`,
    }).onConflictDoNothing();
  }

  await db.insert(membershipHistory).values({
    userId: params.userId,
    action,
    tier: action === "revoke" ? "free" : "pro",
    days: action === "revoke" ? 0 : params.days,
    reason: params.reason,
    actorId: params.actorId,
  });
  return db.select().from(memberships).where(eq(memberships.userId, params.userId)).limit(1);
}

export async function adminLog(params: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string;
}) {
  await db.insert(adminLogs).values({
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType ?? "",
    targetId: params.targetId ?? "",
    reason: params.reason ?? "",
    before: params.before ?? null,
    after: params.after ?? null,
    ip: params.ip ?? "",
  });
}

/* ----------------------------------------------------------- ACTIVITY */

export async function progressActivities(userId: string, metric: string, delta: number) {
  const now = new Date();
  const live = await db
    .select()
    .from(activities)
    .where(and(eq(activities.published, true), eq(activities.goalMetric, metric), sql`${activities.startsAt} <= ${now}`, sql`${activities.endsAt} >= ${now}`));
  for (const act of live) {
    await db.insert(activityParticipants).values({ activityId: act.id, userId, progress: 0 }).onConflictDoNothing();
    const rows = await db
      .update(activityParticipants)
      .set({ progress: sql`${activityParticipants.progress} + ${delta}` })
      .where(and(eq(activityParticipants.activityId, act.id), eq(activityParticipants.userId, userId)))
      .returning({ progress: activityParticipants.progress, completedAt: activityParticipants.completedAt });
    const p = rows[0];
    if (p && !p.completedAt && p.progress >= act.goalValue) {
      const done = await db
        .update(activityParticipants)
        .set({ completedAt: new Date() })
        .where(and(eq(activityParticipants.activityId, act.id), eq(activityParticipants.userId, userId), sql`${activityParticipants.completedAt} is null`))
        .returning({ id: activityParticipants.id });
      if (done[0]) {
        await grantLearningReward({ userId, nova: act.rewardNova, xp: act.rewardXp, reason: `活動完成：${act.title}`, idempotencyKey: `activity:${act.id}:${userId}` });
        await db.insert(notifications).values({
          userId,
          kind: "activity",
          title: `${act.cover} 活動完成：${act.title}`,
          body: `你獲得 ${act.rewardNova} Nova 與 ${act.rewardXp} XP！`,
          link: "/challenge",
          dedupeKey: `activity-done:${act.id}:${userId}`,
        }).onConflictDoNothing();
      }
    }
  }
}

export async function novaLedger(userId: string, limit = 50) {
  return db.select().from(novaTransactions).where(eq(novaTransactions.userId, userId)).orderBy(desc(novaTransactions.createdAt)).limit(limit);
}
