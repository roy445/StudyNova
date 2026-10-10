import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { examPrepActivities, examPrepSubjects, userSettings } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";

const statusValues = ["draft", "analyzing", "pending_review", "scheduled", "open", "closed", "archived"] as const;
type ActivityStatus = (typeof statusValues)[number];

const subjectInput = z.object({
  subject: z.string().trim().min(1).max(60),
  chapters: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  units: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  questionTypes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  difficulty: z.string().trim().min(1).max(30).default("normal"),
  questionBankId: z.string().uuid().nullable().optional(),
});

const activityInput = z.object({
  slug: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  educationLevel: z.enum(["junior", "senior"]),
  grade: z.number().int().min(1).max(12),
  semester: z.string().max(40).default(""),
  examName: z.string().trim().min(1).max(120),
  scope: z.string().max(2000).default(""),
  openMode: z.enum(["manual", "scheduled"]).default("manual"),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  questionBankId: z.string().uuid().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  subjects: z.array(subjectInput).max(30).default([]),
});

const patchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  semester: z.string().max(40).optional(),
  examName: z.string().trim().min(1).max(120).optional(),
  scope: z.string().max(2000).optional(),
  openMode: z.enum(["manual", "scheduled"]).optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  questionBankId: z.string().uuid().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(statusValues).optional(),
});

function slugify(value: string) {
  const base = value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "exam-prep";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function dateOrNull(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function effectiveStatus(activity: typeof examPrepActivities.$inferSelect, now = new Date()): ActivityStatus {
  if (activity.status === "archived") return "archived";
  if (activity.closeAt && activity.closeAt <= now) return "closed";
  if (activity.status === "scheduled" && activity.openAt && activity.openAt > now) return "scheduled";
  if ((activity.status === "scheduled" || activity.status === "open") && (!activity.openAt || activity.openAt <= now)) return "open";
  return activity.status as ActivityStatus;
}

function canTransition(from: ActivityStatus, to: ActivityStatus) {
  if (from === to) return true;
  return ({
    draft: ["analyzing", "pending_review", "scheduled", "open", "closed"],
    analyzing: ["pending_review", "draft", "closed"],
    pending_review: ["draft", "scheduled", "open", "closed"],
    scheduled: ["open", "closed", "draft"],
    open: ["closed"],
    closed: ["archived", "open"],
    archived: [],
  } as Record<ActivityStatus, ActivityStatus[]>)[from].includes(to);
}

async function activityWithSubjects(id: string) {
  const activity = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, id)).limit(1))[0];
  if (!activity) throw notFound("找不到段考衝刺活動");
  const subjects = await db.select().from(examPrepSubjects).where(eq(examPrepSubjects.activityId, id)).orderBy(asc(examPrepSubjects.subject));
  return { activity: { ...activity, effectiveStatus: effectiveStatus(activity) }, subjects };
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/exam-prep/available",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const settings = (await db.select({ schoolLevel: userSettings.schoolLevel, grade: userSettings.grade }).from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      const rows = await db.select().from(examPrepActivities).where(and(or(eq(examPrepActivities.status, "scheduled"), eq(examPrepActivities.status, "open"), eq(examPrepActivities.status, "closed")), settings?.schoolLevel ? eq(examPrepActivities.educationLevel, settings.schoolLevel) : undefined, settings?.grade ? eq(examPrepActivities.grade, settings.grade) : undefined)).orderBy(desc(examPrepActivities.openAt), desc(examPrepActivities.createdAt));
      const now = new Date();
      const subjects = rows.length ? await db.select().from(examPrepSubjects).where(or(...rows.map((row) => eq(examPrepSubjects.activityId, row.id)))).orderBy(asc(examPrepSubjects.subject)) : [];
      const subjectMap = new Map<string, typeof subjects>();
      for (const subject of subjects) subjectMap.set(subject.activityId, [...(subjectMap.get(subject.activityId) ?? []), subject]);
      return { timezone: "Asia/Taipei", profile: settings ?? null, activities: rows.map((activity) => ({ ...activity, effectiveStatus: effectiveStatus(activity, now), subjects: subjectMap.get(activity.id) ?? [] })) };
    },
  }),
  route({
    method: "GET",
    path: "/exam-prep/:id",
    auth: "user",
    handler: async (ctx) => {
      const result = await activityWithSubjects(ctx.params.id);
      const status = result.activity.effectiveStatus;
      return { ...result, access: { canEnter: status === "open", reason: status === "scheduled" ? "活動尚未開放" : status === "closed" ? "活動已關閉，目前只能查看複習資源" : status === "archived" ? "活動已封存" : status === "open" ? "" : "活動尚未準備完成" } };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/activities",
    auth: "admin",
    handler: async () => {
      const activities = await db.select().from(examPrepActivities).orderBy(desc(examPrepActivities.createdAt));
      const subjects = activities.length ? await db.select().from(examPrepSubjects).where(or(...activities.map((row) => eq(examPrepSubjects.activityId, row.id)))) : [];
      return { timezone: "Asia/Taipei", activities: activities.map((activity) => ({ ...activity, effectiveStatus: effectiveStatus(activity), subjects: subjects.filter((subject) => subject.activityId === activity.id) })) };
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/activities",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json<z.infer<typeof activityInput>>(activityInput);
      const openAt = dateOrNull(body.openAt);
      const closeAt = dateOrNull(body.closeAt);
      if (openAt && closeAt && closeAt <= openAt) throw fail("SYS_CONFLICT", { message: "關閉時間必須晚於開放時間" });
      if (body.openMode === "scheduled" && !openAt) throw fail("SYS_CONFLICT", { message: "預約開放必須設定開放時間" });
      const created = await db.transaction(async (tx) => {
        const activity = (await tx.insert(examPrepActivities).values({ slug: body.slug ? slugify(body.slug) : slugify(body.name), name: body.name, description: body.description, educationLevel: body.educationLevel, grade: body.grade, semester: body.semester, examName: body.examName, scope: body.scope, openMode: body.openMode, status: body.openMode === "scheduled" ? "scheduled" : "draft", openAt, closeAt, questionBankId: body.questionBankId ?? null, settings: body.settings, createdBy: admin.userId }).returning())[0];
        if (body.subjects.length) await tx.insert(examPrepSubjects).values(body.subjects.map((subject) => ({ ...subject, activityId: activity.id, questionBankId: subject.questionBankId ?? null })));
        return activity;
      });
      return await activityWithSubjects(created.id);
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/activities/:id",
    auth: "admin",
    handler: async (ctx) => activityWithSubjects(ctx.params.id),
  }),
  route({
    method: "PATCH",
    path: "/admin/exam-prep/activities/:id",
    auth: "admin",
    handler: async (ctx) => {
      const current = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到段考衝刺活動");
      const body = await ctx.json<z.infer<typeof patchInput>>(patchInput);
      const from = current.status as ActivityStatus;
      const to = body.status ?? from;
      if (!canTransition(from, to)) throw fail("SYS_CONFLICT", { message: `活動狀態不可由 ${from} 變更為 ${to}` });
      const openAt = body.openAt === undefined ? current.openAt : dateOrNull(body.openAt);
      const closeAt = body.closeAt === undefined ? current.closeAt : dateOrNull(body.closeAt);
      if (openAt && closeAt && closeAt <= openAt) throw fail("SYS_CONFLICT", { message: "關閉時間必須晚於開放時間" });
      if ((body.openMode ?? current.openMode) === "scheduled" && !openAt) throw fail("SYS_CONFLICT", { message: "預約開放必須設定開放時間" });
      const update = { ...body, openAt, closeAt, status: to, publishedAt: ["scheduled", "open"].includes(to) ? current.publishedAt ?? new Date() : current.publishedAt, archivedAt: to === "archived" ? new Date() : current.archivedAt, questionBankId: body.questionBankId === undefined ? current.questionBankId : body.questionBankId };
      await db.update(examPrepActivities).set(update).where(eq(examPrepActivities.id, current.id));
      return await activityWithSubjects(current.id);
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/activities/:id/subjects",
    auth: "admin",
    handler: async (ctx) => {
      const activity = (await db.select({ id: examPrepActivities.id }).from(examPrepActivities).where(eq(examPrepActivities.id, ctx.params.id)).limit(1))[0];
      if (!activity) throw notFound("找不到段考衝刺活動");
      const body = await ctx.json<z.infer<typeof subjectInput>>(subjectInput);
      const subject = (await db.insert(examPrepSubjects).values({ ...body, activityId: activity.id, questionBankId: body.questionBankId ?? null }).onConflictDoUpdate({ target: [examPrepSubjects.activityId, examPrepSubjects.subject], set: { chapters: body.chapters, units: body.units, questionTypes: body.questionTypes, difficulty: body.difficulty, questionBankId: body.questionBankId ?? null, updatedAt: new Date() } }).returning())[0];
      return { subject };
    },
  }),
];
