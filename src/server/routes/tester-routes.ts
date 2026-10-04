import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { featurePermissions, issueReports, testerFeedbackComments, testerFeedbackNotificationPreferences, testerFeedbackPosts, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { forbidden, notFound, toCsv } from "../core";
import { isTesterUser, testerFeatures, testerMembers, TESTER_GROUP_NAME } from "../tester";
import { notify } from "../notify";
import { sendAccountEmail, systemAnnouncementEmailTemplate } from "../email";

async function canUseTesterFeedback(user: { userId: string; role: string }) {
  return user.role === "admin" || user.role === "owner" || await isTesterUser(user.userId);
}

async function feedbackBoard() {
  const posts = await db.select({
    id: testerFeedbackPosts.id,
    title: testerFeedbackPosts.title,
    body: testerFeedbackPosts.body,
    category: testerFeedbackPosts.category,
    status: testerFeedbackPosts.status,
    pinned: testerFeedbackPosts.pinned,
    createdAt: testerFeedbackPosts.createdAt,
    updatedAt: testerFeedbackPosts.updatedAt,
    authorId: testerFeedbackPosts.authorId,
    authorName: users.displayName,
  }).from(testerFeedbackPosts).innerJoin(users, eq(users.userId, testerFeedbackPosts.authorId)).orderBy(desc(testerFeedbackPosts.pinned), desc(testerFeedbackPosts.updatedAt)).limit(80);
  const comments = posts.length ? await db.select({
    id: testerFeedbackComments.id,
    postId: testerFeedbackComments.postId,
    body: testerFeedbackComments.body,
    createdAt: testerFeedbackComments.createdAt,
    authorId: testerFeedbackComments.authorId,
    authorName: users.displayName,
  }).from(testerFeedbackComments).innerJoin(users, eq(users.userId, testerFeedbackComments.authorId)).where(inArray(testerFeedbackComments.postId, posts.map((post) => post.id))).orderBy(asc(testerFeedbackComments.createdAt)) : [];
  return posts.map((post) => ({ ...post, comments: comments.filter((comment) => comment.postId === post.id) }));
}

async function feedbackAudience(excludeUserId: string) {
  const [admins, testers] = await Promise.all([
    db.select({ userId: users.userId, email: users.email, displayName: users.displayName }).from(users).where(and(eq(users.status, "active"), inArray(users.role, ["admin", "owner"]))),
    db.select({ userId: users.userId, email: users.email, displayName: users.displayName }).from(users).where(and(eq(users.role, "tester"), eq(users.status, "active"))),
  ]);
  return [...new Map([...admins, ...testers].filter((user) => user.userId !== excludeUserId).map((user) => [user.userId, user])).values()];
}

async function sendFeedbackAlerts(input: { recipientIds: string[]; excludeUserId: string; title: string; body: string; postId: string; baseUrl: string }) {
  const recipientIds = [...new Set(input.recipientIds)].filter((userId) => userId !== input.excludeUserId);
  if (!recipientIds.length) return;
  await Promise.all(recipientIds.map((userId) => notify({ userId, kind: "tester_feedback", title: input.title, body: input.body, link: "/tester", dedupeKey: `tester-feedback:${input.postId}:${userId}:${Date.now()}`, push: true })));
  const preferences = await db.select({ userId: testerFeedbackNotificationPreferences.userId }).from(testerFeedbackNotificationPreferences).where(and(eq(testerFeedbackNotificationPreferences.emailEnabled, true), inArray(testerFeedbackNotificationPreferences.userId, recipientIds)));
  if (!preferences.length) return;
  const emailUsers = await db.select({ userId: users.userId, email: users.email, displayName: users.displayName }).from(users).where(inArray(users.userId, preferences.map((item) => item.userId)));
  await Promise.all(emailUsers.map((user) => sendAccountEmail(user.email, systemAnnouncementEmailTemplate({ displayName: user.displayName, title: input.title, body: input.body, link: `${input.baseUrl}/tester`, category: "測試員 Beta 回饋" }), { kind: "tester_feedback", displayName: user.displayName, metadata: { postId: input.postId } })));
}

async function testerAnalytics(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const members = await testerMembers();
  const memberIds = new Set(members.map((member) => member.userId));
  const [reportTotal, postTotal, commentTotal, reports, posts, comments] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(issueReports).where(eq(issueReports.category, "tester")),
    db.select({ count: sql<number>`count(*)::int` }).from(testerFeedbackPosts),
    db.select({ count: sql<number>`count(*)::int` }).from(testerFeedbackComments),
    db.select({ userId: issueReports.userId, createdAt: issueReports.createdAt }).from(issueReports).where(and(eq(issueReports.category, "tester"), gte(issueReports.createdAt, since))),
    db.select({ userId: testerFeedbackPosts.authorId, createdAt: testerFeedbackPosts.createdAt }).from(testerFeedbackPosts).where(gte(testerFeedbackPosts.createdAt, since)),
    db.select({ userId: testerFeedbackComments.authorId, createdAt: testerFeedbackComments.createdAt }).from(testerFeedbackComments).where(gte(testerFeedbackComments.createdAt, since)),
  ]);
  const events = [
    ...reports.map((event) => ({ userId: event.userId, createdAt: event.createdAt, kind: "report" as const })),
    ...posts.map((event) => ({ userId: event.userId, createdAt: event.createdAt, kind: "post" as const })),
    ...comments.map((event) => ({ userId: event.userId, createdAt: event.createdAt, kind: "comment" as const })),
  ];
  const dailyMap = new Map<string, { reports: number; posts: number; comments: number; activeIds: Set<string> }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyMap.set(date, { reports: 0, posts: 0, comments: 0, activeIds: new Set() });
  }
  const userMap = new Map(members.map((member) => [member.userId, { userId: member.userId, displayName: member.displayName, novaId: member.novaId, reports: 0, posts: 0, comments: 0, lastActiveAt: null as Date | null }]));
  for (const event of events) {
    if (!event.userId || !memberIds.has(event.userId)) continue;
    const date = new Date(event.createdAt).toISOString().slice(0, 10);
    const daily = dailyMap.get(date);
    if (daily) { daily[`${event.kind}s` as "reports" | "posts" | "comments"] += 1; daily.activeIds.add(event.userId); }
    const user = userMap.get(event.userId);
    if (user) { user[event.kind === "report" ? "reports" : event.kind === "post" ? "posts" : "comments"] += 1; if (!user.lastActiveAt || new Date(event.createdAt) > user.lastActiveAt) user.lastActiveAt = new Date(event.createdAt); }
  }
  const daily = [...dailyMap.entries()].map(([date, value]) => ({ date, reports: value.reports, posts: value.posts, comments: value.comments, activeUsers: value.activeIds.size }));
  const active7 = new Set(events.filter((event) => event.userId && memberIds.has(event.userId) && new Date(event.createdAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).map((event) => event.userId)).size;
  const active30 = new Set(events.filter((event) => event.userId && memberIds.has(event.userId) && new Date(event.createdAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).map((event) => event.userId)).size;
  const topUsers = [...userMap.values()].map((user) => ({ ...user, total: user.reports + user.posts + user.comments })).filter((user) => user.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  return { days, range: { start: since, end: new Date() }, kpis: { members: members.length, totalReports: reportTotal[0]?.count ?? 0, totalPosts: postTotal[0]?.count ?? 0, totalComments: commentTotal[0]?.count ?? 0, active7, active30 }, daily, topUsers };
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/tester/overview",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await isTesterUser(user.userId))) throw forbidden("這個頁面只開放給測試員");
      const reports = await db.select({
        ticketNo: issueReports.ticketNo,
        title: issueReports.title,
        severity: issueReports.severity,
        status: issueReports.status,
        adminNote: issueReports.adminNote,
        createdAt: issueReports.createdAt,
      }).from(issueReports).where(and(eq(issueReports.userId, user.userId), eq(issueReports.category, "tester"))).orderBy(desc(issueReports.createdAt)).limit(30);
      return { tester: true, groupName: TESTER_GROUP_NAME, features: await testerFeatures(), reports };
    },
  }),
  route({
    method: "GET",
    path: "/admin/testers",
    auth: "admin",
    handler: async (ctx) => {
      return { members: await testerMembers(), features: await db.select({
        feature: featurePermissions.feature,
        label: featurePermissions.label,
        category: featurePermissions.category,
        enabled: featurePermissions.enabled,
        testerEnabled: featurePermissions.testerEnabled,
        testerDescription: featurePermissions.testerDescription,
      }).from(featurePermissions).orderBy(featurePermissions.category, featurePermissions.label) };
    },
  }),
  route({
    method: "GET",
    path: "/admin/testers/analytics",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const days = Math.min(90, Math.max(7, Number(ctx.query.get("days") ?? 30) || 30));
      return testerAnalytics(days);
    },
  }),
  route({
    method: "GET",
    path: "/admin/testers/export",
    auth: "admin",
    handler: async (ctx) => {
      const reports = await db.select({ ticketNo: issueReports.ticketNo, category: issueReports.category, title: issueReports.title, severity: issueReports.severity, status: issueReports.status, description: issueReports.description, authorName: users.displayName, authorNovaId: users.novaId, createdAt: issueReports.createdAt }).from(issueReports).leftJoin(users, eq(users.userId, issueReports.userId)).where(eq(issueReports.category, "tester")).orderBy(desc(issueReports.createdAt)).limit(10000);
      const posts = await db.select({ id: testerFeedbackPosts.id, category: testerFeedbackPosts.category, title: testerFeedbackPosts.title, body: testerFeedbackPosts.body, authorName: users.displayName, authorNovaId: users.novaId, createdAt: testerFeedbackPosts.createdAt }).from(testerFeedbackPosts).innerJoin(users, eq(users.userId, testerFeedbackPosts.authorId)).orderBy(desc(testerFeedbackPosts.createdAt)).limit(10000);
      const comments = await db.select({ id: testerFeedbackComments.id, postId: testerFeedbackComments.postId, body: testerFeedbackComments.body, authorName: users.displayName, authorNovaId: users.novaId, createdAt: testerFeedbackComments.createdAt }).from(testerFeedbackComments).innerJoin(users, eq(users.userId, testerFeedbackComments.authorId)).orderBy(desc(testerFeedbackComments.createdAt)).limit(20000);
      const headers = ["資料類型", "識別碼", "回報單號", "貼文 ID", "分類", "標題", "嚴重程度", "狀態", "作者", "作者 Nova ID", "內容", "建立時間"];
      const rows = [
        ...reports.map((row) => ({ "資料類型": "問題回報", "識別碼": row.ticketNo, "回報單號": row.ticketNo, "貼文 ID": "", "分類": row.category, "標題": row.title, "嚴重程度": row.severity, "狀態": row.status, "作者": row.authorName, "作者 Nova ID": row.authorNovaId, "內容": row.description, "建立時間": row.createdAt.toISOString() })),
        ...posts.map((row) => ({ "資料類型": "心得貼文", "識別碼": row.id, "回報單號": "", "貼文 ID": row.id, "分類": row.category, "標題": row.title, "嚴重程度": "", "狀態": "", "作者": row.authorName, "作者 Nova ID": row.authorNovaId, "內容": row.body, "建立時間": row.createdAt.toISOString() })),
        ...comments.map((row) => ({ "資料類型": "心得留言", "識別碼": row.id, "回報單號": "", "貼文 ID": row.postId, "分類": "留言", "標題": "", "嚴重程度": "", "狀態": "", "作者": row.authorName, "作者 Nova ID": row.authorNovaId, "內容": row.body, "建立時間": row.createdAt.toISOString() })),
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(toCsv(rows, headers), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="studynova-tester-feedback-${stamp}.csv"` } });
    },
  }),
  route({
    method: "GET",
    path: "/tester/feedback",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      return { posts: await feedbackBoard() };
    },
  }),
  route({
    method: "GET",
    path: "/tester/feedback/preferences",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      const preference = (await db.select({ emailEnabled: testerFeedbackNotificationPreferences.emailEnabled }).from(testerFeedbackNotificationPreferences).where(eq(testerFeedbackNotificationPreferences.userId, user.userId)).limit(1))[0];
      return { emailEnabled: preference?.emailEnabled ?? false };
    },
  }),
  route({
    method: "PATCH",
    path: "/tester/feedback/preferences",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      const body = await ctx.json(z.object({ emailEnabled: z.boolean() }));
      const rows = await db.insert(testerFeedbackNotificationPreferences).values({ userId: user.userId, emailEnabled: body.emailEnabled }).onConflictDoUpdate({ target: testerFeedbackNotificationPreferences.userId, set: { emailEnabled: body.emailEnabled, updatedAt: new Date() } }).returning({ emailEnabled: testerFeedbackNotificationPreferences.emailEnabled });
      return { emailEnabled: rows[0].emailEnabled };
    },
  }),
  route({
    method: "POST",
    path: "/tester/feedback",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      const body = await ctx.json(z.object({ title: z.string().trim().min(4).max(120), body: z.string().trim().min(10).max(5000), category: z.enum(["心得", "Bug 討論", "功能建議", "測試問題"]).default("心得") }));
      const rows = await db.insert(testerFeedbackPosts).values({ authorId: user.userId, title: body.title, body: body.body, category: body.category }).returning({ id: testerFeedbackPosts.id });
      const audience = await feedbackAudience(user.userId);
      await sendFeedbackAlerts({ recipientIds: audience.map((recipient) => recipient.userId), excludeUserId: user.userId, title: `新的測試心得：${body.title}`, body: `${user.displayName} 發布了新的${body.category}，快來測試回饋看板看看。`, postId: rows[0].id, baseUrl: new URL(ctx.req.url).origin });
      return { id: rows[0].id };
    },
  }),
  route({
    method: "POST",
    path: "/tester/feedback/:postId/comments",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      const body = await ctx.json(z.object({ body: z.string().trim().min(1).max(2000) }));
      const post = (await db.select({ id: testerFeedbackPosts.id }).from(testerFeedbackPosts).where(eq(testerFeedbackPosts.id, ctx.params.postId)).limit(1))[0];
      if (!post) throw notFound("找不到這篇測試心得");
      await db.insert(testerFeedbackComments).values({ postId: post.id, authorId: user.userId, body: body.body });
      await db.update(testerFeedbackPosts).set({ updatedAt: new Date() }).where(eq(testerFeedbackPosts.id, post.id));
      const audience = await feedbackAudience(user.userId);
      await sendFeedbackAlerts({ recipientIds: audience.map((recipient) => recipient.userId), excludeUserId: user.userId, title: "測試心得有新留言", body: `${user.displayName} 在測試心得看板留下了新留言：${body.body.slice(0, 180)}`, postId: post.id, baseUrl: new URL(ctx.req.url).origin });
      return { posted: true };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/testers/features/:feature",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ testerEnabled: z.boolean(), testerDescription: z.string().max(240).default("") }));
      const rows = await db.update(featurePermissions).set({ testerEnabled: body.testerEnabled, testerDescription: body.testerDescription, updatedAt: new Date() }).where(eq(featurePermissions.feature, ctx.params.feature)).returning();
      if (!rows[0]) throw notFound("找不到這個功能權限");
      return { feature: rows[0] };
    },
  }),
  route({
    method: "PUT",
    path: "/admin/testers/members",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ userIds: z.array(z.string().uuid()).max(500) }));
      const existingUsers = body.userIds.length ? await db.select({ userId: users.userId }).from(users).where(and(inArray(users.userId, body.userIds), eq(users.status, "active"), inArray(users.role, ["student", "tester"]))) : [];
      const ids = existingUsers.map((row) => row.userId);
      await db.transaction(async (tx) => {
        if (ids.length) await tx.update(users).set({ role: "tester", updatedAt: new Date() }).where(inArray(users.userId, ids));
        if (body.userIds.length) await tx.update(users).set({ role: "student", updatedAt: new Date() }).where(and(eq(users.role, "tester"), notInArray(users.userId, body.userIds)));
        else await tx.update(users).set({ role: "student", updatedAt: new Date() }).where(eq(users.role, "tester"));
      });
      return { memberCount: ids.length };
    },
  }),
];
