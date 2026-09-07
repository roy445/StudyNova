import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  dailyWords,
  questions,
  wordAiContents,
  wordExamples,
  wordExplanations,
  wordForms,
  wordPhrases,
  wordProgress,
  wordSynonyms,
  wrongQuestions,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { consumeFeature } from "../economy";
import { aiConfigured, runAiJson } from "../ai";
import { fail, fingerprint, notFound } from "../core";

const aiContentSchema = z.object({
  explanations: z.array(z.string().min(1).max(500)).max(8).default([]),
  synonyms: z.array(z.object({
    word: z.string().min(1).max(80),
    meaning: z.string().max(240).default(""),
    partOfSpeech: z.string().max(40).default(""),
    difference: z.string().max(500).default(""),
    usage: z.string().max(500).default(""),
  })).max(8).default([]),
  examples: z.array(z.object({ english: z.string().min(1).max(500), chinese: z.string().max(500), level: z.string().max(30) })).max(6).default([]),
  phrases: z.array(z.object({ phrase: z.string().min(1).max(180), meaning: z.string().max(240) })).max(10).default([]),
  forms: z.array(z.object({ form: z.string().min(1).max(100), partOfSpeech: z.string().max(40), meaning: z.string().max(240) })).max(12).default([]),
  mistakes: z.array(z.object({ wrong: z.string().min(1).max(500), correct: z.string().min(1).max(500), reason: z.string().max(500) })).max(6).default([]),
  memoryTip: z.string().max(1000).default(""),
  etymology: z.string().max(1000).default(""),
});

type LearningState = "not_learned" | "learning" | "mastered" | "mistakes" | "review";

function progressState(progress: typeof wordProgress.$inferSelect | undefined, now = Date.now()): LearningState {
  if (!progress || (progress.familiarity <= 0 && progress.wrongCount <= 0)) return "not_learned";
  if (progress.familiarity >= 80) return "mastered";
  if (progress.nextReviewAt.getTime() <= now) return "review";
  if (progress.wrongCount > 0) return "mistakes";
  return "learning";
}

function cleanList<T>(items: T[], max: number): T[] {
  return items.filter(Boolean).slice(0, max);
}

function uniqueExamples<T extends { english: string; chinese?: string }>(items: T[], max: number): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.english.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}

function fallbackExamples(word: { word: string; partOfSpeech: string }) {
  const term = word.word.trim();
  const partOfSpeech = word.partOfSpeech.toLowerCase();
  if (partOfSpeech.startsWith("v")) {
    return [
      { english: `She decided to ${term} before dinner.`, chinese: `她決定在晚餐前${term}。`, level: "基礎", sourceKind: "generated" },
      { english: `I try to ${term} whenever I have a few quiet minutes.`, chinese: `只要有幾分鐘安靜的時間，我就會試著${term}。`, level: "基礎", sourceKind: "generated" },
    ];
  }
  if (partOfSpeech.startsWith("adj")) {
    return [
      { english: `The ${term} design made the app easier to use.`, chinese: `這個${term}的設計讓應用程式更容易使用。`, level: "基礎", sourceKind: "generated" },
      { english: `He gave a ${term} answer during the interview.`, chinese: `他在面試時給出了一個${term}的回答。`, level: "基礎", sourceKind: "generated" },
    ];
  }
  return [
    { english: `The ${term} on the table caught my attention.`, chinese: `桌上的${term}引起了我的注意。`, level: "基礎", sourceKind: "generated" },
    { english: `We used the ${term} during today's class activity.`, chinese: `我們在今天的課堂活動中使用了這個${term}。`, level: "基礎", sourceKind: "generated" },
  ];
}

async function safeRows<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch {
    // 0017 is deployed independently from the application bundle in some environments.
    // The detail page must still render the legacy daily_words record if optional tables are absent.
    return [];
  }
}

async function getWord(wordId: string) {
  try {
    const word = (await db.select().from(dailyWords).where(eq(dailyWords.id, wordId)).limit(1))[0];
    if (!word) throw notFound("找不到單字");
    return word;
  } catch {
    const legacy = (await db.select({
      id: dailyWords.id,
      word: dailyWords.word,
      meaning: dailyWords.meaning,
      meanings: dailyWords.meanings,
      phrases: dailyWords.phrases,
      partOfSpeech: dailyWords.partOfSpeech,
      example: dailyWords.example,
      exampleZh: dailyWords.exampleZh,
      level: dailyWords.level,
      weekId: dailyWords.weekId,
      createdAt: dailyWords.createdAt,
    }).from(dailyWords).where(eq(dailyWords.id, wordId)).limit(1))[0];
    if (!legacy) throw notFound("找不到單字");
    return legacy;
  }
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/words/:id/detail",
    auth: "user",
    rate: { limit: 120, windowSec: 60, key: "word-detail" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const word = await getWord(ctx.params.id);
      const [synonyms, examples, phrases, forms, explanations, progress, ai] = await Promise.all([
        safeRows(() => db.select().from(wordSynonyms).where(eq(wordSynonyms.wordId, word.id)).orderBy(asc(wordSynonyms.createdAt))),
        safeRows(() => db.select().from(wordExamples).where(eq(wordExamples.wordId, word.id)).orderBy(asc(wordExamples.createdAt))),
        safeRows(() => db.select().from(wordPhrases).where(eq(wordPhrases.wordId, word.id)).orderBy(asc(wordPhrases.createdAt))),
        safeRows(() => db.select().from(wordForms).where(eq(wordForms.wordId, word.id)).orderBy(asc(wordForms.createdAt))),
        safeRows(() => db.select().from(wordExplanations).where(eq(wordExplanations.wordId, word.id)).orderBy(asc(wordExplanations.createdAt))),
        safeRows(() => db.select().from(wordProgress).where(and(eq(wordProgress.wordId, word.id), eq(wordProgress.userId, user.userId))).limit(1)),
        safeRows(() => db.select().from(wordAiContents).where(eq(wordAiContents.wordId, word.id)).limit(1)),
      ]);
      const currentProgress = progress[0];
      return {
        word: {
          id: word.id,
          word: word.word,
          meaning: word.meaning,
          meanings: word.meanings,
          englishDefinition: "englishDefinition" in word ? word.englishDefinition : "",
          partOfSpeech: word.partOfSpeech,
          level: word.level,
          phonetics: { us: "usPhonetic" in word ? word.usPhonetic : "", uk: "ukPhonetic" in word ? word.ukPhonetic : "" },
          audio: { us: "usAudioUrl" in word ? word.usAudioUrl : "", uk: "ukAudioUrl" in word ? word.ukAudioUrl : "" },
          pronunciation: { us: Boolean(word.word), uk: Boolean(word.word), fallback: "browser_tts" },
        },
        explanations: cleanList(explanations.map((item) => ({ explanation: item.explanation, sourceKind: item.sourceKind })), 8).length
          ? cleanList(explanations.map((item) => ({ explanation: item.explanation, sourceKind: item.sourceKind })), 8)
          : cleanList(word.meanings.length ? word.meanings : [word.meaning], 8).map((explanation) => ({ explanation, sourceKind: "source" })),
        synonyms: cleanList(synonyms.map((item) => ({ word: item.word, meaning: item.meaning, partOfSpeech: item.partOfSpeech, difference: item.difference, usage: item.usage, sourceKind: item.sourceKind })), 8),
        examples: uniqueExamples((examples.length ? examples : word.example ? [{ english: word.example, chinese: word.exampleZh, level: "一般", sourceKind: "source" }] : fallbackExamples(word)).map((item) => ({ english: item.english, chinese: item.chinese, level: item.level, sourceKind: item.sourceKind })), 6),
        phrases: cleanList((phrases.length ? phrases : word.phrases.map((item) => ({ phrase: item.en, meaning: item.zh, sourceKind: "source" }))).map((item) => ({ phrase: item.phrase, meaning: item.meaning, sourceKind: item.sourceKind })), 10),
        forms: cleanList(forms.map((item) => ({ form: item.form, partOfSpeech: item.partOfSpeech, meaning: item.meaning, sourceKind: item.sourceKind })), 12),
        aiContent: ai[0] ? { content: ai[0].content, model: ai[0].model, generatedAt: ai[0].generatedAt } : null,
        progress: {
          state: progressState(currentProgress),
          familiarity: currentProgress?.familiarity ?? 0,
          correctCount: currentProgress?.correctCount ?? 0,
          wrongCount: currentProgress?.wrongCount ?? 0,
          nextReviewAt: currentProgress?.nextReviewAt ?? null,
          memoryTip: currentProgress?.memoryTip ?? "",
        },
      };
    },
  }),
  route({
    method: "POST",
    path: "/words/:id/ai-content",
    auth: "user",
    rate: { limit: 12, windowSec: 3600, key: "word-ai-content" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const word = await getWord(ctx.params.id);
      const cached = (await db.select().from(wordAiContents).where(eq(wordAiContents.wordId, word.id)).limit(1))[0];
      if (cached) return { content: cached.content, model: cached.model, generatedAt: cached.generatedAt, cached: true };
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      await consumeFeature(user.userId, "ai_context");
      const { data, meta } = await runAiJson<z.infer<typeof aiContentSchema>>(
        {
          feature: "word_detail",
          userId: user.userId,
          system: "你是台灣國高中英文單字老師。只提供可驗證、符合該單字詞義與詞性的教學內容。不要硬拆不可靠的字根；沒有可靠資料就輸出空字串。不要把 AI 內容假裝成教材來源。回傳 JSON，欄位：explanations:string[]、synonyms:{word,meaning,partOfSpeech,difference,usage}[]、examples:{english,chinese,level}[]、phrases:{phrase,meaning}[]、forms:{form,partOfSpeech,meaning}[]、mistakes:{wrong,correct,reason}[]、memoryTip:string、etymology:string。例句 2-3 句，難度可用 基礎／會考／進階。",
          parts: [{ kind: "text", text: `單字：${word.word}\n詞性：${word.partOfSpeech}\n中文：${word.meaning}\n
英文定義：${"englishDefinition" in word ? word.englishDefinition : ""}
\n既有例句：${word.example}\n既有片語：${JSON.stringify(word.phrases)}` }],
          maxOutputTokens: 2400,
          temperature: 0.2,
        },
        { explanations: [], synonyms: [], examples: [], phrases: [], forms: [], mistakes: [], memoryTip: "", etymology: "" },
      );
      const parsed = aiContentSchema.safeParse(data);
      if (!parsed.success) throw fail("AI_EMPTY_RESULT");
      const content = parsed.data;
      const inserted = await db.insert(wordAiContents).values({ wordId: word.id, content, model: meta.model }).onConflictDoUpdate({
        target: wordAiContents.wordId,
        set: { content, model: meta.model, updatedAt: new Date() },
      }).returning();
      return { content, model: inserted[0]?.model ?? meta.model, generatedAt: inserted[0]?.updatedAt ?? new Date(), cached: false };
    },
  }),
  route({
    method: "PATCH",
    path: "/words/:id/progress",
    auth: "user",
    rate: { limit: 60, windowSec: 3600, key: "word-progress" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ action: z.enum(["mastered", "review", "mistake", "reset"]) }));
      const word = await getWord(ctx.params.id);
      const current = (await db.select().from(wordProgress).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id))).limit(1))[0];
      await db.insert(wordProgress).values({ userId: user.userId, wordId: word.id }).onConflictDoNothing();
      if (body.action === "mastered") {
        await db.update(wordProgress).set({ familiarity: 100, wrongCount: 0, nextReviewAt: new Date(Date.now() + 30 * 86_400_000), updatedAt: new Date() }).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)));
      } else if (body.action === "review") {
        await db.update(wordProgress).set({ familiarity: Math.min(79, Math.max(20, current?.familiarity ?? 20)), nextReviewAt: new Date(), updatedAt: new Date() }).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)));
      } else if (body.action === "mistake") {
        await db.update(wordProgress).set({ familiarity: Math.max(0, (current?.familiarity ?? 0) - 10), wrongCount: (current?.wrongCount ?? 0) + 1, nextReviewAt: new Date(), updatedAt: new Date() }).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)));
        const fp = fingerprint("英文單字", word.word, word.meaning);
        const createdQuestion = await db.insert(questions).values({ ownerId: user.userId, origin: "word_detail", subject: "英文單字", topic: "單字詳細資訊錯題", level: word.level, difficulty: "normal", type: "short", stem: `請寫出「${word.meaning}」的英文。`, options: [], answer: [word.word], explanation: `${word.word}：${word.meaning}`, fingerprint: fp }).onConflictDoNothing().returning({ id: questions.id });
        const question = createdQuestion[0] ?? (await db.select({ id: questions.id }).from(questions).where(eq(questions.fingerprint, fp)).limit(1))[0];
        if (question) await db.insert(wrongQuestions).values({ userId: user.userId, questionId: question.id, subject: "英文單字", reason: "使用者從單字詳細資訊加入錯題" }).onConflictDoUpdate({ target: [wrongQuestions.userId, wrongQuestions.questionId], set: { wrongCount: 1, resolvedAt: null, nextReviewAt: new Date(), reason: "使用者從單字詳細資訊加入錯題" } });
      } else {
        await db.update(wordProgress).set({ familiarity: 0, correctCount: 0, wrongCount: 0, nextReviewAt: new Date(), memoryTip: "", updatedAt: new Date() }).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id)));
      }
      const updated = (await db.select().from(wordProgress).where(and(eq(wordProgress.userId, user.userId), eq(wordProgress.wordId, word.id))).limit(1))[0];
      return { progress: { state: progressState(updated), familiarity: updated?.familiarity ?? 0, correctCount: updated?.correctCount ?? 0, wrongCount: updated?.wrongCount ?? 0, nextReviewAt: updated?.nextReviewAt ?? null, memoryTip: updated?.memoryTip ?? "" } };
    },
  }),
];
