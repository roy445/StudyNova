import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  questions,
  quizzes,
  quizAttempts,
  answers,
  wrongQuestions,
  studyMaterials,
  dailyWords,
  wordProgress,
  sentences,
  sentenceProgress,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, fingerprint, notFound, forbidden, todayStr } from "../core";
import { consumeFeature, grantLearningReward, progressDailyTask, progressActivities, bumpAchievement } from "../economy";
import { runAiJson, aiConfigured } from "../ai";
import { recordStudy } from "./learning-routes";

const difficulty = z.enum(["easy", "normal", "hard", "exam", "advanced"]);
const qType = z.enum(["single", "multiple", "fill", "truefalse", "short", "reading", "mixed"]);

type GeneratedQuestion = {
  type?: string;
  stem?: string;
  options?: string[];
  answer?: string[] | string;
  explanation?: string;
  topic?: string;
};

export async function generateQuestions(params: {
  userId: string;
  subject: string;
  topic: string;
  sourceText: string;
  count: number;
  difficulty: string;
  type: string;
  level: string;
}) {
  const { data } = await runAiJson<{ questions?: GeneratedQuestion[] }>(
    {
      feature: "quiz_generate",
      userId: params.userId,
      system:
        "你是台灣國高中命題老師。請依提供教材出題，題目必須可由教材內容作答，不得杜撰教材沒有的事實。" +
        '回傳 JSON：{"questions":[{"type":"single|multiple|fill|truefalse|short|reading","stem":"","options":["A選項",...],"answer":["正確選項文字"],"explanation":"","topic":""}]}。' +
        "single/multiple 必須提供 4 個 options，answer 必須完全等於某個 option 字串。使用繁體中文（英文科目可用英文）。",
      parts: [
        {
          kind: "text",
          text: `科目：${params.subject}\n主題：${params.topic}\n難度：${params.difficulty}\n題型：${params.type}\n學制：${params.level}\n題數：${params.count}\n教材內容：\n${params.sourceText.slice(0, 12000)}`,
        },
      ],
      maxOutputTokens: 3000,
    },
    { questions: [] },
  );

  const cleaned = (data.questions ?? [])
    .map((q) => {
      const type = qType.safeParse(q.type ?? "single").success && q.type !== "mixed" ? (q.type as string) : "single";
      const answerArr = Array.isArray(q.answer) ? q.answer.map(String) : q.answer ? [String(q.answer)] : [];
      const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
      if (!q.stem || !answerArr.length) return null;
      if ((type === "single" || type === "multiple") && options.length < 2) return null;
      if ((type === "single" || type === "multiple") && !answerArr.every((a) => options.includes(a))) return null;
      return {
        type,
        stem: String(q.stem).slice(0, 2000),
        options: options.slice(0, 8),
        answer: answerArr.slice(0, 8),
        explanation: String(q.explanation ?? "").slice(0, 2000),
        topic: String(q.topic ?? params.topic).slice(0, 60),
      };
    })
    .filter(Boolean) as Array<{ type: string; stem: string; options: string[]; answer: string[]; explanation: string; topic: string }>;

  if (!cleaned.length) throw fail("AI_NO_VALID_QUESTIONS");

  const ids: string[] = [];
  for (const q of cleaned) {
    const fp = fingerprint(params.subject, q.stem, q.answer.join("|"));
    const inserted = await db
      .insert(questions)
      .values({
        ownerId: params.userId,
        origin: "ai",
        subject: params.subject,
        topic: q.topic,
        level: params.level,
        difficulty: params.difficulty,
        type: q.type,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        fingerprint: fp,
      })
      .onConflictDoNothing()
      .returning({ id: questions.id });
    if (inserted[0]) ids.push(inserted[0].id);
    else {
      const existing = await db.select({ id: questions.id }).from(questions).where(eq(questions.fingerprint, fp)).limit(1);
      if (existing[0]) ids.push(existing[0].id);
    }
  }
  return ids;
}

function isCorrect(type: string, expected: string[], got: string[]) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (type === "multiple") {
    const a = [...expected].map(norm).sort();
    const b = [...got].map(norm).sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (type === "fill" || type === "short") {
    if (!got[0]) return false;
    return expected.some((e) => norm(e) === norm(got[0]) || norm(got[0]).includes(norm(e)));
  }
  return Boolean(got[0]) && expected.some((e) => norm(e) === norm(got[0]));
}

async function addWrongQuestion(userId: string, questionId: string, subject: string, reason: string) {
  await db
    .insert(wrongQuestions)
    .values({ userId, questionId, subject, reason })
    .onConflictDoUpdate({
      target: [wrongQuestions.userId, wrongQuestions.questionId],
      set: {
        wrongCount: sql`${wrongQuestions.wrongCount} + 1`,
        lastWrongAt: new Date(),
        resolvedAt: null,
        mastery: sql`greatest(0, ${wrongQuestions.mastery} - 20)`,
        nextReviewAt: new Date(Date.now() + 86_400_000),
      },
    });
}

export const routes: RouteDef[] = [
  /* -------------------------------------------------------- quizzes */
  route({
    method: "GET",
    path: "/quizzes",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(quizzes).where(eq(quizzes.userId, user.userId)).orderBy(desc(quizzes.createdAt)).limit(60);
      const attempts = await db.select().from(quizAttempts).where(eq(quizAttempts.userId, user.userId)).orderBy(desc(quizAttempts.startedAt)).limit(60);
      return { quizzes: rows.map((q) => ({ ...q, questionCount: q.questionIds.length })), attempts };
    },
  }),

  route({
    method: "POST",
    path: "/quizzes/generate",
    auth: "user",
    rate: { limit: 30, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().max(80).optional(),
          subject: z.string().min(1).max(20),
          topic: z.string().max(80).optional(),
          materialId: z.string().uuid().nullable().optional(),
          sourceText: z.string().max(20000).optional(),
          count: z.number().int().min(1).max(20).default(5),
          difficulty,
          type: qType.default("single"),
          timeLimitSec: z.number().int().min(60).max(7200).default(600),
        }),
      );
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      let sourceText = body.sourceText ?? "";
      if (body.materialId) {
        const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, body.materialId)).limit(1))[0];
        if (!m) throw notFound("找不到教材");
        if (m.userId !== user.userId) throw fail("PERM_NOT_OWNER");
        sourceText = `${m.title}\n${m.content}`;
      }
      if (sourceText.trim().length < 20) throw fail("REQ_CONTENT_TOO_SHORT");
      await consumeFeature(user.userId, "ai_practice");

      const ids = await generateQuestions({
        userId: user.userId,
        subject: body.subject,
        topic: body.topic ?? "",
        sourceText,
        count: body.count,
        difficulty: body.difficulty,
        type: body.type,
        level: "junior",
      });
      const rows = await db
        .insert(quizzes)
        .values({
          userId: user.userId,
          title: body.title || `${body.subject} AI 測驗 ${todayStr()}`,
          subject: body.subject,
          difficulty: body.difficulty,
          source: "ai",
          materialId: body.materialId ?? null,
          timeLimitSec: body.timeLimitSec,
          questionIds: ids,
        })
        .returning();
      return { quiz: rows[0], generated: ids.length };
    },
  }),

  route({
    method: "POST",
    path: "/quizzes/from-wrong",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ subject: z.string().max(20).optional(), count: z.number().int().min(1).max(30).default(10) }));
      const conds = [eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt)];
      if (body.subject) conds.push(eq(wrongQuestions.subject, body.subject));
      const rows = await db.select().from(wrongQuestions).where(and(...conds)).orderBy(asc(wrongQuestions.nextReviewAt)).limit(body.count);
      if (!rows.length) throw fail("REQ_NOTHING_TO_REVIEW");
      const quiz = await db
        .insert(quizzes)
        .values({
          userId: user.userId,
          title: `錯題複習 ${todayStr()}`,
          subject: body.subject ?? "綜合",
          difficulty: "normal",
          source: "wrong",
          timeLimitSec: rows.length * 90,
          questionIds: rows.map((r) => r.questionId),
        })
        .returning();
      return { quiz: quiz[0] };
    },
  }),

  route({
    method: "GET",
    path: "/quizzes/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const quiz = (await db.select().from(quizzes).where(eq(quizzes.id, ctx.params.id)).limit(1))[0];
      if (!quiz) throw notFound("找不到測驗");
      if (quiz.userId !== user.userId && quiz.visibility === "private") throw forbidden();
      const qs = quiz.questionIds.length ? await db.select().from(questions).where(inArray(questions.id, quiz.questionIds)) : [];
      const ordered = quiz.questionIds.map((qid) => qs.find((q) => q.id === qid)).filter(Boolean);
      const attempt = (
        await db
          .select()
          .from(quizAttempts)
          .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, user.userId), eq(quizAttempts.status, "in_progress")))
          .limit(1)
      )[0];
      const saved = attempt ? await db.select().from(answers).where(eq(answers.attemptId, attempt.id)) : [];
      return {
        quiz,
        questions: ordered.map((q) => ({
          id: q!.id,
          type: q!.type,
          stem: q!.stem,
          options: q!.options,
          subject: q!.subject,
          difficulty: q!.difficulty,
        })),
        attempt: attempt ?? null,
        saved: saved.map((s) => ({ questionId: s.questionId, response: s.response })),
      };
    },
  }),

  route({
    method: "POST",
    path: "/quizzes/:id/start",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const quiz = (await db.select().from(quizzes).where(eq(quizzes.id, ctx.params.id)).limit(1))[0];
      if (!quiz) throw notFound("找不到測驗");
      if (quiz.userId !== user.userId && quiz.visibility === "private") throw forbidden();
      const existing = (
        await db
          .select()
          .from(quizAttempts)
          .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, user.userId), eq(quizAttempts.status, "in_progress")))
          .limit(1)
      )[0];
      if (existing) return { attempt: existing, resumed: true };
      const rows = await db
        .insert(quizAttempts)
        .values({ quizId: quiz.id, userId: user.userId, total: quiz.questionIds.length })
        .returning();
      return { attempt: rows[0], resumed: false };
    },
  }),

  route({
    method: "POST",
    path: "/attempts/:id/save",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ questionId: z.string().uuid(), response: z.array(z.string().max(500)).max(8) }));
      const attempt = (await db.select().from(quizAttempts).where(eq(quizAttempts.id, ctx.params.id)).limit(1))[0];
      if (!attempt) throw notFound("找不到作答紀錄");
      if (attempt.userId !== user.userId) throw forbidden();
      if (attempt.status !== "in_progress") throw fail("WEEK_ALREADY_SUBMITTED", { message: "這份測驗已經結束" });
      await db
        .insert(answers)
        .values({ attemptId: attempt.id, questionId: body.questionId, response: body.response })
        .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { response: body.response, updatedAt: new Date() } });
      return { saved: true };
    },
  }),

  route({
    method: "POST",
    path: "/attempts/:id/submit",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ durationSec: z.number().int().min(0).max(36000).default(0) }));
      const attempt = (await db.select().from(quizAttempts).where(eq(quizAttempts.id, ctx.params.id)).limit(1))[0];
      if (!attempt) throw notFound("找不到作答紀錄");
      if (attempt.userId !== user.userId) throw forbidden();
      if (attempt.status === "submitted") throw fail("WEEK_ALREADY_SUBMITTED", { message: "這份測驗已經交卷" });

      const quiz = (await db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).limit(1))[0];
      const qs = quiz.questionIds.length ? await db.select().from(questions).where(inArray(questions.id, quiz.questionIds)) : [];
      const saved = await db.select().from(answers).where(eq(answers.attemptId, attempt.id));

      let correct = 0;
      const review: Array<Record<string, unknown>> = [];
      for (const q of qs) {
        const got = saved.find((s) => s.questionId === q.id)?.response ?? [];
        const ok = isCorrect(q.type, q.answer, got);
        if (ok) correct += 1;
        else await addWrongQuestion(user.userId, q.id, q.subject, "測驗答錯");
        await db
          .insert(answers)
          .values({ attemptId: attempt.id, questionId: q.id, response: got, isCorrect: ok })
          .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { isCorrect: ok, updatedAt: new Date() } });
        review.push({ questionId: q.id, stem: q.stem, options: q.options, type: q.type, answer: q.answer, explanation: q.explanation, response: got, isCorrect: ok });
      }
      const total = qs.length || 1;
      const score = Math.round((correct / total) * 1000) / 10;

      const updated = await db
        .update(quizAttempts)
        .set({ status: "submitted", score, total: qs.length, correctCount: correct, durationSec: body.durationSec, submittedAt: new Date() })
        .where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.status, "in_progress")))
        .returning();
      if (!updated[0]) throw fail("WEEK_ALREADY_SUBMITTED", { message: "這份測驗已經交卷" });

      let reward = null;
      const claimed = await db
        .update(quizAttempts)
        .set({ rewardGranted: true })
        .where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.rewardGranted, false)))
        .returning({ id: quizAttempts.id });
      if (claimed[0]) {
        reward = await grantLearningReward({
          userId: user.userId,
          nova: 10 + Math.round(score / 10),
          xp: 20 + correct * 5,
          reason: `完成測驗：${quiz.title}`,
          idempotencyKey: `quiz:${attempt.id}`,
        });
        await progressDailyTask(user.userId, "quiz", 1);
        await progressActivities(user.userId, "quiz", 1);
        await recordStudy({ userId: user.userId, kind: "quiz", subject: quiz.subject, minutes: Math.max(1, Math.round(body.durationSec / 60)), detail: { score } });
        const totalAttempts = await db.select({ c: sql<number>`count(*)::int` }).from(quizAttempts).where(and(eq(quizAttempts.userId, user.userId), eq(quizAttempts.status, "submitted")));
        await bumpAchievement(user.userId, "quiz_count", totalAttempts[0]?.c ?? 1);
        const answered = await db.select({ c: sql<number>`count(*)::int` }).from(answers).innerJoin(quizAttempts, eq(answers.attemptId, quizAttempts.id)).where(eq(quizAttempts.userId, user.userId));
        await bumpAchievement(user.userId, "questions_answered", answered[0]?.c ?? 0);
      }
      return { attempt: updated[0], score, correct, total: qs.length, review, reward };
    },
  }),

  route({
    method: "GET",
    path: "/attempts/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const attempt = (await db.select().from(quizAttempts).where(eq(quizAttempts.id, ctx.params.id)).limit(1))[0];
      if (!attempt) throw notFound("找不到作答紀錄");
      if (attempt.userId !== user.userId) throw forbidden();
      const quiz = (await db.select().from(quizzes).where(eq(quizzes.id, attempt.quizId)).limit(1))[0];
      const saved = await db.select().from(answers).where(eq(answers.attemptId, attempt.id));
      const qs = quiz.questionIds.length ? await db.select().from(questions).where(inArray(questions.id, quiz.questionIds)) : [];
      return {
        attempt,
        quiz,
        review: qs.map((q) => {
          const a = saved.find((s) => s.questionId === q.id);
          return { questionId: q.id, stem: q.stem, options: q.options, type: q.type, answer: q.answer, explanation: q.explanation, response: a?.response ?? [], isCorrect: a?.isCorrect ?? false };
        }),
      };
    },
  }),

  /* ---------------------------------------------------- wrong book */
  route({
    method: "GET",
    path: "/wrong",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db
        .select({
          id: wrongQuestions.id,
          questionId: wrongQuestions.questionId,
          subject: wrongQuestions.subject,
          wrongCount: wrongQuestions.wrongCount,
          reviewCount: wrongQuestions.reviewCount,
          mastery: wrongQuestions.mastery,
          reason: wrongQuestions.reason,
          aiTip: wrongQuestions.aiTip,
          nextReviewAt: wrongQuestions.nextReviewAt,
          resolvedAt: wrongQuestions.resolvedAt,
          stem: questions.stem,
          options: questions.options,
          answer: questions.answer,
          explanation: questions.explanation,
          type: questions.type,
        })
        .from(wrongQuestions)
        .innerJoin(questions, eq(questions.id, wrongQuestions.questionId))
        .where(eq(wrongQuestions.userId, user.userId))
        .orderBy(asc(wrongQuestions.nextReviewAt))
        .limit(200);
      const due = rows.filter((r) => !r.resolvedAt && new Date(r.nextReviewAt) <= new Date()).length;
      return { items: rows, due };
    },
  }),

  route({
    method: "POST",
    path: "/wrong/:id/review",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ correct: z.boolean() }));
      const row = (await db.select().from(wrongQuestions).where(eq(wrongQuestions.id, ctx.params.id)).limit(1))[0];
      if (!row) throw notFound("找不到錯題");
      if (row.userId !== user.userId) throw forbidden();
      const mastery = Math.max(0, Math.min(100, row.mastery + (body.correct ? 25 : -15)));
      const intervalDays = body.correct ? Math.min(21, Math.max(1, Math.round(mastery / 20))) : 1;
      const updated = await db
        .update(wrongQuestions)
        .set({
          reviewCount: sql`${wrongQuestions.reviewCount} + 1`,
          mastery,
          nextReviewAt: new Date(Date.now() + intervalDays * 86_400_000),
          resolvedAt: mastery >= 100 ? new Date() : null,
        })
        .where(eq(wrongQuestions.id, row.id))
        .returning();
      await progressDailyTask(user.userId, "wrong_review", 1);
      if (mastery >= 100) {
        await grantLearningReward({ userId: user.userId, nova: 8, xp: 15, reason: "錯題完全掌握", idempotencyKey: `wrongmastered:${row.id}` });
        const resolved = await db.select({ c: sql<number>`count(*)::int` }).from(wrongQuestions).where(and(eq(wrongQuestions.userId, user.userId), sql`${wrongQuestions.resolvedAt} is not null`));
        await bumpAchievement(user.userId, "wrong_resolved", resolved[0]?.c ?? 1);
      }
      return { item: updated[0] };
    },
  }),

  route({
    method: "POST",
    path: "/wrong/:id/ai-tip",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const row = (await db.select().from(wrongQuestions).where(eq(wrongQuestions.id, ctx.params.id)).limit(1))[0];
      if (!row) throw notFound("找不到錯題");
      if (row.userId !== user.userId) throw forbidden();
      await consumeFeature(user.userId, "wrong_review_ai");
      const q = (await db.select().from(questions).where(eq(questions.id, row.questionId)).limit(1))[0];
      const { data } = await runAiJson<{ simple?: string; memory?: string; similar?: string; nextStep?: string }>(
        {
          feature: "wrong_tip",
          userId: user.userId,
          system: '你是耐心的家教。回傳 JSON：{"simple":"更簡單的解法","memory":"記憶方法","similar":"一題類似題","nextStep":"下次複習建議"}。繁體中文。',
          parts: [{ kind: "text", text: `題目：${q.stem}\n選項：${q.options.join(" / ")}\n正解：${q.answer.join(",")}\n原解析：${q.explanation}` }],
          maxOutputTokens: 900,
        },
        {},
      );
      const tip = [data.simple, data.memory, data.similar, data.nextStep].filter(Boolean).join("\n\n");
      await db.update(wrongQuestions).set({ aiTip: tip }).where(eq(wrongQuestions.id, row.id));
      return { tip, detail: data };
    },
  }),

  /* --------------------------------------------------------- words */
  route({
    method: "POST",
    path: "/words/answer",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ wordId: z.string().uuid(), correct: z.boolean(), mode: z.string().max(20).default("card") }));
      const word = (await db.select().from(dailyWords).where(eq(dailyWords.id, body.wordId)).limit(1))[0];
      if (!word) throw notFound("找不到單字");
      await db.insert(wordProgress).values({ userId: user.userId, wordId: word.id }).onConflictDoNothing();
      const rows = await db
        .update(wordProgress)
        .set({
          familiarity: sql`greatest(0, least(100, ${wordProgress.familiarity} + ${body.correct ? 20 : -10}))`,
          correctCount: sql`${wordProgress.correctCount} + ${body.correct ? 1 : 0}`,
          wrongCount: sql`${wordProgress.wrongCount} + ${body.correct ? 0 : 1}`,
          nextReviewAt: new Date(Date.now() + (body.correct ? 2 : 0.5) * 86_400_000),
          updatedAt: new Date(),
        })
        .where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)))
        .returning();
      await progressDailyTask(user.userId, "words", 1);
      await progressActivities(user.userId, "words", 1);
      const mastered = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(wordProgress)
        .where(and(eq(wordProgress.userId, user.userId), sql`${wordProgress.familiarity} >= 80`));
      await bumpAchievement(user.userId, "words_mastered", mastered[0]?.c ?? 0);
      return { progress: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/words/session-complete",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ correct: z.number().int().min(0).max(200), total: z.number().int().min(1).max(200), seconds: z.number().int().min(0).max(7200) }));
      const sessionKey = `words:${user.userId}:${Date.now()}`;
      const reward = await grantLearningReward({
        userId: user.userId,
        nova: 5 + Math.round((body.correct / body.total) * 10),
        xp: 10 + body.correct * 2,
        reason: `完成單字練習 ${body.correct}/${body.total}`,
        idempotencyKey: sessionKey,
      });
      await recordStudy({ userId: user.userId, kind: "words", subject: "英文", minutes: Math.max(1, Math.round(body.seconds / 60)) });
      return { reward };
    },
  }),

  route({
    method: "POST",
    path: "/words/memory-tip",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ wordId: z.string().uuid() }));
      const word = (await db.select().from(dailyWords).where(eq(dailyWords.id, body.wordId)).limit(1))[0];
      if (!word) throw notFound("找不到單字");
      await consumeFeature(user.userId, "ai_context");
      const { data } = await runAiJson<{ association?: string; roots?: string; story?: string; pronunciation?: string; contrast?: string }>(
        {
          feature: "memory_tip",
          userId: user.userId,
          system: '你是英語記憶法專家。回傳 JSON：{"association":"聯想","roots":"字根拆解","story":"小故事","pronunciation":"發音提示","contrast":"易混淆對比"}。繁體中文。',
          parts: [{ kind: "text", text: `單字：${word.word}\n中文：${word.meaning}\n例句：${word.example}` }],
          maxOutputTokens: 700,
        },
        {},
      );
      const tip = [data.association, data.roots, data.story, data.pronunciation, data.contrast].filter(Boolean).join("\n");
      await db.insert(wordProgress).values({ userId: user.userId, wordId: word.id, memoryTip: tip }).onConflictDoUpdate({
        target: [wordProgress.userId, wordProgress.wordId],
        set: { memoryTip: tip, updatedAt: new Date() },
      });
      return { tip, detail: data };
    },
  }),

  /* ----------------------------------------------------- sentences */
  route({
    method: "GET",
    path: "/sentences",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.execute(sql`
        select s.id, s.en, s.zh, s.level, s.keywords, coalesce(p.familiarity,0) as familiarity, p.memory_tip
        from sentences s left join sentence_progress p on p.sentence_id = s.id and p.user_id = ${user.userId}
        order by coalesce(p.familiarity, -1) asc, random() limit 40`);
      return { sentences: rows.rows };
    },
  }),

  route({
    method: "POST",
    path: "/sentences/answer",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ sentenceId: z.string().uuid(), correct: z.boolean() }));
      const s = (await db.select().from(sentences).where(eq(sentences.id, body.sentenceId)).limit(1))[0];
      if (!s) throw notFound("找不到句子");
      await db.insert(sentenceProgress).values({ userId: user.userId, sentenceId: s.id }).onConflictDoNothing();
      const rows = await db
        .update(sentenceProgress)
        .set({
          familiarity: sql`greatest(0, least(100, ${sentenceProgress.familiarity} + ${body.correct ? 20 : -10}))`,
          correctCount: sql`${sentenceProgress.correctCount} + ${body.correct ? 1 : 0}`,
          wrongCount: sql`${sentenceProgress.wrongCount} + ${body.correct ? 0 : 1}`,
          updatedAt: new Date(),
        })
        .where(and(eq(sentenceProgress.userId, user.userId), eq(sentenceProgress.sentenceId, s.id)))
        .returning();
      await progressDailyTask(user.userId, "sentence", 1);
      return { progress: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/wrong/due",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wrongQuestions)
        .where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt), lte(wrongQuestions.nextReviewAt, new Date())));
      return { due: rows[0]?.count ?? 0 };
    },
  }),
];
