import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { previousExamAttempts, previousExamCollections, previousExamQuestions, previousExamSubjects, questions, wrongQuestions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, notFound } from "../core";
import { runAiJson } from "../ai";

function correct(expected: string[], response: string[], type: string) {
  const norm = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const a = expected.map(norm).sort();
  const b = response.map(norm).sort();
  if (["multiple", "多選題"].includes(type)) return a.length === b.length && a.every((value, i) => value === b[i]);
  return Boolean(b[0]) && a.includes(b[0]);
}
function publicQuestion(row: { link: typeof previousExamQuestions.$inferSelect; question: typeof questions.$inferSelect }, reveal = false) {
  return { id: row.link.id, questionNumber: row.link.questionNumber, questionKind: row.link.questionKind, subjectId: row.link.subjectId, stem: row.question.stem, options: row.question.options, type: row.question.type, sourcePageStart: row.link.sourcePageStart, sourcePageEnd: row.link.sourcePageEnd, assetIds: row.link.assetIds, ...(reveal ? { answer: row.question.answer, explanation: row.link.explanationText || row.question.explanation } : {}) };
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/previous-exams/available", auth: "user", handler: async () => {
    const collections = await db.select().from(previousExamCollections).where(and(eq(previousExamCollections.isOpen, true), eq(previousExamCollections.status, "published"))).orderBy(desc(previousExamCollections.year), asc(previousExamCollections.title));
    const subjects = await db.select().from(previousExamSubjects).where(eq(previousExamSubjects.isOpen, true)).orderBy(asc(previousExamSubjects.sortOrder), asc(previousExamSubjects.subjectName));
    return { collections: collections.map((item) => ({ ...item, subjects: subjects.filter((subject) => subject.collectionId === item.id) })) };
  }}),
  route({ method: "GET", path: "/previous-exams/:id", auth: "user", handler: async (ctx) => {
    const collection = (await db.select().from(previousExamCollections).where(eq(previousExamCollections.id, ctx.params.id)).limit(1))[0];
    if (!collection || !collection.isOpen || collection.status !== "published") throw notFound("找不到開放中的歷屆試題");
    const subjects = await db.select().from(previousExamSubjects).where(and(eq(previousExamSubjects.collectionId, collection.id), eq(previousExamSubjects.isOpen, true))).orderBy(asc(previousExamSubjects.sortOrder));
    return { collection, subjects };
  }}),
  route({ method: "GET", path: "/previous-exams/:id/questions", auth: "user", handler: async (ctx) => {
    const collection = (await db.select({ id: previousExamCollections.id, isOpen: previousExamCollections.isOpen, status: previousExamCollections.status }).from(previousExamCollections).where(eq(previousExamCollections.id, ctx.params.id)).limit(1))[0];
    if (!collection || !collection.isOpen || collection.status !== "published") throw notFound("找不到開放中的歷屆試題");
    const subjectId = ctx.query.get("subjectId");
    const rows = await db.select({ link: previousExamQuestions, question: questions }).from(previousExamQuestions).innerJoin(questions, eq(questions.id, previousExamQuestions.questionId)).where(and(eq(previousExamQuestions.collectionId, ctx.params.id), subjectId ? eq(previousExamQuestions.subjectId, subjectId) : undefined, eq(questions.status, "published"))).orderBy(asc(previousExamQuestions.questionNumber));
    return { questions: rows.map((row) => publicQuestion(row)) };
  }}),
  route({ method: "POST", path: "/previous-exams/questions/:id/answer", auth: "user", rate: { limit: 120, windowSec: 3600 }, handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ response: z.array(z.string().max(500)).max(10), durationSec: z.number().int().min(0).max(86400).default(0) }));
    const row = (await db.select({ link: previousExamQuestions, question: questions, collection: previousExamCollections }).from(previousExamQuestions).innerJoin(questions, eq(questions.id, previousExamQuestions.questionId)).innerJoin(previousExamCollections, eq(previousExamCollections.id, previousExamQuestions.collectionId)).where(eq(previousExamQuestions.id, ctx.params.id)).limit(1))[0];
    if (!row || !row.collection.isOpen || row.collection.status !== "published") throw notFound("找不到可作答的題目");
    const isCorrect = correct(row.question.answer, body.response, row.question.type || row.link.questionKind);
    await db.transaction(async (tx) => {
      await tx.insert(previousExamAttempts).values({ userId: user.userId, collectionId: row.link.collectionId, subjectId: row.link.subjectId, previousQuestionId: row.link.id, response: body.response, isCorrect, durationSec: body.durationSec }).onConflictDoUpdate({ target: [previousExamAttempts.userId, previousExamAttempts.previousQuestionId], set: { response: body.response, isCorrect, durationSec: body.durationSec, createdAt: new Date() } });
      if (!isCorrect) await tx.insert(wrongQuestions).values({ userId: user.userId, questionId: row.question.id, subject: row.question.subject, reason: "歷屆學測錯題" }).onConflictDoUpdate({ target: [wrongQuestions.userId, wrongQuestions.questionId], set: { wrongCount: sql`${wrongQuestions.wrongCount} + 1`, lastWrongAt: new Date(), resolvedAt: null, nextReviewAt: new Date(Date.now() + 86400000) } });
    });
    return { correct: isCorrect, question: publicQuestion(row, true), savedToWrongQuestions: !isCorrect };
  }}),
  route({ method: "POST", path: "/previous-exams/questions/:id/ask-ai", auth: "user", rate: { limit: 30, windowSec: 3600 }, handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ prompt: z.string().min(1).max(2000) }));
    const row = (await db.select({ link: previousExamQuestions, question: questions }).from(previousExamQuestions).innerJoin(questions, eq(questions.id, previousExamQuestions.questionId)).where(eq(previousExamQuestions.id, ctx.params.id)).limit(1))[0];
    if (!row) throw notFound("找不到題目");
    const result = await runAiJson<{ answer?: string; nextStep?: string[] }>({ feature: "previous_exam_tutor", userId: user.userId, system: "你是台灣學測家教。只能根據提供的題目、選項、正式詳解回答；若資料不足要明確說明，不得捏造答案。用繁體中文，先給提示，再給推理。", parts: [{ kind: "text", text: `題目：${row.question.stem}\n選項：${JSON.stringify(row.question.options)}\n正式詳解：${row.link.explanationText || row.question.explanation}\n學生問題：${body.prompt}` }], maxOutputTokens: 1800 }, { answer: "目前無法產生 AI 回覆，請先查看正式詳解。", nextStep: [] });
    return { answer: result.data.answer ?? "", nextStep: result.data.nextStep ?? [] };
  }}),
  route({ method: "GET", path: "/admin/previous-exams", auth: "admin", handler: async () => {
    const collections = await db.select().from(previousExamCollections).orderBy(desc(previousExamCollections.year), desc(previousExamCollections.createdAt));
    const subjects = await db.select().from(previousExamSubjects).orderBy(asc(previousExamSubjects.sortOrder));
    return { collections: collections.map((item) => ({ ...item, subjects: subjects.filter((subject) => subject.collectionId === item.id) })) };
  }}),
  route({ method: "POST", path: "/admin/previous-exams", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(80), title: z.string().min(1).max(120), examType: z.string().min(1).max(40).default("學測"), year: z.number().int().min(1).max(9999), description: z.string().max(3000).default(""), sourceFilename: z.string().max(300).default(""), subjects: z.array(z.object({ subjectKey: z.string().min(1).max(40), subjectName: z.string().min(1).max(80), category: z.string().max(80).default("學測科目"), sortOrder: z.number().int().min(0).max(999).default(0) })).max(30).default([]) }));
    const collection = (await db.insert(previousExamCollections).values({ ...body, createdBy: admin.userId, status: "draft", isOpen: false }).returning())[0];
    if (body.subjects.length) await db.insert(previousExamSubjects).values(body.subjects.map((subject) => ({ ...subject, collectionId: collection.id })));
    return { collection, subjects: await db.select().from(previousExamSubjects).where(eq(previousExamSubjects.collectionId, collection.id)) };
  }}),
  route({ method: "PATCH", path: "/admin/previous-exams/:id", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ title: z.string().min(1).max(120).optional(), description: z.string().max(3000).optional(), status: z.enum(["draft", "published", "archived"]).optional(), isOpen: z.boolean().optional(), sourceFilename: z.string().max(300).optional() }));
    const existing = (await db.select().from(previousExamCollections).where(eq(previousExamCollections.id, ctx.params.id)).limit(1))[0];
    if (!existing) throw notFound("找不到歷屆試題集");
    if (body.isOpen && body.status !== "published" && existing.status !== "published") throw badRequest("必須先發布題庫，才能開放給學生");
    const updated = (await db.update(previousExamCollections).set({ ...body, publishedAt: body.status === "published" ? existing.publishedAt ?? new Date() : existing.publishedAt, updatedAt: new Date() }).where(eq(previousExamCollections.id, existing.id)).returning())[0];
    return { collection: updated };
  }}),
  route({ method: "POST", path: "/admin/previous-exams/:id/subjects", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ subjectKey: z.string().min(1).max(40), subjectName: z.string().min(1).max(80), category: z.string().max(80).default("學測科目"), sortOrder: z.number().int().min(0).max(999).default(0), isOpen: z.boolean().default(true) }));
    const collection = (await db.select({ id: previousExamCollections.id }).from(previousExamCollections).where(eq(previousExamCollections.id, ctx.params.id)).limit(1))[0];
    if (!collection) throw notFound("找不到歷屆試題集");
    return { subject: (await db.insert(previousExamSubjects).values({ ...body, collectionId: collection.id }).returning())[0] };
  }}),
  route({ method: "PATCH", path: "/admin/previous-exams/subjects/:id", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ subjectName: z.string().min(1).max(80).optional(), category: z.string().max(80).optional(), sortOrder: z.number().int().min(0).max(999).optional(), isOpen: z.boolean().optional() }));
    const row = (await db.update(previousExamSubjects).set({ ...body, updatedAt: new Date() }).where(eq(previousExamSubjects.id, ctx.params.id)).returning())[0];
    if (!row) throw notFound("找不到科目分類");
    return { subject: row };
  }}),
];
