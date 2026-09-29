import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { answers, gradeRecords, learningPackages, notes, questions, quizAttempts, reviewItems, studyMaterials, userVocabularies, wrongQuestions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, fingerprint, notFound, safeErrorMessage } from "../core";
import { aiConfigured, runAiJson } from "../ai";
import { normalizePackageOutput, packageProgress, type PackageOutput } from "../learning-package-utils";
import { generateQuestions } from "./quiz-routes";

const whySchema = z.object({ reason: z.string().max(1000), nextStep: z.string().max(1000), focus: z.string().max(240), practicePrompt: z.string().max(1000) });
const onePageSchema = z.object({ title: z.string().max(120).default("考前一頁紙"), examMode: z.string().max(40).default("general"), examId: z.string().uuid().nullable().optional() });
const packageStepSchema = z.enum(["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"]);

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
    rate: { limit: 10, windowSec: 3600, key: "learning-package-create" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ materialId: z.string().uuid(), steps: z.array(z.enum(["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"])).min(1).max(6) }));
      const material = (await db.select().from(studyMaterials).where(and(eq(studyMaterials.id, body.materialId), eq(studyMaterials.userId, user.userId))).limit(1))[0];
      if (!material) throw notFound("找不到教材或你沒有權限使用");
      if (!material.content.trim()) throw fail("AI_EMPTY_RESULT", { message: "教材沒有可供整理的文字，請重新上傳或貼上課文內容。" });
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
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
      if (row.status === "processing" && Date.now() - row.updatedAt.getTime() > 10 * 60_000) {
        const errors = { ...((row.errors ?? {}) as Record<string, string>) };
        const results = (row.results ?? {}) as Record<string, unknown>;
        const failedStep = row.currentStep || (row.selectedSteps as string[]).find((step) => !(results[step] as Record<string, unknown> | undefined)?.completedAt) || "_worker";
        errors[failedStep] = "上次生成工作超過 10 分鐘沒有更新，已停止等待；請重試這個步驟。";
        const recovered = (await db.update(learningPackages).set({ status: "partial", currentStep: "", errors, updatedAt: new Date() }).where(and(eq(learningPackages.id, row.id), eq(learningPackages.status, "processing"), eq(learningPackages.updatedAt, row.updatedAt))).returning())[0];
        if (recovered) return { package: recovered };
        const latest = (await db.select().from(learningPackages).where(eq(learningPackages.id, row.id)).limit(1))[0];
        return { package: latest ?? row };
      }
      return { package: row };
    },
  }),
  route({
    method: "POST",
    path: "/learning-packages/:id/run",
    auth: "user",
    rate: { limit: 30, windowSec: 3600, key: "learning-package-run" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ step: packageStepSchema.optional(), all: z.boolean().optional() }).refine((value) => Boolean(value.step) || value.all === true, "請指定要重試的步驟或執行整份學習包"));
      const pkg = (await db.select().from(learningPackages).where(and(eq(learningPackages.id, ctx.params.id), eq(learningPackages.userId, user.userId))).limit(1))[0];
      if (!pkg) throw notFound("找不到學習包");
      const material = (await db.select().from(studyMaterials).where(and(eq(studyMaterials.id, pkg.materialId), eq(studyMaterials.userId, user.userId))).limit(1))[0];
      if (!material) throw notFound("找不到教材");
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const steps = pkg.selectedSteps as string[];
      if (body.step && !steps.includes(body.step)) throw fail("REQ_VALIDATION", { message: "這個步驟未被使用者勾選" });
      if (!material.content.trim()) throw fail("AI_EMPTY_RESULT", { message: "教材沒有可供整理的文字，請重新上傳或貼上課文內容。" });
      const results = { ...((pkg.results ?? {}) as Record<string, unknown>) };
      const requestedTargets = body.all ? ["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"].filter((step) => steps.includes(step)) : [body.step!];
      const targets = requestedTargets.filter((step) => !(results[step] as Record<string, unknown> | undefined)?.completedAt);
      if (!targets.length) return { package: pkg };
      const pending = targets;
      const initialProgress = packageProgress(steps, results);
      const activeStep = pending[0];
      if (pkg.status === "processing" && Date.now() - pkg.updatedAt.getTime() <= 10 * 60_000) return { package: pkg };
      const started = await db.update(learningPackages).set({ status: "processing", currentStep: activeStep, progress: initialProgress, updatedAt: new Date() }).where(and(eq(learningPackages.id, pkg.id), eq(learningPackages.status, pkg.status), eq(learningPackages.updatedAt, pkg.updatedAt))).returning({ id: learningPackages.id });
      if (!started[0]) {
        const latest = (await db.select().from(learningPackages).where(eq(learningPackages.id, pkg.id)).limit(1))[0];
        return { package: latest ?? pkg };
      }
      let currentStep = activeStep;
      const errors = { ...((pkg.errors ?? {}) as Record<string, string>) };
      delete errors._request;
      try {
        const generated = await runAiJson<PackageOutput>({ feature: "learning_package", userId: user.userId, system: "你是 StudyNova 教材整理引擎。只能根據提供教材產生內容，不可杜撰。只回傳 JSON，欄位固定為 summary、keyPoints、vocabulary、questions。為避免輸出截斷：summary 不超過 250 字、keyPoints 最多 8 項、vocabulary 最多 12 項、questions 最多 5 題；每項內容精簡但可直接使用。題目必須能由教材作答，單字必須確實出現在教材或摘要中。若某類內容無法從教材找到，請回傳空陣列，不可猜測。", parts: [{ kind: "text", text: `教材標題：${material.title}\n科目：${material.subject}\n內容：\n${material.content.slice(0, 16000)}` }], maxOutputTokens: 3500, timeoutMs: 45_000 }, { summary: "", keyPoints: [], vocabulary: [], questions: [] });
        const result = normalizePackageOutput(generated.data);
        for (let index = 0; index < pending.length; index += 1) {
          const step = pending[index];
          currentStep = step;
          await db.update(learningPackages).set({ status: "processing", currentStep: step, progress: packageProgress(steps, results), updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id));
          let stepResult: Record<string, unknown> = {};
          if (step === "notes" || step === "key_points") {
            const text = step === "notes" ? (result.summary || result.keyPoints.join("\n")) : result.keyPoints.map((item) => `- ${item}`).join("\n");
            if (!text.trim()) throw new Error(step === "notes" ? "AI 沒有產生筆記內容，請確認課文文字完整後重試。" : "AI 沒有產生重點內容，請確認課文文字完整後重試。");
            const saved = await db.insert(notes).values({ userId: user.userId, title: `${material.title}・${step === "notes" ? "AI 筆記" : "重點"}`, subject: material.subject, body: text, tags: ["learning-package", step], source: "ai", materialId: material.id }).returning({ id: notes.id });
            stepResult = { noteId: saved[0]?.id };
          } else if (step === "vocabulary" || step === "flashcards") {
            if (!result.vocabulary.length) throw new Error("AI 沒有從課文辨識出可建立的單字，請確認教材內容或改選其他學習包項目。");
            const savedIds: string[] = [];
            for (const item of result.vocabulary) {
              const saved = await db.insert(userVocabularies).values({ userId: user.userId, word: item.word, normalizedWord: item.word.trim().toLowerCase(), meaning: item.meaning, partOfSpeech: item.partOfSpeech, example: item.example, exampleZh: item.exampleZh, sourceDocumentId: null }).onConflictDoUpdate({ target: [userVocabularies.userId, userVocabularies.normalizedWord], set: { meaning: item.meaning, partOfSpeech: item.partOfSpeech, example: item.example, exampleZh: item.exampleZh, updatedAt: new Date() } }).returning({ id: userVocabularies.id });
              if (saved[0]) savedIds.push(saved[0].id);
            }
            stepResult = { vocabularyIds: savedIds };
          } else if (step === "quiz") {
            if (!result.questions.length) throw new Error("AI 沒有產生可作答的題目，請確認教材文字完整後重試。");
            const ids: string[] = [];
            for (const item of result.questions) {
              const fp = fingerprint("learning-package", material.id, item.stem);
              const saved = await db.insert(questions).values({ ownerId: user.userId, origin: "ai", targetBank: "personal", bankCategory: "learning-package", sourceLabel: material.title, subject: material.subject, topic: material.title, sourceType: "learning_package", status: "published", level: "custom", difficulty: "normal", type: item.type ?? "single", stem: item.stem, options: item.options, answer: item.answer, explanation: item.explanation, metadata: { materialId: material.id, packageId: pkg.id }, fingerprint: fp }).onConflictDoNothing().returning({ id: questions.id });
              const existing = saved[0] ?? (await db.select({ id: questions.id }).from(questions).where(eq(questions.fingerprint, fp)).limit(1))[0];
              if (existing) ids.push(existing.id);
            }
            stepResult = { questionIds: ids };
          } else {
            let vocabularyIds = ((results.vocabulary as { vocabularyIds?: string[] } | undefined)?.vocabularyIds ?? (results.flashcards as { vocabularyIds?: string[] } | undefined)?.vocabularyIds ?? []);
            if (!vocabularyIds.length && result.vocabulary.length) {
              const addedIds: string[] = [];
              for (const item of result.vocabulary) {
                const word = item.word.trim();
                if (!word) continue;
                const normalizedWord = word.toLowerCase();
                const saved = await db.insert(userVocabularies).values({ userId: user.userId, word, normalizedWord, meaning: item.meaning, partOfSpeech: item.partOfSpeech, example: item.example, exampleZh: item.exampleZh, sourceDocumentId: null }).onConflictDoUpdate({ target: [userVocabularies.userId, userVocabularies.normalizedWord], set: { meaning: item.meaning, partOfSpeech: item.partOfSpeech, example: item.example, exampleZh: item.exampleZh, updatedAt: new Date() } }).returning({ id: userVocabularies.id });
                if (saved[0]?.id) addedIds.push(saved[0].id);
              }
              vocabularyIds = addedIds;
              if (addedIds.length) results.vocabulary = { vocabularyIds: addedIds };
            }
            if (!vocabularyIds.length) throw new Error("建立複習內容前，請先完成「建立單字卡」或「建立記憶卡」。");
            for (const contentId of vocabularyIds) await db.insert(reviewItems).values({ userId: user.userId, contentType: "vocabulary", contentId, metadata: { packageId: pkg.id, materialId: material.id } }).onConflictDoNothing();
            stepResult = { queued: vocabularyIds.length };
          }
          results[step] = { ...(results[step] as Record<string, unknown> | undefined), ...stepResult, completedAt: new Date().toISOString() };
          delete errors[step];
          const done = steps.every((item) => Boolean((results[item] as Record<string, unknown> | undefined)?.completedAt));
          await db.update(learningPackages).set({ status: done ? "completed" : "processing", progress: packageProgress(steps, results), currentStep: done ? "" : pending[index + 1] ?? step, results, errors, completedAt: done ? new Date() : null, updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id));
        }
        const completed = steps.every((step) => Boolean((results[step] as Record<string, unknown> | undefined)?.completedAt));
        const updated = (await db.update(learningPackages).set({ status: completed ? "completed" : "partial", progress: packageProgress(steps, results), currentStep: "", results, errors, completedAt: completed ? new Date() : null, updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id)).returning())[0];
        return { package: updated };
      } catch (error) {
        const message = safeErrorMessage(error);
        for (const step of pending.slice(pending.indexOf(currentStep))) errors[step] = message;
        const doneCount = steps.filter((step) => Boolean((results[step] as Record<string, unknown> | undefined)?.completedAt)).length;
        const updated = (await db.update(learningPackages).set({ status: doneCount ? "partial" : "failed", progress: packageProgress(steps, results), currentStep: "", results, errors, completedAt: null, updatedAt: new Date() }).where(eq(learningPackages.id, pkg.id)).returning())[0];
        return { package: updated, stepFailed: currentStep };
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
