import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activeAccountScores, aiPolicies, aiProviderHealth, aiUsageLogs, featurePermissions, membershipHistory, memberships, notifications, platformSettings, userTitles, users, analyticsEvents } from "@/db/schema";
import { route } from "../router";
import { monthStart, todayStr } from "../core";
import { notify } from "../notify";
import { aiTokenLimits, runAiJson } from "../ai";
import { SERVER_FEATURE_DEFAULTS } from "../quota-policy";

const period = () => new Date().toISOString().slice(0, 7);
const daysAgo = (days: number) => new Date(Date.now() - Math.max(1, Math.min(365, days)) * 86_400_000);

async function governanceConfig() {
  const row = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "ai_governance_policy")).limit(1))[0];
  return (row?.value ?? { activeRule: { days: 30, minSessions: 4, minFeatureUses: 12, minAiSuccessRate: 0.55, topN: 10, proDays: 31 }, autoGrant: true }) as Record<string, unknown>;
}

async function usageReport(days: number) {
  const since = daysAgo(days);
  const [logs, featureRows, providerRows, userRows] = await Promise.all([
    db.select({ userId: aiUsageLogs.userId, feature: aiUsageLogs.feature, provider: aiUsageLogs.provider, success: aiUsageLogs.success, inputTokens: aiUsageLogs.inputTokens, outputTokens: aiUsageLogs.outputTokens, latencyMs: aiUsageLogs.latencyMs, createdAt: aiUsageLogs.createdAt }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, since)).orderBy(desc(aiUsageLogs.createdAt)).limit(20_000),
    db.select({ feature: aiUsageLogs.feature, uses: sql<number>`count(*)::int`, successes: sql<number>`count(*) filter (where ${aiUsageLogs.success})::int`, inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}),0)::int`, outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}),0)::int`, latencyMs: sql<number>`coalesce(avg(${aiUsageLogs.latencyMs}),0)::int` }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, since)).groupBy(aiUsageLogs.feature).orderBy(desc(sql`count(*)`)),
    db.select({ provider: aiUsageLogs.provider, uses: sql<number>`count(*)::int`, successes: sql<number>`count(*) filter (where ${aiUsageLogs.success})::int`, failures: sql<number>`count(*) filter (where not ${aiUsageLogs.success})::int`, latencyMs: sql<number>`coalesce(avg(${aiUsageLogs.latencyMs}),0)::int` }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, since)).groupBy(aiUsageLogs.provider).orderBy(asc(aiUsageLogs.provider)),
    db.select({ userId: users.userId, displayName: users.displayName, email: users.email, novaId: users.novaId, role: users.role, membership: memberships.tier, expiresAt: memberships.expiresAt }).from(users).leftJoin(memberships, eq(memberships.userId, users.userId)).where(eq(users.status, "active")).orderBy(asc(users.displayName)).limit(10_000),
  ]);
  const [monthTokens, dayTokens] = await Promise.all([
    db.select({ userId: aiUsageLogs.userId, total: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens}), 0)::int` }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, monthStart())).groupBy(aiUsageLogs.userId),
    db.select({ userId: aiUsageLogs.userId, total: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens}), 0)::int` }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, new Date(`${todayStr()}T00:00:00+08:00`))).groupBy(aiUsageLogs.userId),
  ]);
  const monthTokenMap = new Map(monthTokens.filter((row) => row.userId).map((row) => [row.userId as string, Number(row.total ?? 0)]));
  const dayTokenMap = new Map(dayTokens.filter((row) => row.userId).map((row) => [row.userId as string, Number(row.total ?? 0)]));
  const byUser = new Map<string, { uses: number; successes: number; failures: number; inputTokens: number; outputTokens: number; latencyMs: number; features: Map<string, number>; lastUsedAt: string | null }>();
  for (const row of logs) {
    if (!row.userId) continue;
    const current = byUser.get(row.userId) ?? { uses: 0, successes: 0, failures: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, features: new Map<string, number>(), lastUsedAt: null };
    current.uses += 1; current.successes += row.success ? 1 : 0; current.failures += row.success ? 0 : 1; current.inputTokens += row.inputTokens; current.outputTokens += row.outputTokens; current.latencyMs += row.latencyMs; current.features.set(row.feature, (current.features.get(row.feature) ?? 0) + 1); current.lastUsedAt = current.lastUsedAt ?? new Date(row.createdAt).toISOString();
    byUser.set(row.userId, current);
  }
  const usersReport = userRows.map((user) => { const m = byUser.get(user.userId); const pro = user.membership === "pro" && (!user.expiresAt || new Date(user.expiresAt) > new Date()); const limits = aiTokenLimits(pro); return { ...user, uses: m?.uses ?? 0, successes: m?.successes ?? 0, failures: m?.failures ?? 0, successRate: m?.uses ? Number((m.successes / m.uses).toFixed(3)) : 0, inputTokens: m?.inputTokens ?? 0, outputTokens: m?.outputTokens ?? 0, dailyTokens: dayTokenMap.get(user.userId) ?? 0, monthlyTokens: monthTokenMap.get(user.userId) ?? 0, dailyTokenLimit: limits.daily, monthlyTokenLimit: limits.monthly, avgLatencyMs: m?.uses ? Math.round((m.latencyMs ?? 0) / m.uses) : 0, featureCount: m?.features.size ?? 0, featureBreakdown: [...(m?.features.entries() ?? [])].map(([feature, uses]) => ({ feature, uses })).sort((a, b) => b.uses - a.uses), lastUsedAt: m?.lastUsedAt ?? null }; }).sort((a, b) => b.uses - a.uses);
  return { range: { days, since: since.toISOString(), until: new Date().toISOString() }, totals: { users: usersReport.length, activeUsers: usersReport.filter((u) => u.uses > 0).length, uses: logs.length, successes: logs.filter((l) => l.success).length, failures: logs.filter((l) => !l.success).length, inputTokens: logs.reduce((n, l) => n + l.inputTokens, 0), outputTokens: logs.reduce((n, l) => n + l.outputTokens, 0), avgLatencyMs: logs.length ? Math.round(logs.reduce((n, l) => n + l.latencyMs, 0) / logs.length) : 0 }, users: usersReport, features: featureRows, providers: providerRows };
}

async function grantActivePro(selected: Array<{ userId: string; score: number; rank: number; factors?: Record<string, number>; explanation?: string }>, actorId: string, proDays: number) {
  const currentPeriod = period();
  const granted: string[] = [];
  for (const item of selected) {
    const existing = (await db.select().from(activeAccountScores).where(and(eq(activeAccountScores.period, currentPeriod), eq(activeAccountScores.userId, item.userId))).limit(1))[0];
    if (existing?.proGranted) continue;
    const now = new Date();
    const membership = (await db.select().from(memberships).where(eq(memberships.userId, item.userId)).limit(1))[0];
    const base = membership?.expiresAt && new Date(membership.expiresAt) > now ? new Date(membership.expiresAt) : now;
    const expiresAt = new Date(base.getTime() + proDays * 86_400_000);
    await db.insert(memberships).values({ userId: item.userId, tier: "pro", expiresAt, grantedBy: actorId }).onConflictDoUpdate({ target: memberships.userId, set: { tier: "pro", expiresAt, grantedBy: actorId, updatedAt: now } });
    await db.insert(membershipHistory).values({ userId: item.userId, action: "active_account_monthly", tier: "pro", days: proDays, reason: item.explanation || `本月活躍帳號評選第 ${item.rank} 名`, actorId });
    await db.insert(activeAccountScores).values({ period: currentPeriod, userId: item.userId, score: item.score, rank: item.rank, selected: true, factors: item.factors ?? {}, explanation: item.explanation ?? "", proGranted: true }).onConflictDoUpdate({ target: [activeAccountScores.period, activeAccountScores.userId], set: { score: item.score, rank: item.rank, selected: true, factors: item.factors ?? {}, explanation: item.explanation ?? "", proGranted: true } });
    await notify({ userId: item.userId, kind: "membership", title: "本月活躍帳號已獲得 Nova Pro", body: `${item.explanation || "你持續使用 StudyNova 並完成學習活動"}；已自動贈送 ${proDays} 天，不涉及付費。`, link: "/profile?tab=pass", dedupeKey: `active-pro:${currentPeriod}:${item.userId}` });
    granted.push(item.userId);
  }
  return granted;
}

/** Deterministic monthly fallback used by the scheduled job; the admin button can additionally ask Novi to rank the same candidates. */
export async function runMonthlyActiveAccountPromotion(actorId?: string) {
  const config = await governanceConfig();
  const rule = (config.activeRule ?? {}) as Record<string, number>;
  const report = await usageReport(Number(rule.days ?? 30));
  const candidates = report.users.filter((user) => user.uses >= Number(rule.minFeatureUses ?? 12) && user.successRate >= Number(rule.minAiSuccessRate ?? 0.55));
  const selected = candidates.sort((a, b) => (b.uses * b.successRate) - (a.uses * a.successRate)).slice(0, Number(rule.topN ?? 10)).map((user, index) => ({ userId: user.userId, rank: index + 1, score: Number((user.uses * user.successRate).toFixed(2)), factors: { uses: user.uses, successRate: user.successRate, featureCount: user.featureCount }, explanation: `近 ${rule.days ?? 30} 天完成 ${user.uses} 次 AI 學習操作，成功率 ${Math.round(user.successRate * 100)}%，符合活躍帳號規則。` }));
  const admin = actorId ?? (await db.select({ userId: users.userId }).from(users).where(sql`${users.role} in ('owner','admin') and ${users.status} = 'active'`).orderBy(asc(users.role)).limit(1))[0]?.userId;
  if (!admin || config.autoGrant === false) return { period: period(), selected, granted: [] as string[] };
  const granted = await grantActivePro(selected, admin, Number(rule.proDays ?? 31));
  return { period: period(), selected, granted };
}

export const routes = [
  route({ method: "GET", path: "/admin/ai-governance", auth: "admin", handler: async (ctx) => {
    const days = Number(ctx.query.get("days") ?? 30);
    const [report, config, policies, providers, features] = await Promise.all([usageReport(days), governanceConfig(), db.select().from(aiPolicies).orderBy(asc(aiPolicies.feature)), db.select().from(aiProviderHealth).orderBy(asc(aiProviderHealth.priority)), db.select().from(featurePermissions).orderBy(asc(featurePermissions.feature))]);
    return { report, config, policies, providers, features: features.length ? features : SERVER_FEATURE_DEFAULTS };
  }}),
  route({ method: "GET", path: "/admin/ai-governance/export", auth: "admin", handler: async (ctx) => usageReport(Number(ctx.query.get("days") ?? 30)) }),
  route({ method: "PATCH", path: "/admin/ai-governance/policies/:id", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const body = await ctx.json(z.object({ allowDirectAnswer: z.boolean().optional(), requireDetailedAnalysis: z.boolean().optional(), maxHintLevel: z.number().int().min(0).max(5).optional(), systemPolicy: z.string().max(8000).optional(), proOnly: z.boolean().optional(), enabled: z.boolean().optional() })); const row = (await db.update(aiPolicies).set({ ...body, updatedBy: admin.userId, version: sql`${aiPolicies.version} + 1`, updatedAt: new Date() }).where(eq(aiPolicies.id, ctx.params.id)).returning())[0]; return { policy: row }; }}),
  route({ method: "PATCH", path: "/admin/ai-governance/settings", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.record(z.string(), z.unknown())); const row = (await db.insert(platformSettings).values({ key: "ai_governance_policy", value: body }).onConflictDoUpdate({ target: platformSettings.key, set: { value: body, updatedAt: new Date() } }).returning())[0]; return { config: row.value }; }}),
  route({ method: "POST", path: "/admin/ai-governance/analyze-active", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const body = await ctx.json(z.object({ topN: z.number().int().min(1).max(100).default(10), days: z.number().int().min(7).max(90).default(30), grantPro: z.boolean().default(true) })); const report = await usageReport(body.days); const candidates = report.users.filter((u) => u.uses > 0).slice(0, 300); const { data } = await runAiJson<{ selected?: Array<{ userId: string; rank: number; score: number; explanation: string; factors?: Record<string, number> }> }>({ feature: "admin_active_account_analysis", userId: admin.userId, system: "你是 StudyNova 的活躍帳號評選分析器。只能從候選 userId 選出真正活躍、持續、有效使用學習功能的人。不要以花費、付費或管理員身分加分。輸出 JSON。", parts: [{ kind: "text", text: JSON.stringify({ topN: body.topN, candidates }) }], json: true, maxOutputTokens: 5000 }, { selected: [] }); const selected = (data.selected ?? []).filter((x) => candidates.some((c) => c.userId === x.userId)).sort((a, b) => a.rank - b.rank).slice(0, body.topN); const granted = body.grantPro ? await grantActivePro(selected, admin.userId, Number(((await governanceConfig()).activeRule as Record<string, unknown> | undefined)?.proDays ?? 31)) : []; return { period: period(), selected, grantedUserIds: granted, report: { candidates: candidates.length, topN: body.topN } }; }}),
  route({ method: "POST", path: "/admin/ai-governance/titles", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const body = await ctx.json(z.object({ userId: z.string().uuid(), title: z.string().trim().min(1).max(80), description: z.string().max(300).default("") })); await db.update(userTitles).set({ active: false }).where(and(eq(userTitles.userId, body.userId), eq(userTitles.active, true))); const row = (await db.insert(userTitles).values({ ...body, assignedBy: admin.userId }).returning())[0]; return { title: row }; }}),
];
