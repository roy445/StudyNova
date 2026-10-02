import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chemistryConcepts, chemistryDiagnosticAttempts, chemistryFormulas, chemistryLessonProgress, chemistryLessons, chemistryLessonSteps, chemistryMastery, chemistryPrerequisites, chemistryQuestionLinks, chemistryTopics, questions, wrongQuestions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, notFound } from "../core";
import { grantLearningReward } from "../economy";
import { recordStudy } from "./learning-routes";
import { runAi } from "../ai";

const subject = "CHEMISTRY";
const cleanAnswer = (value: unknown) => String(value ?? "").trim().toLowerCase();
const sameAnswers = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => cleanAnswer(value) === cleanAnswer(b[index]));
const masteryLabel = (score: number) => score >= 90 ? "已掌握" : score >= 70 ? "熟悉" : score >= 40 ? "學習中" : score > 0 ? "需要補強" : "尚未學習";

async function conceptRows(userId: string) {
  const [concepts, mastery, prerequisites] = await Promise.all([
    db.select({ concept: chemistryConcepts, topicTitle: chemistryTopics.title, topicSlug: chemistryTopics.slug }).from(chemistryConcepts).innerJoin(chemistryTopics, eq(chemistryTopics.id, chemistryConcepts.topicId)).where(and(eq(chemistryConcepts.subject, subject), eq(chemistryConcepts.status, "published"))).orderBy(asc(chemistryTopics.sortOrder), asc(chemistryConcepts.sortOrder)),
    db.select().from(chemistryMastery).where(eq(chemistryMastery.userId, userId)),
    db.select().from(chemistryPrerequisites),
  ]);
  const masteryMap = new Map(mastery.map((row) => [row.conceptId, row]));
  return concepts.map(({ concept, topicTitle, topicSlug }) => {
    const row = masteryMap.get(concept.id);
    const score = row?.score ?? 0;
    const prereqs = prerequisites.filter((item) => item.conceptId === concept.id).map((item) => item.prerequisiteConceptId);
    const unlocked = prereqs.every((id) => (masteryMap.get(id)?.score ?? 0) >= 70);
    return { ...concept, topicTitle, topicSlug, score: Math.round(score), confidence: Math.round(row?.confidence ?? 0), label: masteryLabel(score), attempts: row?.attempts ?? 0, unlocked: prereqs.length === 0 || unlocked, prerequisiteIds: prereqs };
  });
}

function publicQuestion(row: typeof questions.$inferSelect) {
  return { id: row.id, type: row.type, stem: row.stem, options: row.options, difficulty: row.difficulty, estimatedSeconds: row.estimatedSeconds, topic: row.topic, tags: row.tags };
}

async function updateMastery(userId: string, conceptId: string, correct: boolean, hintUsed = false) {
  const existing = (await db.select().from(chemistryMastery).where(and(eq(chemistryMastery.userId, userId), eq(chemistryMastery.conceptId, conceptId))).limit(1))[0];
  const attempts = (existing?.attempts ?? 0) + 1;
  const correctCount = (existing?.correctCount ?? 0) + (correct ? 1 : 0);
  const consecutiveCorrect = correct ? (existing?.consecutiveCorrect ?? 0) + 1 : 0;
  const oldScore = existing?.score ?? 0;
  const recencyAdjusted = oldScore * 0.55;
  const score = Math.max(0, Math.min(100, Math.round(recencyAdjusted + (correct ? 42 : 0) + (correct ? 4 * Math.min(consecutiveCorrect, 3) : -12) - (hintUsed ? 5 : 0))));
  const values = { score, confidence: Math.min(100, Math.round((correctCount / attempts) * 100)), attempts, correctCount, hintCount: (existing?.hintCount ?? 0) + (hintUsed ? 1 : 0), consecutiveCorrect, lastPracticedAt: new Date(), updatedAt: new Date() };
  await db.insert(chemistryMastery).values({ userId, conceptId, ...values }).onConflictDoUpdate({ target: [chemistryMastery.userId, chemistryMastery.conceptId], set: values });
  return values;
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/chemistry/overview", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const concepts = await conceptRows(user.userId);
    const [topics, formulas, progress] = await Promise.all([
      db.select().from(chemistryTopics).where(and(eq(chemistryTopics.subject, subject), eq(chemistryTopics.status, "published"))).orderBy(asc(chemistryTopics.sortOrder)),
      db.select({ formula: chemistryFormulas, conceptTitle: chemistryConcepts.title }).from(chemistryFormulas).innerJoin(chemistryConcepts, eq(chemistryConcepts.id, chemistryFormulas.conceptId)).where(eq(chemistryFormulas.status, "published")).orderBy(asc(chemistryConcepts.sortOrder)).limit(12),
      db.select({ completed: chemistryLessonProgress.completed }).from(chemistryLessonProgress).where(and(eq(chemistryLessonProgress.userId, user.userId), eq(chemistryLessonProgress.completed, true))),
    ]);
    const total = concepts.length;
    const overall = total ? Math.round(concepts.reduce((sum, item) => sum + item.score, 0) / total) : 0;
    const next = concepts.find((item) => item.unlocked && item.score < 70) ?? concepts[concepts.length - 1] ?? null;
    return { subject, title: "高中化學", subtitle: "從基礎開始，一步一步學會化學。", topics, concepts, overall, hasData: concepts.some((item) => item.attempts > 0 || item.score > 0), next, completedLessons: progress.length, formulas };
  }}),
  route({ method: "GET", path: "/chemistry/diagnostic", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const existing = (await db.select().from(chemistryDiagnosticAttempts).where(and(eq(chemistryDiagnosticAttempts.userId, user.userId), eq(chemistryDiagnosticAttempts.status, "completed"))).orderBy(desc(chemistryDiagnosticAttempts.completedAt)).limit(1))[0];
    return { completed: Boolean(existing), result: existing?.result ?? null };
  }}),
  route({ method: "POST", path: "/chemistry/diagnostic/start", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const rows = await db.select({ question: questions }).from(chemistryQuestionLinks).innerJoin(questions, eq(questions.id, chemistryQuestionLinks.questionId)).where(and(eq(chemistryQuestionLinks.questionStage, "diagnostic"), eq(questions.status, "published"))).orderBy(asc(questions.createdAt)).limit(15);
    if (rows.length < 5) throw badRequest("化學診斷題庫尚未準備完成，請先由管理員發布至少 5 題正式題目。");
    const questionIds = rows.map((row) => row.question.id);
    const attempt = (await db.insert(chemistryDiagnosticAttempts).values({ userId: user.userId, questionIds, status: "started" }).returning())[0];
    return { attemptId: attempt.id, questions: rows.map((row) => publicQuestion(row.question)) };
  }}),
  route({ method: "POST", path: "/chemistry/diagnostic/:id/submit", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ answers: z.record(z.string(), z.array(z.string()).max(5)) }));
    const attempt = (await db.select().from(chemistryDiagnosticAttempts).where(and(eq(chemistryDiagnosticAttempts.id, ctx.params.id), eq(chemistryDiagnosticAttempts.userId, user.userId))).limit(1))[0];
    if (!attempt || attempt.status !== "started") throw notFound("找不到可提交的診斷測驗");
    const ids = attempt.questionIds;
    const rows = await db.select({ question: questions, link: chemistryQuestionLinks }).from(chemistryQuestionLinks).innerJoin(questions, eq(questions.id, chemistryQuestionLinks.questionId)).where(inArray(chemistryQuestionLinks.questionId, ids));
    let correctCount = 0;
    const byConcept = new Map<string, { correct: number; total: number }>();
    for (const row of rows) {
      const correct = sameAnswers(body.answers[row.question.id] ?? [], row.question.answer);
      if (correct) correctCount += 1;
      const item = byConcept.get(row.link.conceptId) ?? { correct: 0, total: 0 }; item.total += 1; if (correct) item.correct += 1; byConcept.set(row.link.conceptId, item);
    }
    for (const [conceptId, item] of byConcept) for (let i = 0; i < item.total; i += 1) await updateMastery(user.userId, conceptId, i < item.correct, false);
    const result = { score: Math.round((correctCount / Math.max(rows.length, 1)) * 100), correctCount, total: rows.length, conceptScores: Object.fromEntries([...byConcept.entries()].map(([id, item]) => [id, Math.round((item.correct / item.total) * 100)])) };
    await db.update(chemistryDiagnosticAttempts).set({ status: "completed", answers: body.answers, result, completedAt: new Date() }).where(eq(chemistryDiagnosticAttempts.id, attempt.id));
    await recordStudy({ userId: user.userId, kind: "chemistry_diagnostic", subject: "化學", minutes: 8, detail: { attemptId: attempt.id, score: result.score } });
    await grantLearningReward({ userId: user.userId, nova: 5, xp: 20, reason: "完成化學能力診斷", idempotencyKey: `chemistry:diagnostic:${attempt.id}` });
    return { result };
  }}),
  route({ method: "GET", path: "/chemistry/concepts/:id/lessons", auth: "user", handler: async (ctx) => {
    const lessons = await db.select({ lesson: chemistryLessons, step: chemistryLessonSteps }).from(chemistryLessons).leftJoin(chemistryLessonSteps, eq(chemistryLessonSteps.lessonId, chemistryLessons.id)).where(and(eq(chemistryLessons.conceptId, ctx.params.id), eq(chemistryLessons.status, "published"))).orderBy(asc(chemistryLessons.level), asc(chemistryLessonSteps.orderIndex));
    const map = new Map<string, { lesson: typeof chemistryLessons.$inferSelect; steps: Array<typeof chemistryLessonSteps.$inferSelect> }>();
    for (const row of lessons) { const existing = map.get(row.lesson.id) ?? { lesson: row.lesson, steps: [] }; if (row.step) existing.steps.push(row.step); map.set(row.lesson.id, existing); }
    return { lessons: [...map.values()] };
  }}),
  route({ method: "POST", path: "/chemistry/lessons/:id/progress", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ completedSteps: z.number().int().min(0).max(100), completed: z.boolean().default(false) }));
    const values = { completedSteps: body.completedSteps, completed: body.completed, lastViewedAt: new Date(), completedAt: body.completed ? new Date() : null };
    await db.insert(chemistryLessonProgress).values({ userId: user.userId, lessonId: ctx.params.id, ...values }).onConflictDoUpdate({ target: [chemistryLessonProgress.userId, chemistryLessonProgress.lessonId], set: values });
    if (body.completed) await grantLearningReward({ userId: user.userId, nova: 3, xp: 12, reason: "完成化學教��課程", idempotencyKey: `chemistry:lesson:${user.userId}:${ctx.params.id}` });
    return { saved: true, progress: values };
  }}),
  route({ method: "GET", path: "/chemistry/concepts/:id/practice", auth: "user", handler: async (ctx) => {
    const rows = await db.select({ question: questions }).from(chemistryQuestionLinks).innerJoin(questions, eq(questions.id, chemistryQuestionLinks.questionId)).where(and(eq(chemistryQuestionLinks.conceptId, ctx.params.id), eq(chemistryQuestionLinks.questionStage, "practice"), eq(questions.status, "published"))).orderBy(asc(questions.createdAt)).limit(20);
    return { questions: rows.map((row) => publicQuestion(row.question)) };
  }}),
  route({ method: "POST", path: "/chemistry/questions/:id/answer", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ answers: z.array(z.string()).max(5), hintUsed: z.boolean().default(false) }));
    const row = (await db.select({ question: questions, link: chemistryQuestionLinks }).from(chemistryQuestionLinks).innerJoin(questions, eq(questions.id, chemistryQuestionLinks.questionId)).where(eq(questions.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到化學題目");
    const correct = sameAnswers(body.answers, row.question.answer);
    const mastery = await updateMastery(user.userId, row.link.conceptId, correct, body.hintUsed);
    if (!correct) await db.insert(wrongQuestions).values({ userId: user.userId, questionId: row.question.id, subject: "化學", reason: "chemistry_practice", aiTip: `建議回到「${row.link.conceptId}」相關前置概念。` }).onConflictDoUpdate({ target: [wrongQuestions.userId, wrongQuestions.questionId], set: { wrongCount: sql`${wrongQuestions.wrongCount} + 1`, lastWrongAt: new Date(), nextReviewAt: new Date(Date.now() + 86_400_000), reason: "chemistry_practice" } });
    await recordStudy({ userId: user.userId, kind: "chemistry_practice", subject: "化學", minutes: 2, detail: { questionId: row.question.id, correct } });
    if (correct) await grantLearningReward({ userId: user.userId, nova: 1, xp: 4, reason: "完成化學練習題", idempotencyKey: `chemistry:answer:${user.userId}:${row.question.id}:${Date.now()}` });
    return { correct, explanation: row.question.explanation, correctAnswer: correct ? undefined : row.question.answer, mastery: { ...mastery, label: masteryLabel(mastery.score) } };
  }}),
  route({ method: "POST", path: "/chemistry/ai/teach", auth: "user", rate: { limit: 20, windowSec: 3600 }, handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ conceptId: z.string().uuid(), mode: z.enum(["teach", "hint", "error_analysis"]).default("teach"), question: z.string().max(5000).optional(), studentAnswer: z.string().max(2000).optional() }));
    const concept = (await db.select().from(chemistryConcepts).where(eq(chemistryConcepts.id, body.conceptId)).limit(1))[0];
    if (!concept) throw notFound("找不到化學概念");
    const prereqs = await db.select({ title: chemistryConcepts.title }).from(chemistryPrerequisites).innerJoin(chemistryConcepts, eq(chemistryConcepts.id, chemistryPrerequisites.prerequisiteConceptId)).where(eq(chemistryPrerequisites.conceptId, concept.id));
    const res = await runAi({ feature: "chemistry_teaching", userId: user.userId, parts: [{ kind: "text", text: `你是 StudyNova 化學老師。只根據已知資料回答，不確定就明說。概念：${concept.title}。說明：${concept.description}。前置概念：${prereqs.map((item) => item.title).join("、") || "無"}。模式：${body.mode}。題目：${body.question ?? "無"}。學生答案：${body.studentAnswer ?? "無"}。請用繁體中文，分步驟且不要捏造來源。` }], maxOutputTokens: 900, temperature: 0.2 });
    return { text: res.text, concept: concept.title, source: "StudyNova Chemistry Knowledge Graph" };
  }}),
  route({ method: "GET", path: "/admin/chemistry/graph", auth: "admin", handler: async () => {
    const [topics, concepts, prerequisites, lessons] = await Promise.all([
      db.select().from(chemistryTopics).orderBy(asc(chemistryTopics.sortOrder)),
      db.select().from(chemistryConcepts).orderBy(asc(chemistryConcepts.sortOrder)),
      db.select().from(chemistryPrerequisites),
      db.select().from(chemistryLessons).orderBy(asc(chemistryLessons.level), asc(chemistryLessons.sortOrder)),
    ]);
    return { topics, concepts, prerequisites, lessons };
  }}),
  route({ method: "POST", path: "/admin/chemistry/prerequisites", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ prerequisiteConceptId: z.string().uuid(), conceptId: z.string().uuid() }));
    if (body.prerequisiteConceptId === body.conceptId) throw badRequest("概念不能以自己作為前置概念");
    const edges = await db.select({ from: chemistryPrerequisites.prerequisiteConceptId, to: chemistryPrerequisites.conceptId }).from(chemistryPrerequisites);
    const next = new Map<string, string[]>();
    for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
    next.set(body.prerequisiteConceptId, [...(next.get(body.prerequisiteConceptId) ?? []), body.conceptId]);
    const stack = [body.conceptId]; const visited = new Set<string>();
    while (stack.length) { const current = stack.pop()!; if (current === body.prerequisiteConceptId) throw badRequest("這個前置關係會形成循環依賴，已拒絕儲存"); if (visited.has(current)) continue; visited.add(current); stack.push(...(next.get(current) ?? [])); }
    await db.insert(chemistryPrerequisites).values(body).onConflictDoNothing();
    return { saved: true };
  }}),
];
