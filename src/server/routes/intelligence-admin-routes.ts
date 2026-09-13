import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminFeatureCustomizations, aiContentReports, examModePolicies, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { adminLog } from "../economy";
import { notFound } from "../core";

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/admin/ai/content-reports",
    auth: "admin",
    handler: async (ctx) => {
      const status = ctx.query.get("status");
      const reports = await db.select({ report: aiContentReports, userName: users.displayName, userEmail: users.email })
        .from(aiContentReports).innerJoin(users, eq(users.userId, aiContentReports.userId))
        .where(status ? eq(aiContentReports.status, status) : undefined)
        .orderBy(desc(aiContentReports.createdAt)).limit(200);
      return { reports };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/ai/content-reports/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ status: z.enum(["pending", "confirmed", "fixed", "ignored"]), adminNote: z.string().max(2000).default("") }));
      const before = (await db.select().from(aiContentReports).where(eq(aiContentReports.id, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到 AI 回報");
      const rows = await db.update(aiContentReports).set({ status: body.status, adminNote: body.adminNote, resolvedBy: admin.userId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(aiContentReports.id, before.id)).returning();
      await adminLog({ actorId: admin.userId, action: `ai-content-report.${body.status}`, targetType: "ai_content_report", targetId: before.id, before, after: rows[0], ip: ctx.ip });
      return { report: rows[0] };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-mode-policies",
    auth: "admin",
    handler: async () => ({ policies: await db.select().from(examModePolicies).orderBy(asc(examModePolicies.label)) }),
  }),
  route({
    method: "PATCH",
    path: "/admin/exam-mode-policies/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ label: z.string().min(1).max(80).optional(), description: z.string().max(500).optional(), rules: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional() }));
      const before = (await db.select().from(examModePolicies).where(eq(examModePolicies.id, ctx.params.id)).limit(1))[0];
      if (!before) throw notFound("找不到考試模式");
      const rows = await db.update(examModePolicies).set({ ...body, updatedBy: admin.userId, updatedAt: new Date() }).where(eq(examModePolicies.id, before.id)).returning();
      await adminLog({ actorId: admin.userId, action: "exam-mode-policy.update", targetType: "exam_mode_policy", targetId: before.id, before, after: rows[0], ip: ctx.ip });
      return { policy: rows[0] };
    },
  }),
  route({
    method: "GET",
    path: "/admin/feature-customizations",
    auth: "admin",
    handler: async () => ({ features: await db.select().from(adminFeatureCustomizations).orderBy(asc(adminFeatureCustomizations.feature)) }),
  }),
  route({
    method: "PUT",
    path: "/admin/feature-customizations/:feature",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ label: z.string().max(120).default(""), enabled: z.boolean().default(true), allowedRoles: z.array(z.enum(["student", "admin", "owner"])).min(1).default(["student"]), config: z.record(z.string(), z.unknown()).default({}) }));
      const rows = await db.insert(adminFeatureCustomizations).values({ feature: ctx.params.feature, ...body, updatedBy: admin.userId, updatedAt: new Date() }).onConflictDoUpdate({ target: adminFeatureCustomizations.feature, set: { ...body, updatedBy: admin.userId, updatedAt: new Date() } }).returning();
      await adminLog({ actorId: admin.userId, action: "feature-customization.update", targetType: "feature", targetId: ctx.params.feature, after: rows[0], ip: ctx.ip });
      return { feature: rows[0] };
    },
  }),
];
