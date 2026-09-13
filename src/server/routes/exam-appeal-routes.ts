import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { examDateAppeals, examDatePolicies, exams, userSettings } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { adminLog } from "../economy";
import { fail, forbidden, notFound } from "../core";

const appealBody = z.object({ examId: z.string().uuid().nullable().optional(), examName: z.string().min(1).max(120), subject: z.string().max(30).default(""), currentExamDate: z.string().max(30).default(""), requestedExamDate: z.string().min(8).max(30), requestedDaysRemaining: z.number().int().min(0).max(1000).nullable().optional(), reason: z.string().min(5).max(1000) });

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/exam-date-policies", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
    if (!settings) return { policies: [] };
    const policies = await db.select().from(examDatePolicies).where(eq(examDatePolicies.enabled, true));
    return { policies: policies.filter((policy) => policy.educationLevel === settings.schoolLevel && policy.grade === settings.grade && (!policy.schoolName || policy.schoolName === settings.schoolName)) };
  }}),
  route({ method: "GET", path: "/exam-date-appeals", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    return { appeals: await db.select().from(examDateAppeals).where(eq(examDateAppeals.userId, user.userId)).orderBy(desc(examDateAppeals.createdAt)).limit(50) };
  }}),
  route({ method: "POST", path: "/exam-date-appeals", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(appealBody);
    if (body.examId) {
      const exam = (await db.select().from(exams).where(and(eq(exams.id, body.examId), eq(exams.userId, user.userId))).limit(1))[0];
      if (!exam) throw notFound("找不到你的段考資料");
    }
    const row = (await db.insert(examDateAppeals).values({ ...body, userId: user.userId, examId: body.examId ?? null, requestedDaysRemaining: body.requestedDaysRemaining ?? null }).returning())[0];
    return { appeal: row };
  }}),
  route({ method: "GET", path: "/admin/exam-date-appeals", auth: "admin", handler: async () => {
    return { appeals: await db.select().from(examDateAppeals).orderBy(desc(examDateAppeals.createdAt)).limit(200) };
  }}),
  route({ method: "GET", path: "/admin/exam-date-policies", auth: "admin", handler: async () => ({ policies: await db.select().from(examDatePolicies).orderBy(desc(examDatePolicies.schoolName), desc(examDatePolicies.educationLevel), examDatePolicies.grade) }) }),
  route({ method: "POST", path: "/admin/exam-date-policies", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ schoolName: z.string().max(120).default(""), educationLevel: z.enum(["junior", "senior"]), grade: z.number().int().min(1).max(3), term: z.string().min(1).max(40), examName: z.string().min(1).max(120), examDate: z.string().min(8).max(30), enabled: z.boolean().default(true) }));
    const row = (await db.insert(examDatePolicies).values({ ...body, updatedBy: admin.userId }).onConflictDoUpdate({ target: [examDatePolicies.schoolName, examDatePolicies.educationLevel, examDatePolicies.grade, examDatePolicies.term], set: { examName: body.examName, examDate: body.examDate, enabled: body.enabled, updatedBy: admin.userId, updatedAt: new Date() } }).returning())[0];
    await adminLog({ actorId: admin.userId, action: "exam-date-policy.upsert", targetType: "exam_date_policy", targetId: row.id, after: row, reason: `${body.schoolName || "全部學校"} ${body.educationLevel} ${body.grade}年級 ${body.term}`, ip: ctx.ip });
    return { policy: row };
  }}),
  route({ method: "PATCH", path: "/admin/exam-date-appeals/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ status: z.enum(["approved", "rejected"]), adminNote: z.string().max(1000).default("") }));
    const appeal = (await db.select().from(examDateAppeals).where(eq(examDateAppeals.id, ctx.params.id)).limit(1))[0];
    if (!appeal) throw notFound("找不到異議申請");
    if (appeal.status !== "pending") throw fail("SYS_CONFLICT", { message: "這筆申請已處理" });
    if (body.status === "approved" && appeal.examId) await db.update(exams).set({ examDate: appeal.requestedExamDate }).where(eq(exams.id, appeal.examId));
    const updated = (await db.update(examDateAppeals).set({ status: body.status, adminNote: body.adminNote, handledBy: admin.userId, handledAt: new Date(), updatedAt: new Date() }).where(eq(examDateAppeals.id, appeal.id)).returning())[0];
    await adminLog({ actorId: admin.userId, action: `exam-date-appeal.${body.status}`, targetType: "exam_date_appeal", targetId: appeal.id, before: appeal, after: updated, reason: body.adminNote, ip: ctx.ip });
    return { appeal: updated };
  }}),
];
