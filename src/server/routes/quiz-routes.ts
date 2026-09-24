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
  examModePolicies,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, fingerprint, notFound, forbidden, todayStr } from "../core";
import { consumeFeature, grantLearningReward, progressDailyTask, progressActivities, bumpAchievement } from "../economy";
import { runAiJson, aiConfigured } from "../ai";
import { recordStudy } from "./learning-routes";
import { recordReviewOutcome } from "../review-service";

const difficulty = z.enum(["easy", "normal", "hard", "exam", "advanced"]);
const qType = z.enum(["single", "multiple", "fill", "truefalse", "short", "reading", "part_of_speech", "meaning", "mixed"]);

type GeneratedQuestion = {
  type?: string;
  stem?: string;
  options?: string[];
  answer?: string[] | string;
  explanation?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
};

export function normalizeQuizOption(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, "").replace(/\s+/g, " ");
}

type NormalizedQuestion = { options: string[]; answer: string[]; stem: string };
export function validateQuizOptionPool(items: NormalizedQuestion[]) {
  const usedOptions: string[] = []; const counts = new Map<string, number>(); const duplicateQuestionIndexes: number[] = []; let sameQuestionDuplicate = false;
  for (const [questionIndex, item] of items.entries()) { const local = new Set<string>(); let duplicateInQuestion = false; for (const option of item.options) { const key = normalizeQuizOption(option); if (!key || local.has(key)) { sameQuestionDuplicate = true; duplicateInQuestion = true; } local.add(key); usedOptions.push(key); counts.set(key, (counts.get(key) ?? 0) + 1); } if (duplicateInQuestion) duplicateQuestionIndexes.push(questionIndex); }
  const totalOptions = usedOptions.length; const uniqueOptions = counts.size; const repeatedOccurrences = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0); const repeatedRate = totalOptions ? repeatedOccurrences / totalOptions : 0;
  return { usedOptions, optionUsageCount: Object.fromEntries(counts), totalOptions, uniqueOptions, repeatedOccurrences, repeatedRate, sameQuestionDuplicate, duplicateQuestionIndexes, excessiveCrossQuestionDuplicates: repeatedOccurrences > Math.max(2, Math.floor(totalOptions * 0.2)) };
}

type StrictEnglishQuestion = NormalizedQuestion & { type?: string };

/**
 * English vocabulary/grammar questions use a strict exam format:
 * four different options, exactly one correct answer, and no repeated
 * option set in the same quiz.  This is intentionally server-side because
 * model output must never be trusted merely because it is valid JSON.
 */
export function validateEnglishQuizOptions(items: StrictEnglishQuestion[]) {
  const invalidQuestionIndexes: number[] = [];
  const duplicateOptionSetIndexes: number[] = [];
  const optionSetOwners = new Map<string, number>();
  const optionUsageCount = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    const normalized = item.options.map(normalizeQuizOption).filter(Boolean);
    const localUnique = new Set(normalized);
    const answerKeys = item.answer.map(normalizeQuizOption).filter(Boolean);
    const invalid =
      normalized.length !== 4 ||
      localUnique.size !== 4 ||
      answerKeys.length !== 1 ||
      !answerKeys.every((answer) => localUnique.has(answer));
    if (invalid) invalidQuestionIndexes.push(index);

    const signature = [...localUnique].sort().join("|");
    if (signature && localUnique.size === 4) {
      const previous = optionSetOwners.get(signature);
      if (previous !== undefined) {
        duplicateOptionSetIndexes.push(index, previous);
      } else {
        optionSetOwners.set(signature, index);
      }
    }
    for (const option of normalized) optionUsageCount.set(option, (optionUsageCount.get(option) ?? 0) + 1);
  }

  const repeatedOptionKeys = [...optionUsageCount.entries()].filter(([, count]) => count > 1).map(([option]) => option);
  return {
    valid: invalidQuestionIndexes.length === 0 && duplicateOptionSetIndexes.length === 0 && repeatedOptionKeys.length === 0,
    invalidQuestionIndexes: [...new Set(invalidQuestionIndexes)],
    duplicateOptionSetIndexes: [...new Set(duplicateOptionSetIndexes)].sort((a, b) => a - b),
    repeatedOptionKeys,
    optionUsageCount: Object.fromEntries(optionUsageCount),
  };
}

export function normalizeQuestionStem(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, "").replace(/\s+/g, " ");
}

export function filterDuplicateQuestions<T extends { stem: string; options: string[] }>(items: T[], reservedStems: Set<string> = new Set()) {
  const stems = new Set(reservedStems);
  const options = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const stem = normalizeQuestionStem(item.stem);
    const normalizedOptions = item.options.map(normalizeQuizOption).filter(Boolean);
    if (!stem || stems.has(stem) || normalizedOptions.some((option) => options.has(option))) continue;
    stems.add(stem);
    for (const option of normalizedOptions) options.add(option);
    unique.push(item);
  }
  return unique;
}

type CleanQuestion = { type: string; stem: string; options: string[]; answer: string[]; explanation: string; topic: string; metadata: Record<string, unknown> };
function cleanGeneratedQuestions(raw: GeneratedQuestion[], topic: string): CleanQuestion[] {
  return raw.map((q) => { const type = qType.safeParse(q.type ?? "single").success && q.type !== "mixed" ? (q.type as string) : "single"; const answerArr = Array.isArray(q.answer) ? q.answer.map(String).filter(Boolean) : q.answer ? [String(q.answer)] : []; const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : []; if (!q.stem || !answerArr.length) return null; if (["single", "multiple", "part_of_speech", "meaning"].includes(type) && options.length < 2) return null; if (["single", "multiple", "part_of_speech", "meaning"].includes(type) && !answerArr.every((a) => options.includes(a))) return null; return { type, stem: String(q.stem).slice(0, 2000), options: options.slice(0, 8), answer: answerArr.slice(0, 8), explanation: String(q.explanation ?? "").slice(0, 2000), metadata: q.metadata ?? {}, topic: String(q.topic ?? topic).slice(0, 60) }; }).filter(Boolean) as CleanQuestion[];
}

function isEnglishSubject(subject: string) {
  return /^(english|英文|英文科|英語|英語科)$/i.test(subject.trim());
}

function diversityRepairIndexes(items: CleanQuestion[], optionUsageCount: Record<string, number>): number[] {
  const overused = new Set(Object.entries(optionUsageCount).filter(([, count]) => count >= 2).map(([option]) => option));
  return items.map((item, index) => ({ index, repeated: item.options.filter((option) => overused.has(normalizeQuizOption(option))).length })).filter((item) => item.repeated > 0).sort((a, b) => b.repeated - a.repeated).slice(0, Math.max(1, Math.ceil(items.length * 0.25))).map((item) => item.index);
}

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
  const strictEnglishOptions = isEnglishSubject(params.subject) && ["single", "multiple", "part_of_speech", "meaning", "mixed"].includes(params.type);
  const existingRows = await db.select({ stem: questions.stem }).from(questions).where(and(eq(questions.ownerId, params.userId), eq(questions.subject, params.subject))).limit(2000);
  const reservedQuestionStems = new Set(existingRows.map((row) => normalizeQuestionStem(row.stem)));
  let cleaned: CleanQuestion[] = [];
  let usedOptionPool: string[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const usage = usedOptionPool.reduce<Record<string, number>>((counts, option) => { counts[option] = (counts[option] ?? 0) + 1; return counts; }, {});
    const usedQuestionStems = cleaned.map((item) => item.stem).concat([...reservedQuestionStems]).slice(-120);
    const avoid = `${usedOptionPool.length ? `本次測驗選項使用次數（每個選項只能出現 1 次）：${JSON.stringify(usage)}` : "目前尚無已使用選項。"}\n已經用過的題目（不可改寫後重複）：${JSON.stringify(usedQuestionStems)}`;
    const { data } = await runAiJson<{ questions?: GeneratedQuestion[] }>({ feature: "quiz_generate", userId: params.userId, system: `你是台灣國高中題目設計引擎。請依教材出題，不得杜撰。回傳 JSON questions。${strictEnglishOptions ? "這是英文單字或文法測驗：每一題必須恰好提供 4 個選項 A、B、C、D，四個選項不可重複；single、part_of_speech、meaning、multiple 必須只有一個正確答案（answer 只放一個選項原文）。每題都要依題幹量身設計選項，禁止複製其他題的整組選項。單字干擾項須與題幹相關、同詞性、語意接近、字形易混淆或是常見誤用；文法干擾項須屬同一文法主題下的不同時態、動詞變化或常見學習者錯誤，且必須有明確唯一正解。" : "single/part_of_speech/meaning 優先提供 4 個合理 options。"}選項不等於考試範圍：干擾選項可以使用範圍外但合理的合法詞彙。不可為了去重使用不自然或無關選項。整份測驗不得重複相同選項組合；使用繁體中文（英文科目可用英文）。`, parts: [{ kind: "text", text: `科目：${params.subject}\n主題：${params.topic}\n難度：${params.difficulty}\n題型：${params.type}\n學制：${params.level}\n題數：${params.count}\n${avoid}\n教材內容：\n${params.sourceText.slice(0, 12000)}` }], maxOutputTokens: 3000 }, { questions: [] });
    let candidate = filterDuplicateQuestions(cleanGeneratedQuestions(data.questions ?? [], params.topic), reservedQuestionStems); let validation = validateQuizOptionPool(candidate);
    if (candidate.length && validation.excessiveCrossQuestionDuplicates && attempt < 2) {
      const repairIndexes = diversityRepairIndexes(candidate, validation.optionUsageCount);
      const repairPrompt = repairIndexes.map((index) => `第 ${index + 1} 題：${candidate[index].stem}\n目前答案：${JSON.stringify(candidate[index].answer)}\n目前選項：${JSON.stringify(candidate[index].options)}`).join("\n");
      const repaired = await runAiJson<{ questions?: GeneratedQuestion[] }>({ feature: "quiz_generate_repair", userId: params.userId, system: `只重新生成指定題目的選項與答案。保留原題幹、正確性與難度；${strictEnglishOptions ? "必須恰好輸出 4 個全新且互不重複的英文選項，answer 只能有一個，干擾項要符合單字同詞性近義／易混淆或文法常見錯誤規則，且不得與其他題形成相同選項組合。" : "避免使用已出現 2 次以上的選項，優先選擇相同詞性、易混淆或相同語境的合理干擾選項。"}範圍外單字只能作干擾選項，不得變成正式考點。回傳 JSON questions。`, parts: [{ kind: "text", text: `已使用選項次數：${JSON.stringify(validation.optionUsageCount)}\n請修復以下題目：\n${repairPrompt}` }], maxOutputTokens: 1800 }, { questions: [] });
      const replacements = filterDuplicateQuestions(cleanGeneratedQuestions(repaired.data.questions ?? [], params.topic), reservedQuestionStems);
      for (const [position, index] of repairIndexes.entries()) if (replacements[position]) candidate[index] = replacements[position];
      candidate = filterDuplicateQuestions(candidate, reservedQuestionStems);
      validation = validateQuizOptionPool(candidate);
    }
    const strictValidation = strictEnglishOptions ? validateEnglishQuizOptions(candidate) : { valid: true, invalidQuestionIndexes: [], duplicateOptionSetIndexes: [], repeatedOptionKeys: [] };
    const enoughQuestions = candidate.length >= params.count;
    const score = (enoughQuestions ? 0 : 10000) + validation.repeatedOccurrences + Math.round(validation.repeatedRate * 100) + (strictValidation.valid ? 0 : 5000 + strictValidation.invalidQuestionIndexes.length * 100 + strictValidation.duplicateOptionSetIndexes.length * 100 + strictValidation.repeatedOptionKeys.length * 100);
    if (candidate.length && score < bestScore) { cleaned = candidate; bestScore = score; }
    usedOptionPool = validation.usedOptions;
    if (candidate.length >= params.count && !validation.sameQuestionDuplicate && !validation.excessiveCrossQuestionDuplicates && strictValidation.valid) break;
  }
  if (!cleaned.length || cleaned.length < params.count || (strictEnglishOptions && !validateEnglishQuizOptions(cleaned).valid)) throw fail("AI_NO_VALID_QUESTIONS");

  const ids: string[] = [];
  for (const q of cleaned) {
    const fp = fingerprint(params.userId, params.subject, q.type, normalizeQuestionStem(q.stem));
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
        metadata: q.metadata,
        fingerprint: fp,
      })
      .onConflictDoNothing()
      .returning({ id: questions.id });
    if (inserted[0]) ids.push(inserted[0].id);
    // Never reuse a conflicting question ID: doing so was the source of
    // identical questions appearing in every newly generated quiz.
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
          examMode: z.string().max(40).default("general"),
          educationLevel: z.enum(["junior", "senior"]).default("junior"),
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
      const policy = (await db.select().from(examModePolicies).where(and(eq(examModePolicies.mode, body.examMode), eq(examModePolicies.enabled, true))).limit(1))[0];
      if (!policy) throw fail("REQ_VALIDATION", { message: "找不到可用的考試模式" });
      sourceText = `【正式考試模式：${policy.label}】\n${policy.description}\n模式規則：${JSON.stringify(policy.rules)}\n請依此規則設計題型、閱讀理解與能力取向，不可只更改標籤。\n${sourceText}`;

      const ids = await generateQuestions({
        userId: user.userId,
        subject: body.subject,
        topic: body.topic ?? "",
        sourceText,
        count: body.count,
        difficulty: body.difficulty,
        type: body.type,
        level: body.educationLevel,
      });
      const rows = await db
        .insert(quizzes)
        .values({
          userId: user.userId,
          title: body.title || `${policy.label}・${body.subject} AI 測驗 ${todayStr()}`,
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
      await recordReviewOutcome({
        userId: user.userId,
        contentType: "wrong_question",
        contentId: row.id,
        rating: body.correct ? "good" : "again",
        source: "wrong_review",
        metadata: { questionId: row.questionId, mastery },
      });
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
      const body = await ctx.json(z.object({ wordId: z.string().uuid(), correct: z.boolean(), mode: z.string().max(20).default("card"), selfRating: z.enum(["again", "hard", "good", "easy"]).optional(), addToWrongBook: z.boolean().default(false) }));
      const word = (await db.select().from(dailyWords).where(eq(dailyWords.id, body.wordId)).limit(1))[0];
      if (!word) throw notFound("找不到單字");
      const now = new Date();
      await db.insert(wordProgress).values({ userId: user.userId, wordId: word.id, firstSeenAt: now }).onConflictDoNothing();
      const rows = await db
        .update(wordProgress)
        .set({
          familiarity: sql`greatest(0, least(100, ${wordProgress.familiarity} + ${body.correct ? 20 : -10}))`,
          correctCount: sql`${wordProgress.correctCount} + ${body.correct ? 1 : 0}`,
          wrongCount: sql`${wordProgress.wrongCount} + ${body.correct ? 0 : 1}`,
          reviewCount: sql`${wordProgress.reviewCount} + 1`,
          lastCorrect: body.correct,
          selfRating: body.selfRating ?? (body.correct ? "good" : "again"),
          nextReviewAt: new Date(Date.now() + (body.correct ? 2 : 0.5) * 86_400_000),
          updatedAt: new Date(),
        })
        .where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)))
        .returning();
      await progressDailyTask(user.userId, "words", 1);
      await progressActivities(user.userId, "words", 1);
      await recordReviewOutcome({
        userId: user.userId,
        contentType: "vocabulary",
        contentId: word.id,
        rating: body.correct ? "good" : "again",
        source: `word_answer:${body.mode}`,
        metadata: { word: word.word, mode: body.mode },
      });
      if (!body.correct && body.addToWrongBook) {
        const qRows = await db.insert(questions).values({
          ownerId: user.userId,
          origin: "word_challenge",
          subject: "英文單字",
          topic: "單字挑戰錯題",
          level: word.level,
          difficulty: "normal",
          type: "short",
          stem: `請寫出「${word.meaning}」的英文。`,
          options: [],
          answer: [word.word],
          explanation: `${word.word}：${word.meaning}`,
          fingerprint: fingerprint("英文單字", word.word, word.meaning),
        }).onConflictDoNothing().returning({ id: questions.id });
        const q = qRows[0] ?? (await db.select({ id: questions.id }).from(questions).where(eq(questions.fingerprint, fingerprint("英文單字", word.word, word.meaning))).limit(1))[0];
        if (q) await addWrongQuestion(user.userId, q.id, "英文單字", "挑戰答錯，使用者選擇加入錯題本");
      }
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
