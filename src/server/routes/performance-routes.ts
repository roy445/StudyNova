import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiUsageLogs, systemLogs } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { todayStr } from "../core";

const metricSchema = z.object({
  name: z.enum(["FCP", "LCP", "CLS", "TBT", "TTI"]),
  value: z.number().finite().min(0).max(300000),
  route: z.string().max(160).default("/"),
  navigationType: z.string().max(40).optional(),
  device: z.string().max(40).optional(),
});

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 100) / 100;
}

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/performance/vitals",
    auth: "optional",
    rate: { limit: 600, windowSec: 3600, key: "performance-vitals" },
    handler: async (ctx) => {
      const body = await ctx.json(metricSchema);
      await db.insert(systemLogs).values({ level: "metric", scope: "web-vitals", message: body.name, meta: { name: body.name, value: body.value, route: body.route, navigationType: body.navigationType ?? "", device: body.device ?? "unknown", userId: ctx.user?.userId ?? null, timestamp: new Date().toISOString() } });
      return { recorded: true };
    },
  }),
  route({
    method: "GET",
    path: "/admin/performance",
    auth: "admin",
    handler: async () => {
      const since = new Date(Date.now() - 7 * 86400000);
      const perfRows = await db.select().from(systemLogs).where(and(eq(systemLogs.level, "perf"), gte(systemLogs.createdAt, since))).orderBy(desc(systemLogs.createdAt)).limit(5000);
      const vitalRows = await db.select().from(systemLogs).where(and(eq(systemLogs.level, "metric"), eq(systemLogs.scope, "web-vitals"), gte(systemLogs.createdAt, since))).orderBy(desc(systemLogs.createdAt)).limit(5000);
      const aiRows = await db.select({ latency: aiUsageLogs.latencyMs, success: aiUsageLogs.success, feature: aiUsageLogs.feature }).from(aiUsageLogs).where(gte(aiUsageLogs.createdAt, since)).limit(5000);
      const durations = perfRows.map((row) => Number(row.meta.durationMs ?? 0)).filter((value) => value > 0);
      const apiErrors = perfRows.filter((row) => Number(row.meta.status ?? 200) >= 400).length;
      const vitals = Object.fromEntries(["FCP", "LCP", "CLS", "TBT", "TTI"].map((name) => {
        const values = vitalRows.filter((row) => row.message === name).map((row) => Number(row.meta.value ?? 0));
        return [name, { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) }];
      }));
      const aiLatency = aiRows.map((row) => Number(row.latency ?? 0)).filter((value) => value > 0);
      return {
        window: { since: since.toISOString(), until: new Date().toISOString() },
        homepage: vitals,
        api: { requests: durations.length, p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), p99: percentile(durations, 0.99), errorRate: durations.length ? apiErrors / durations.length : 0 },
        ai: { requests: aiRows.length, averageMs: aiLatency.length ? Math.round(aiLatency.reduce((a, b) => a + b, 0) / aiLatency.length) : null, p95: percentile(aiLatency, 0.95), failures: aiRows.filter((row) => !row.success).length },
        upload: { averageSpeedBytesPerSecond: null, failureRate: null },
        database: { p95: null },
        cache: { hitRate: null },
        recent: perfRows.slice(0, 100).map((row) => ({ route: row.meta.route ?? row.message, method: row.meta.method ?? "", status: row.meta.status ?? 0, durationMs: row.meta.durationMs ?? 0, requestId: row.meta.requestId ?? "", timestamp: row.createdAt })),
        collectedAt: new Date().toISOString(),
        date: todayStr(),
      };
    },
  }),
];
