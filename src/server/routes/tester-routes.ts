import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { featurePermissions, identityGroupMembers, identityGroups, issueReports, testerFeedbackComments, testerFeedbackPosts, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { forbidden, notFound } from "../core";
import { ensureTesterGroup, isTesterUser, testerFeatures, testerMembers, TESTER_GROUP_NAME } from "../tester";

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
      const admin = ctx.requireUser();
      const group = await ensureTesterGroup(admin.userId);
      if (!group) throw notFound("無法建立測試員身分組");
      return { group, members: await testerMembers(group.id), features: await db.select({
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
    path: "/tester/feedback",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await canUseTesterFeedback(user))) throw forbidden("測試心得看板只開放給測試員與管理員");
      return { posts: await feedbackBoard() };
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
      const group = await ensureTesterGroup(admin.userId);
      if (!group) throw notFound("找不到測試員身分組");
      await db.delete(identityGroupMembers).where(eq(identityGroupMembers.identityGroupId, group.id));
      if (body.userIds.length) {
        const existingUsers = await db.select({ userId: users.userId }).from(users).where(inArray(users.userId, body.userIds));
        const ids = existingUsers.map((row) => row.userId);
        if (ids.length) await db.insert(identityGroupMembers).values(ids.map((userId) => ({ identityGroupId: group.id, userId, addedBy: admin.userId })));
        return { memberCount: ids.length };
      }
      return { memberCount: 0 };
    },
  }),
];
