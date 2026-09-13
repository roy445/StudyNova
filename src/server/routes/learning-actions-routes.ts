import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { answers, gradeRecords, learningPackages, notes, questions, quizAttempts, reviewItems, studyMaterials, userVocabularies, wrongQuestions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, fingerprint, notFound } from "../core";
import { aiConfigured, runAiJson } from "../ai";
import { generateQuestions } from "./quiz-routes";

const whySchema = z.object({ reason: z.string().max(1000), nextStep: z.string().max(1000), focus: z.string().max(240), practicePrompt: z.string().max(1000) });
const onePageSchema = z.object({ title: z.string().max(120).default("考前一頁紙"), examMode: z.string().max(40).default("general"), examId: z.string().uuid().nullable().optional() });

async function loadWrong(userId: string, id: string) {
  const row = (await db.select({ wrong: wrongQuestions, question: questions }).from(wrongQuestions).innerJoin(questions, eq(questions.id, wrongQuestions.questionId)).where(and(eq(wrongQuestions.id, id), eq(wrongQuestions.userId, userId))).limit(1))[0];
  if (!row) throw notFound("找不到錯題");
  const answer = (await db.select({ response: answers.response, updatedAt: answers.updatedAt }).from(answers).innerJoin(quizAttempts, eq(quizAttempts.id, answers.attemptId)).where(and(eq(answers.questionId, row.question.id), eq(quizAttempts.userId, userId))).orderBy(desc(answers.updatedAt)).limit(1))[0];
  return { ...row, response: answer?.response ?? [] };
}

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/wrong/:id/why",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const data = await loadWrong(user.userId, ctx.params.id);
      const result = await runAiJson<z.infer<typeof whySchema>>({ feature: "wrong_question_analysis", userId: user.userId, system: "你是台灣國高中學習教練。請分析學生這一次為什麼錯，不要只重述正解；必須根據題目、正解、學生答案、題型、既有錯誤紀錄給出可驗證的可能原因。若證據不足要明確說明，不可捏造。回傳 JSON：{reason,nextStep,focus,practicePrompt}，繁體中文。", parts: [{ kind: "text", text: `題目：${data.question.stem}\n題型：${data.question.type}\n選項：${JSON.stringify(data.question.options)}\n正確答案：${JSON.stringify(data.question.answer)}\n學生答案：${JSON.stringify(data.response)}\n既有錯誤次數：${data.wrong.wrongCount}\n既有原因：${data.wrong.reason || "尚未分析"}\n原解析：${data.question.explanation}` }], maxOutputTokens: 900 }, { reason: "目前證據不足以判定單一原因。", nextStep: "先對照正解與題幹，標記自己卡住的步驟。", focus: "回看題幹關鍵資訊", practicePrompt: "再做一題相同概念的題目。" });
      const parsed = whySchema.safeParse(result.data);
      if (!parsed.success) throw fail("AI_EMPTY_RESULT");
      await db.update(wrongQuestions).set({ reason: parsed.data.reason, aiTip: `${parsed.data.nextStep}\n\n針對性練習：${parsed.data.practicePrompt}` }).where(eq(wrongQuestions.id, data.wrong.id));
      return { analysis: parsed.data, evidence: { questionId: data.question.id, response: data.response, wrongCount: data.wrong.wrongCount } };
    },
  }),
  route({
    method: "POST",
    path: "/wrong/:id/practice",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const data = await loadWrong(user.userId, ctx.params.id);
      const generatedIds = await generateQuestions({ userId: user.userId, subject: data.wrong.subject, topic: data.question.topic || data.question.chapter || "錯題概念", sourceText: `原題：${data.question.stem}\n正解：${data.question.answer.join("、")}\n解析：${data.question.explanation}\n錯誤原因：${data.wrong.reason}`, count: 1, difficulty: "targeted", type: data.question.type, level: data.question.level });
      const generatedId = generatedIds[0];
      if (!generatedId) throw fail("AI_EMPTY_RESULT");
      const generated = (await db.select().from(questions).where(eq(questions.id, generatedId)).limit(1))[0];
      if (!generated) throw fail("AI_EMPTY_RESULT");
      await db.update(questions).set({ targetBank: "personal", bankCategory: "wrong-practice", sourceLabel: `針對錯題 ${data.wrong.id}`, sourceType: "wrong_pattern", status: "published", metadata: { ...generated.metadata, sourceWrongQuestionId: data.wrong.id, generatedAt: new Date().toISOString() } }).where(eq(questions.id, generated.id));
      return { question: generated, sourceWrongQuestionId: data.wrong.id };
    },
  }),
  route({
    method: "POST",
    path: "/learning-packages",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ materialId: z.string().uuid(), steps: z.array(z.enum(["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"])).min(1).max(6) }));
      const material = (await db.select().from(studyMaterials).where(and(eq(studyMaterials.id, body.materialId), eq(studyMaterials.userId, user.userId))).limit(1))[0];
      if (!material) throw notFound("找不到教材或你沒有權限使用");
      const row = (await db.insert(learningPackages).values({ userId: user.userId, materialId: material.id, selectedSteps: body.steps, status: "queued", progress: 0 }).returning())[0];
      return { package: row };
    },
  }),
  route({
    method: "GET",
    path: "/learning-packages/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const row = (await db.select().from(learningPackages).where(and(eq(learningPackages.id, ctx.params.id), eq(learningPackages.userId, user.userId))).limit(1))[0];
      if (!row) throw notFound("找不到學習包");
      return { package: row };
    },
  }),
  route({
    method: "POST",
    path: "/learning-packages/:id/run",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ step: z.enum(["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"]) }));
      const pkg = (await db.select().from(learningPackages).where(and(eq(learningPackages.id, ctx.params.id), eq(learningPackages.userId, user.userId))).limit(1))[0];
      if (!pkg) throw notFound("找不到學習包");
      const material = (await db.select().from(studyMaterials).where(and(eq(studyMaterials.id, pkg.materialId), eq(studyMaterials.userId, user.userId))).limit(1))[0];
      if (!material) throw notFound("找不到教材");
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const steps = pkg.selectedSteps as string[];
      if (!steps.includes(body.step)) throw fail("REQ_VALIDATION", { message: "這個步驟未被使用者勾選" });
      await db.update(learningPackages).set({ status: "processing", currentStep: body.step, progress: Math.max(1, Math.round((steps.indexOf(body.step) / steps.length) * 100)), updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id));
      try {
        const generated = await runAiJson<{ summary?: string; keyPoints?: string[]; vocabulary?: Array<{ word: string; meaning: string; partOfSpeech?: string; example?: string; exampleZh?: string }>; questions?: Array<{ stem: string; options: string[]; answer: string[]; explanation: string; type?: string }> }>({ feature: "learning_package", userId: user.userId, system: "你是 StudyNova 教材整理引擎。只能根據提供教材產生內容，不可杜撰。回傳 JSON，欄位 summary、keyPoints、vocabulary、questions；題目必須能由教材作答，單字必須確實出現在教材或摘要中。", parts: [{ kind: "text", text: `教材標題：${material.title}\n科目：${material.subject}\n內容：\n${material.content.slice(0, 16000)}` }], maxOutputTokens: 3500 }, { summary: "", keyPoints: [], vocabulary: [], questions: [] });
        const result = generated.data;
        const results = { ...pkg.results, [body.step]: { completedAt: new Date().toISOString() } } as Record<string, unknown>;
        if (body.step === "notes" || body.step === "key_points") {
          const text = body.step === "notes" ? (result.summary || result.keyPoints?.join("\n") || "") : (result.keyPoints ?? []).map((item) => `- ${item}`).join("\n");
          const saved = await db.insert(notes).values({ userId: user.userId, title: `${material.title}・${body.step === "notes" ? "AI 筆記" : "重點"}`, subject: material.subject, body: text, tags: ["learning-package", body.step], source: "ai", materialId: material.id }).returning({ id: notes.id });
          results[body.step] = { ...results[body.step] as object, noteId: saved[0]?.id };
        } else if (body.step === "vocabulary" || body.step === "flashcards") {
          const savedIds: string[] = [];
          for (const item of (result.vocabulary ?? []).slice(0, 30)) {
            const saved = await db.insert(userVocabularies).values({ userId: user.userId, word: item.word, normalizedWord: item.word.trim().toLowerCase(), meaning: item.meaning, partOfSpeech: item.partOfSpeech ?? "", example: item.example ?? "", exampleZh: item.exampleZh ?? "", sourceDocumentId: null }).onConflictDoUpdate({ target: [userVocabularies.userId, userVocabularies.normalizedWord], set: { meaning: item.meaning, partOfSpeech: item.partOfSpeech ?? "", example: item.example ?? "", exampleZh: item.exampleZh ?? "", updatedAt: new Date() } }).returning({ id: userVocabularies.id });
            if (saved[0]) savedIds.push(saved[0].id);
          }
          results[body.step] = { ...results[body.step] as object, vocabularyIds: savedIds };
        } else if (body.step === "quiz") {
          const ids: string[] = [];
          for (const item of (result.questions ?? []).slice(0, 20)) {
            const saved = await db.insert(questions).values({ ownerId: user.userId, origin: "ai", targetBank: "personal", bankCategory: "learning-package", sourceLabel: material.title, subject: material.subject, topic: material.title, sourceType: "learning_package", status: "published", level: "custom", difficulty: "normal", type: item.type ?? "single", stem: item.stem, options: item.options ?? [], answer: item.answer ?? [], explanation: item.explanation ?? "", metadata: { materialId: material.id, packageId: pkg.id }, fingerprint: fingerprint("learning-package", material.id, item.stem) }).onConflictDoNothing().returning({ id: questions.id });
            if (saved[0]) ids.push(saved[0].id);
          }
          results[body.step] = { ...results[body.step] as object, questionIds: ids };
        } else if (body.step === "review") {
          const vocabularyIds = ((results.vocabulary as { vocabularyIds?: string[] } | undefined)?.vocabularyIds ?? []);
          for (const contentId of vocabularyIds) await db.insert(reviewItems).values({ userId: user.userId, contentType: "vocabulary", contentId, metadata: { packageId: pkg.id, materialId: material.id } }).onConflictDoNothing();
          results[body.step] = { ...results[body.step] as object, queued: vocabularyIds.length };
        }
        const completed = steps.every((step) => step === body.step || Boolean((results[step] as Record<string, unknown> | undefined)?.completedAt));
        const updated = (await db.update(learningPackages).set({ status: completed ? "completed" : "partial", progress: completed ? 100 : Math.min(99, Math.round((Object.keys(results).length / steps.length) * 100)), currentStep: "", results, errors: { ...(pkg.errors as Record<string, string>), [body.step]: "" }, completedAt: completed ? new Date() : null, updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id)).returning())[0];
        return { package: updated };
      } catch (error) {
        const message = error instanceof Error ? error.message : "處理失敗";
        const updated = (await db.update(learningPackages).set({ status: "partial", currentStep: "", errors: { ...(pkg.errors as Record<string, string>), [body.step]: message }, updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id)).returning())[0];
        return { package: updated, stepFailed: body.step };
      }
    },
  }),
  route({
    method: "POST",
    path: "/learning/one-page",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const body = await ctx.json(onePageSchema);
      const [wrong, vocab, materialRows, recentGrades] = await Promise.all([
        db.select({ subject: wrongQuestions.subject, reason: wrongQuestions.reason, wrongCount: wrongQuestions.wrongCount, tip: wrongQuestions.aiTip, stem: questions.stem }).from(wrongQuestions).innerJoin(questions, eq(questions.id, wrongQuestions.questionId)).where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt))).orderBy(desc(wrongQuestions.wrongCount)).limit(20),
        db.select({ word: userVocabularies.word, meaning: userVocabularies.meaning, familiarity: userVocabularies.familiarity }).from(userVocabularies).where(eq(userVocabularies.userId, user.userId)).orderBy(userVocabularies.familiarity).limit(20),
        db.select({ title: studyMaterials.title, subject: studyMaterials.subject, summary: studyMaterials.summary }).from(studyMaterials).where(eq(studyMaterials.userId, user.userId)).orderBy(desc(studyMaterials.updatedAt)).limit(10),
        db.select({ subject: gradeRecords.subject, examName: gradeRecords.examName, percentage: gradeRecords.percentage }).from(gradeRecords).where(eq(gradeRecords.userId, user.userId)).orderBy(desc(gradeRecords.examDate)).limit(20),
      ]);
      const result = await runAiJson<{ sections: Array<{ subject: string; bullets: string[] }> }>({ feature: "exam_one_page", userId: user.userId, system: "你是台灣國高中考前整理老師。只能根據提供的學生資料整理，不可補造不存在的公式、單字或弱點。請挑出最值得看的少量內容，回傳 JSON：{sections:[{subject,bullets:string[]}]}", parts: [{ kind: "text", text: `考試模式：${body.examMode}\n使用者錯題：${JSON.stringify(wrong)}\n單字：${JSON.stringify(vocab)}\n教材：${JSON.stringify(materialRows)}\n成績：${JSON.stringify(recentGrades)}` }], maxOutputTokens: 1600 }, { sections: [] });
      const sections = Array.isArray(result.data.sections) ? result.data.sections.slice(0, 8).map((s) => ({ subject: String(s.subject), bullets: Array.isArray(s.bullets) ? s.bullets.map(String).slice(0, 8) : [] })) : [];
      const bodyText = sections.map((s) => `## ${s.subject}\n${s.bullets.map((b) => `- ${b}`).join("\n")}`).join("\n\n");
      const saved = await db.insert(notes).values({ userId: user.userId, title: body.title, subject: "考前整理", body: bodyText, tags: ["考前一頁紙", body.examMode], template: "考前一頁紙", source: "ai" }).returning();
      return { note: saved[0], sections, evidence: { wrong: wrong.length, vocabulary: vocab.length, materials: materialRows.length, grades: recentGrades.length } };
    },
  }),
];
