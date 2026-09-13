import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  aiContentReports,
  aiProactiveAlerts,
  dailyWords,
  examModePolicies,
  examModeSelections,
  exams,
  examSubjects,
  gradeRecords,
  learningEvents,
  notes,
  questionVersions,
  questions,
  reviewItems,
  studyMaterials,
  studyRecords,
  userSettings,
  userVocabularies,
  wordProgress,
  wrongQuestions,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, notFound, todayStr } from "../core";

const REPORT_REASONS = ["answer_wrong", "explanation_unclear", "grammar_error", "material_mismatch", "question_problem", "other"] as const;
const TIMELINE_TYPES = ["all", "vocabulary", "quiz", "wrong", "material", "focus", "ai", "exam"] as const;

function timelineType(kind: string, detail: Record<string, unknown>) {
  if (kind === "focus") return "focus";
  if (kind.includes("word") || kind === "vocabulary") return "vocabulary";
  if (kind.includes("wrong")) return "wrong";
  if (kind.includes("quiz") || kind.includes("answer")) return "quiz";
  if (kind.includes("material") || kind === "read") return "material";
  if (kind.includes("ai")) return "ai";
  if (kind.includes("exam")) return "exam";
  if (detail.examId || detail.examName) return "exam";
  return "all";
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/learning/timeline",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const filter = (ctx.query.get("type") ?? "all") as (typeof TIMELINE_TYPES)[number];
      if (!TIMELINE_TYPES.includes(filter)) throw badRequest("無效的時間軸篩選");
      const limit = Math.min(100, Math.max(1, Number(ctx.query.get("limit") ?? 50)));
      const records = await db.select().from(studyRecords).where(eq(studyRecords.userId, user.userId)).orderBy(desc(studyRecords.createdAt)).limit(limit * 2);
      const events = await db.select().from(learningEvents).where(eq(learningEvents.userId, user.userId)).orderBy(desc(learningEvents.occurredAt)).limit(limit * 2);
      const items = [
        ...records.map((r) => ({ id: r.id, type: timelineType(r.kind, r.detail), kind: r.kind, subject: r.subject, title: String(r.detail.title ?? r.kind), detail: r.detail, minutes: r.minutes, occurredAt: r.createdAt.toISOString(), source: "study_record" })),
        ...events.map((e) => ({ id: e.id, type: timelineType(e.eventType, e.metadata), kind: e.eventType, subject: String(e.metadata.subject ?? "其他"), title: String(e.metadata.title ?? `${e.eventType} 學習紀錄`), detail: e.metadata, minutes: Math.round(e.durationSec / 60), occurredAt: e.occurredAt.toISOString(), source: "learning_event" })),
      ].filter((item) => filter === "all" || item.type === filter).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
      return { items, filter, ownUserId: user.userId };
    },
  }),
  route({
    method: "GET",
    path: "/learning/radar",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const [events, words, wrongs, grades] = await Promise.all([
        db.select().from(learningEvents).where(eq(learningEvents.userId, user.userId)).orderBy(desc(learningEvents.occurredAt)).limit(500),
        db.select().from(wordProgress).where(eq(wordProgress.userId, user.userId)),
        db.select().from(wrongQuestions).where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt))),
        db.select().from(gradeRecords).where(eq(gradeRecords.userId, user.userId)).orderBy(desc(gradeRecords.examDate)).limit(100),
      ]);
      const correct = events.filter((e) => e.correct === true).length;
      const answered = events.filter((e) => e.correct !== null).length;
      const accuracy = answered ? (correct / answered) * 100 : 0;
      const wordMastery = words.length ? words.reduce((sum, w) => sum + w.familiarity, 0) / words.length : 0;
      const wrongImprovement = wrongs.length ? wrongs.reduce((sum, w) => sum + w.mastery, 0) / wrongs.length : 0;
      const score = grades.length ? grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length : accuracy;
      const metrics = [
        { key: "vocabulary", label: "單字", value: Math.round(wordMastery), evidence: `${words.length} 筆單字進度` },
        { key: "reading", label: "閱讀", value: Math.round(Math.min(100, accuracy * 0.9)), evidence: `${answered} 筆有答案的學習事件` },
        { key: "problem_solving", label: "解題", value: Math.round(Math.min(100, accuracy)), evidence: `${correct}/${answered} 筆答題事件正確` },
        { key: "memory", label: "記憶", value: Math.round(Math.min(100, wordMastery * 0.8 + wrongImprovement * 0.2)), evidence: `${words.reduce((sum, w) => sum + w.correctCount, 0)} 次單字答對` },
        { key: "stability", label: "考試穩定度", value: Math.round(Math.min(100, score)), evidence: `${grades.length} 筆成績紀錄` },
        { key: "wrong_improvement", label: "錯題改善", value: Math.round(Math.min(100, wrongImprovement)), evidence: `${wrongs.length} 筆未解決錯題` },
      ];
      const weakest = [...metrics].sort((a, b) => a.value - b.value)[0] ?? null;
      return { metrics, weakest, dataSource: { learningEvents: events.length, words: words.length, wrongQuestions: wrongs.length, grades: grades.length } };
    },
  }),
  route({
    method: "GET",
    path: "/learning/error-patterns",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const since = new Date(Date.now() - 14 * 86_400_000);
      const rows = await db.select({ id: wrongQuestions.id, subject: wrongQuestions.subject, wrongCount: wrongQuestions.wrongCount, reason: wrongQuestions.reason, aiTip: wrongQuestions.aiTip, lastWrongAt: wrongQuestions.lastWrongAt, stem: questions.stem }).from(wrongQuestions).innerJoin(questions, eq(questions.id, wrongQuestions.questionId)).where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt), gte(wrongQuestions.lastWrongAt, since))).orderBy(desc(wrongQuestions.wrongCount), desc(wrongQuestions.lastWrongAt)).limit(100);
      const groups = new Map<string, { subject: string; reason: string; count: number; evidenceIds: string[]; questionCount: number }>();
      for (const row of rows) {
        const reason = row.reason.trim() || "尚未分析錯誤原因";
        const key = `${row.subject}:${reason}`;
        const current = groups.get(key) ?? { subject: row.subject, reason, count: 0, evidenceIds: [], questionCount: 0 };
        current.count += row.wrongCount;
        current.questionCount += 1;
        current.evidenceIds.push(row.id);
        groups.set(key, current);
      }
      const patterns = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 3).map((p) => ({ ...p, evidence: `最近 14 天 ${p.questionCount} 題、共 ${p.count} 次錯誤與「${p.reason}」相關。` }));
      return { patterns, enoughData: rows.length >= 3, windowDays: 14 };
    },
  }),
  route({
    method: "GET",
    path: "/exam-modes",
    auth: "user",
    handler: async () => ({ policies: await db.select().from(examModePolicies).where(eq(examModePolicies.enabled, true)).orderBy(asc(examModePolicies.label)) }),
  }),
  route({
    method: "POST",
    path: "/exam-modes/select",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ mode: z.string().min(1).max(40), examId: z.string().uuid().nullable().optional(), subject: z.string().max(40).default(""), scope: z.string().max(500).default(""), settings: z.record(z.string(), z.unknown()).default({}) }));
      const policy = (await db.select().from(examModePolicies).where(and(eq(examModePolicies.mode, body.mode), eq(examModePolicies.enabled, true))).limit(1))[0];
      if (!policy) throw notFound("找不到可用的考試模式");
      const row = await db.insert(examModeSelections).values({ userId: user.userId, examId: body.examId ?? null, mode: body.mode, subject: body.subject, scope: body.scope, settings: body.settings }).returning();
      return { selection: row[0], policy };
    },
  }),
  route({
    method: "GET",
    path: "/ai/alerts",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(aiProactiveAlerts).where(and(eq(aiProactiveAlerts.userId, user.userId), isNull(aiProactiveAlerts.dismissedAt))).orderBy(desc(aiProactiveAlerts.createdAt)).limit(20);
      return { alerts: rows, enabled: (await db.select({ enabled: userSettings.proactiveAiReminders }).from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0]?.enabled !== false };
    },
  }),
  route({
    method: "PATCH",
    path: "/ai/alerts/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ read: z.boolean().optional(), dismissed: z.boolean().optional() }));
      const updated = await db.update(aiProactiveAlerts).set({ readAt: body.read ? new Date() : undefined, dismissedAt: body.dismissed ? new Date() : undefined }).where(and(eq(aiProactiveAlerts.id, ctx.params.id), eq(aiProactiveAlerts.userId, user.userId))).returning();
      if (!updated[0]) throw notFound("找不到提醒");
      return { alert: updated[0] };
    },
  }),
  route({
    method: "POST",
    path: "/ai/content-reports",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ feature: z.string().min(1).max(80), contentType: z.string().min(1).max(60), contentId: z.string().uuid().nullable().optional(), reason: z.enum(REPORT_REASONS), details: z.string().max(2000).default(""), snapshot: z.record(z.string(), z.unknown()).default({}) }));
      const row = await db.insert(aiContentReports).values({ userId: user.userId, ...body, contentId: body.contentId ?? null }).returning();
      return { report: row[0] };
    },
  }),
];
