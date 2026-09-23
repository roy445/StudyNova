import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { analyticsEvents, auditLogs, memberships, sessions, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { getRegistrationControl } from "../registration";

const eventSchema = z.object({
  eventName: z.string().min(2).max(80).regex(/^[a-z0-9_.:-]+$/),
  route: z.string().max(240).default(""),
  sessionKey: z.string().max(120).default(""),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

function sinceDays(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}
function num(value: unknown) {
  return Number(value ?? 0);
}

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/analytics/events",
    auth: "optional",
    rate: { limit: 120, windowSec: 60, key: "analytics-events" },
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ events: z.array(eventSchema).min(1).max(25) }));
      await db.insert(analyticsEvents).values(body.events.map((event) => ({ ...event, userId: ctx.user?.userId ?? null, durationMs: event.durationMs ?? null })));
      return { accepted: body.events.length };
    },
  }),
  route({
    method: "GET",
    path: "/admin/analytics",
    auth: "admin",
    handler: async (ctx) => {
      const days = Math.min(90, Math.max(1, Number(ctx.query.get("days") ?? 30) || 30));
      const start = sinceDays(days);
      const [visitors, sessionsCount, pageViews, registrations, logins, active, durations, popularFeatures, pages, hours, weekdays, funnel, registration] = await Promise.all([
        db.select({ value: sql<number>`count(distinct ${analyticsEvents.sessionKey})::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), eq(analyticsEvents.eventName, "session_start"))),
        db.select({ value: sql<number>`count(distinct ${analyticsEvents.sessionKey})::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), eq(analyticsEvents.eventName, "session_start"))),
        db.select({ value: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), eq(analyticsEvents.eventName, "page_view"))),
        db.select({ value: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, start)),
        db.select({ value: sql<number>`count(*)::int` }).from(auditLogs).where(and(gte(auditLogs.occurredAt, start), eq(auditLogs.action, "auth.login"))),
        db.select({ value: sql<number>`count(distinct ${analyticsEvents.userId})::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), sql`${analyticsEvents.userId} is not null`)),
        db.select({ average: sql<number>`coalesce(avg(${analyticsEvents.durationMs}) filter (where ${analyticsEvents.eventName} = 'session_end'), 0)::int`, total: sql<number>`coalesce(sum(${analyticsEvents.durationMs}) filter (where ${analyticsEvents.eventName} = 'session_end'), 0)::bigint` }).from(analyticsEvents).where(gte(analyticsEvents.occurredAt, start)),
        db.select({ feature: sql<string>`coalesce(${analyticsEvents.metadata}->>'feature', ${analyticsEvents.eventName})`, users: sql<number>`count(distinct ${analyticsEvents.userId})::int`, uses: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), sql`${analyticsEvents.eventName} in ('feature_use', 'feature_start')`)).groupBy(sql`coalesce(${analyticsEvents.metadata}->>'feature', ${analyticsEvents.eventName})`).orderBy(desc(sql`count(*)`)).limit(12),
        db.select({ route: analyticsEvents.route, views: sql<number>`count(*)::int`, visitors: sql<number>`count(distinct ${analyticsEvents.userId})::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), eq(analyticsEvents.eventName, "page_view"))).groupBy(analyticsEvents.route).orderBy(desc(sql`count(*)`)).limit(20),
        db.select({ hour: sql<number>`extract(hour from ${analyticsEvents.occurredAt})::int`, uses: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), sql`${analyticsEvents.eventName} in ('session_start', 'page_view', 'feature_use')`)).groupBy(sql`extract(hour from ${analyticsEvents.occurredAt})`).orderBy(sql`extract(hour from ${analyticsEvents.occurredAt})`),
        db.select({ weekday: sql<number>`extract(isodow from ${analyticsEvents.occurredAt})::int`, uses: sql<number>`count(*)::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), sql`${analyticsEvents.eventName} in ('session_start', 'page_view', 'feature_use')`)).groupBy(sql`extract(isodow from ${analyticsEvents.occurredAt})`).orderBy(desc(sql`count(*)`)),
        db.select({ eventName: analyticsEvents.eventName, people: sql<number>`count(distinct coalesce(${analyticsEvents.userId}::text, ${analyticsEvents.sessionKey}))::int` }).from(analyticsEvents).where(and(gte(analyticsEvents.occurredAt, start), sql`${analyticsEvents.eventName} in ('register_cta', 'register_view', 'register_started', 'register_submit', 'register_success', 'first_login', 'feature_use')`)).groupBy(analyticsEvents.eventName),
        getRegistrationControl(),
      ]);
      const funnelMap = Object.fromEntries(funnel.map((row) => [row.eventName, num(row.people)]));
      const avgSessionMinutes = Math.round(num(durations[0]?.average) / 60000);
      return {
        range: { days, start: start.toISOString(), end: new Date().toISOString() },
        registration,
        kpis: { visitors: num(visitors[0]?.value), sessions: num(sessionsCount[0]?.value), pageViews: num(pageViews[0]?.value), registrations: num(registrations[0]?.value), logins: num(logins[0]?.value), dau: num(active[0]?.value), avgSessionMinutes, totalMinutes: Math.round(num(durations[0]?.total) / 60000) },
        popularFeatures,
        pages,
        timeOfDay: hours,
        weekdays,
        funnel: funnelMap,
      };
    },
  }),
  route({
    method: "GET",
    path: "/admin/analytics/users/:id",
    auth: "admin",
    handler: async (ctx) => {
      const user = (await db.select({ userId: users.userId, displayName: users.displayName, email: users.email, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.userId, ctx.params.id)).limit(1))[0];
      if (!user) return { user: null };
      const [events, activity, loginSessions, featureUsage, sessionStats] = await Promise.all([
        db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, user.userId)).orderBy(desc(analyticsEvents.occurredAt)).limit(200),
        db.select().from(auditLogs).where(eq(auditLogs.userId, user.userId)).orderBy(desc(auditLogs.occurredAt)).limit(200),
        db.select().from(sessions).where(eq(sessions.userId, user.userId)).orderBy(desc(sessions.createdAt)).limit(50),
        db.select({ feature: sql<string>`coalesce(${analyticsEvents.metadata}->>'feature', ${analyticsEvents.eventName})`, uses: sql<number>`count(*)::int`, firstUsed: sql<string>`min(${analyticsEvents.occurredAt})`, lastUsed: sql<string>`max(${analyticsEvents.occurredAt})` }).from(analyticsEvents).where(and(eq(analyticsEvents.userId, user.userId), sql`${analyticsEvents.eventName} in ('feature_use', 'feature_start')`)).groupBy(sql`coalesce(${analyticsEvents.metadata}->>'feature', ${analyticsEvents.eventName})`).orderBy(desc(sql`count(*)`)),
        db.select({ sessions: sql<number>`count(*)::int`, averageMinutes: sql<number>`coalesce(avg(${analyticsEvents.durationMs}) filter (where ${analyticsEvents.eventName} = 'session_end'), 0)::int`, totalMinutes: sql<number>`coalesce(sum(${analyticsEvents.durationMs}) filter (where ${analyticsEvents.eventName} = 'session_end'), 0)::bigint` }).from(analyticsEvents).where(and(eq(analyticsEvents.userId, user.userId), sql`${analyticsEvents.eventName} = 'session_end'`)),
      ]);
      return { user, events, activity, loginSessions, featureUsage, sessionStats: { ...sessionStats[0], averageMinutes: Math.round(num(sessionStats[0]?.averageMinutes) / 60000), totalMinutes: Math.round(num(sessionStats[0]?.totalMinutes) / 60000) } };
    },
  }),
];
