import { and, asc, desc, eq, inArray, isNull, lte, or, gt } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";
import { announcements, examHubAttempts, examHubs, examHubWordProgress, examHubWords, userSettings, questionBanks, questionBankMemberships, questionSources, questions, studyMaterials, studyMaterialPages, examHubMaterialImports, examQuestionGenerationJobs, examQuestionGenerationItems, examHubUsageLogs, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { createAiBackgroundJob } from "../ai-background";
import { queue } from "../queue";
import { putObject, readObject } from "../storage";
import { extractText } from "./content-routes";
import { extractPdfQuestionChunks, parseNumberedChoiceQuestionText, renderPdfImagePages } from "../pdf-question-extract";
import { runAiJson } from "../ai";
import { recordQuestionAnswer, recordQuestionAppearance } from "../question-stats";

function openWindow() {
  const now = new Date();
  return and(eq(examHubs.status, "published"), or(isNull(examHubs.openAt), lte(examHubs.openAt, now)), or(isNull(examHubs.closeAt), gt(examHubs.closeAt, now)));
}
const wordInput = z.object({ word: z.string().trim().min(1).max(200), meaning: z.string().max(1000).default(""), partOfSpeech: z.string().max(80).default(""), synonyms: z.array(z.string().max(100)).max(30).default([]), antonyms: z.array(z.string().max(100)).max(30).default([]), collocations: z.array(z.string().max(200)).max(30).default([]), phrases: z.array(z.string().max(200)).max(30).default([]), example: z.string().max(1000).default(""), exampleZh: z.string().max(1000).default(""), phonetic: z.string().max(160).default(""), audioUrl: z.string().max(500).default(""), published: z.boolean().default(true) });
const generationRequirements = z.object({ educationLevel: z.enum(["junior", "senior"]), schoolName: z.string().max(120).default(""), grade: z.number().int().min(1).max(3), subject: z.string().min(1).max(30), examNumber: z.string().min(1).max(40), chapters: z.array(z.string().max(120)).max(50).default([]), units: z.array(z.string().max(120)).max(50).default([]), vocabularyRange: z.array(z.string().max(120)).max(500).default([]), questionTypes: z.array(z.string().max(40)).min(1).max(10), difficulty: z.string().min(1).max(30) });
const sourcePolicy = z.object({ useGlobalBank: z.boolean().default(true), useMaterials: z.boolean().default(false), useExisting: z.boolean().default(true), generateNew: z.boolean().default(true), materialIds: z.array(z.string().uuid()).max(30).default([]), questionIds: z.array(z.string().uuid()).max(100).default([]) });

function questionFingerprint(draft: Record<string, unknown>) {
  return createHash("sha256").update(`${String(draft.subject ?? "")}\n${String(draft.type ?? "")}\n${String(draft.stem ?? "")}`.trim().toLocaleLowerCase()).digest("hex");
}

async function enqueueAiBackground(jobId: string) {
  await queue().enqueue({ name: "ai_background_batch", payload: { jobId }, uniqueKey: `ai-background:${jobId}:wake:${Date.now()}` });
  void queue().drain(1);
}

async function matchingUserHubs(userId: string) {
  const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  if (!settings) return { settings: null, hubs: [] };
  const hubs = await db.select().from(examHubs).where(and(openWindow(), eq(examHubs.educationLevel, settings.schoolLevel), eq(examHubs.grade, settings.grade), or(eq(examHubs.schoolName, ""), eq(examHubs.schoolName, settings.schoolName)))).orderBy(asc(examHubs.openAt), desc(examHubs.createdAt));
  return { settings, hubs };
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/exam-hubs/available", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const result = await matchingUserHubs(user.userId);
    return { hubs: result.hubs, profileComplete: Boolean(result.settings?.schoolLevel && result.settings.schoolName && result.settings.grade), needsProfile: !result.settings?.schoolName };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/timed-start", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id);
    if (!hub || !hub.questionBankId) throw notFound("找不到目前開放的限時段考題庫");
    const sessionId = randomUUID();
    const row = (await db.insert(examHubUsageLogs).values({ hubId: hub.id, userId: user.userId, action: "started", sessionId, startedAt: new Date(), metadata: { mode: "timed_questions" } }).returning())[0];
    const questionRows = await db.select({ id: questions.id }).from(questionBankMemberships).where(eq(questionBankMemberships.bankId, hub.questionBankId));
    for (const question of questionRows) await recordQuestionAppearance(question.id);
    return { sessionId, startedAt: row.startedAt, hubId: hub.id, timeLimitSeconds: Math.max(300, Number((hub.formalScope as Record<string, unknown>)?.timeLimitSeconds ?? 1800)) };
  }}),
  route({ method: "GET", path: "/exam-hubs/:id", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const result = await matchingUserHubs(user.userId); const hub = result.hubs.find((item) => item.id === ctx.params.id);
    if (!hub) throw notFound("找不到目前開放的段考專區");
    const words = await db.select().from(examHubWords).where(and(eq(examHubWords.hubId, hub.id), eq(examHubWords.published, true))).orderBy(asc(examHubWords.word));
    const progress = words.length ? await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.userId, user.userId), inArray(examHubWordProgress.hubWordId, words.map((word) => word.id)))) : [];
    const progressMap = new Map(progress.map((item) => [item.hubWordId, item]));
    return { hub, words: words.map((word) => ({ ...word, progress: progressMap.get(word.id) ?? { familiarity: 0, wrongCount: 0, reviewCount: 0, lastReviewedAt: null } })) };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/word-progress", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ wordId: z.string().uuid(), result: z.enum(["known", "unknown", "later"]) }));
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id); if (!hub) throw notFound("找不到段考專區");
    const current = (await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.hubWordId, body.wordId), eq(examHubWordProgress.userId, user.userId))).limit(1))[0];
    const delta = body.result === "known" ? 20 : body.result === "unknown" ? -10 : 0;
    const values = { hubWordId: body.wordId, userId: user.userId, familiarity: Math.max(0, Math.min(100, (current?.familiarity ?? 0) + delta)), wrongCount: (current?.wrongCount ?? 0) + (body.result === "unknown" ? 1 : 0), reviewCount: (current?.reviewCount ?? 0) + 1, lastReviewedAt: new Date(), updatedAt: new Date() };
    const row = current ? (await db.update(examHubWordProgress).set(values).where(eq(examHubWordProgress.id, current.id)).returning())[0] : (await db.insert(examHubWordProgress).values(values).returning())[0];
    return { progress: row };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/attempt", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ mode: z.enum(["choice", "fill"]), direction: z.enum(["en2zh", "zh2en"]), responses: z.record(z.string(), z.string()) }));
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id); if (!hub) throw notFound("找不到段考專區");
    const words = await db.select().from(examHubWords).where(and(eq(examHubWords.hubId, hub.id), eq(examHubWords.published, true)));
    const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[，。！？、,.!?]/g, "").replace(/\s+/g, " ");
    let score = 0; const wrongWordIds: string[] = [];
    for (const word of words) { const expected = body.direction === "en2zh" ? word.meaning : word.word; const answer = body.responses[word.id] ?? ""; const correct = body.mode === "choice" ? normalize(answer) === normalize(expected) : normalize(answer) === normalize(expected) || normalize(answer).includes(normalize(expected)); if (correct) score += 1; else wrongWordIds.push(word.id); }
    const attempt = (await db.insert(examHubAttempts).values({ hubId: hub.id, userId: user.userId, mode: body.mode, direction: body.direction, score, total: words.length, responses: body.responses, wrongWordIds }).returning())[0];
    for (const word of words) { const wrong = wrongWordIds.includes(word.id); const current = (await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.hubWordId, word.id), eq(examHubWordProgress.userId, user.userId))).limit(1))[0]; const values = { hubWordId: word.id, userId: user.userId, familiarity: Math.max(0, Math.min(100, (current?.familiarity ?? 0) + (wrong ? -10 : 15))), wrongCount: (current?.wrongCount ?? 0) + (wrong ? 1 : 0), reviewCount: (current?.reviewCount ?? 0) + 1, lastReviewedAt: new Date(), updatedAt: new Date() }; if (current) await db.update(examHubWordProgress).set(values).where(eq(examHubWordProgress.id, current.id)); else await db.insert(examHubWordProgress).values(values); }
    return { attempt, score, total: words.length, wrongWordIds };
  }}),
  route({ method: "GET", path: "/exam-hubs/:id/questions", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id);
    if (!hub || !hub.questionBankId) throw notFound("找不到目前開放的段考題庫");
    const rows = await db.select({ question: questions }).from(questionBankMemberships).innerJoin(questionBanks, eq(questionBankMemberships.bankId, questionBanks.id)).innerJoin(questions, eq(questionBankMemberships.questionId, questions.id)).where(and(eq(questionBankMemberships.bankId, hub.questionBankId), eq(questionBanks.scope, `exam:${hub.id}`), eq(questionBanks.status, "published"), eq(questions.status, "published"))).orderBy(asc(questions.createdAt));
    return { scope: `exam:${hub.id}`, questions: rows.map(({ question }) => ({ id: question.id, subject: question.subject, topic: question.topic, chapter: question.chapter, unit: question.unit, type: question.type, stem: question.stem, options: question.options, points: question.points, estimatedSeconds: question.estimatedSeconds })) };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/timed-attempt", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const body = await ctx.json(z.object({ sessionId: z.string().uuid(), answers: z.record(z.string(), z.string()), durationSeconds: z.number().int().min(0).max(86400) }));
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id);
    if (!hub || !hub.questionBankId) throw notFound("找不到目前開放的限時段考題庫");
    const rows = await db.select({ question: questions }).from(questionBankMemberships).innerJoin(questionBanks, eq(questionBankMemberships.bankId, questionBanks.id)).innerJoin(questions, eq(questionBankMemberships.questionId, questions.id)).where(and(eq(questionBankMemberships.bankId, hub.questionBankId), eq(questionBanks.scope, `exam:${hub.id}`), eq(questionBanks.status, "published"), eq(questions.status, "published"))).orderBy(asc(questions.createdAt));
    let score = 0;
    for (const { question } of rows) {
      const expected = question.answer.map((value) => String(value).trim().toLocaleLowerCase());
      const actual = String(body.answers[question.id] ?? "").trim().toLocaleLowerCase();
      const correct = Boolean(actual && expected.includes(actual));
      if (correct) score += question.points || 1;
      await recordQuestionAnswer(question.id, correct, 0);
    }
    const total = rows.reduce((sum, { question }) => sum + (question.points || 1), 0);
    const completedAt = new Date();
    const session = (await db.select().from(examHubUsageLogs).where(and(eq(examHubUsageLogs.sessionId, body.sessionId), eq(examHubUsageLogs.hubId, hub.id), eq(examHubUsageLogs.userId, user.userId))).limit(1))[0];
    if (session) await db.update(examHubUsageLogs).set({ action: "completed", completedAt, durationSeconds: body.durationSeconds, score, total, metadata: { mode: "timed_questions", answered: Object.keys(body.answers).length } }).where(eq(examHubUsageLogs.id, session.id));
    else await db.insert(examHubUsageLogs).values({ hubId: hub.id, userId: user.userId, action: "completed", sessionId: body.sessionId, startedAt: new Date(completedAt.getTime() - body.durationSeconds * 1000), completedAt, durationSeconds: body.durationSeconds, score, total, metadata: { mode: "timed_questions", answered: Object.keys(body.answers).length } });
    return { score, total, percentage: total ? Math.round((score / total) * 100) : 0, completedAt };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs/:id/usage", auth: "admin", handler: async (ctx) => {
    const rows = await db.select({ id: examHubUsageLogs.id, userId: examHubUsageLogs.userId, displayName: users.displayName, novaId: users.novaId, action: examHubUsageLogs.action, sessionId: examHubUsageLogs.sessionId, startedAt: examHubUsageLogs.startedAt, completedAt: examHubUsageLogs.completedAt, durationSeconds: examHubUsageLogs.durationSeconds, score: examHubUsageLogs.score, total: examHubUsageLogs.total }).from(examHubUsageLogs).innerJoin(users, eq(examHubUsageLogs.userId, users.userId)).where(eq(examHubUsageLogs.hubId, ctx.params.id)).orderBy(desc(examHubUsageLogs.startedAt)).limit(500);
    const completed = rows.filter((row) => row.action === "completed");
    return { summary: { totalSessions: rows.length, completedSessions: completed.length, uniqueUsers: new Set(rows.map((row) => row.userId)).size, averageDurationSeconds: completed.length ? Math.round(completed.reduce((sum, row) => sum + row.durationSeconds, 0) / completed.length) : 0, averageScore: completed.length ? Math.round(completed.reduce((sum, row) => sum + (row.total ? (row.score ?? 0) / row.total * 100 : 0), 0) / completed.length) : 0 }, rows };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs", auth: "admin", handler: async () => ({ hubs: await db.select().from(examHubs).orderBy(desc(examHubs.createdAt)) }) }),
  route({ method: "GET", path: "/admin/exam-hubs/:id/questions", auth: "admin", handler: async (ctx) => {
    const hub = (await db.select({ id: examHubs.id, questionBankId: examHubs.questionBankId }).from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    if (!hub.questionBankId) return { questions: [], questionCount: 0 };
    const rows = await db.select({ question: questions }).from(questionBankMemberships).innerJoin(questions, eq(questionBankMemberships.questionId, questions.id)).where(and(eq(questionBankMemberships.bankId, hub.questionBankId), eq(questions.bankId, hub.questionBankId))).orderBy(asc(questions.createdAt));
    return { questions: rows.map(({ question }) => ({ id: question.id, type: question.type, stem: question.stem, options: question.options, answer: question.answer, explanation: question.explanation, status: question.status, sourceLabel: question.sourceLabel, metadata: question.metadata })), questionCount: rows.length };
  }}),
  route({ method: "POST", path: "/admin/exam-hubs", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const body = await ctx.json(z.object({ name: z.string().min(1).max(120), educationLevel: z.enum(["junior", "senior"]), schoolName: z.string().max(120).default(""), grade: z.number().int().min(1).max(3), examNumber: z.string().min(1).max(40), targetScore: z.number().int().min(0).max(100).default(60), openAt: z.string().datetime().nullable().optional(), closeAt: z.string().datetime().nullable().optional(), status: z.enum(["draft", "published", "closed"]).default("draft"), announcement: z.string().max(2000).default(""), showMarquee: z.boolean().default(false) })); const row = (await db.insert(examHubs).values({ ...body, openAt: body.openAt ? new Date(body.openAt) : null, closeAt: body.closeAt ? new Date(body.closeAt) : null, createdBy: admin.userId }).returning())[0]; if (body.showMarquee) await db.insert(announcements).values({ title: "📢 段考專區已開放", body: body.announcement || `${body.name} 已開放，現在可以開始複習英文單字。`, audience: "all", audienceIds: [], pinned: false, marquee: true, notify: true, push: false, sortOrder: 0, startsAt: body.openAt ? new Date(body.openAt) : new Date(), endsAt: body.closeAt ? new Date(body.closeAt) : null, createdBy: admin.userId, link: `/exam-hubs/${row.id}`, targetFeature: "dashboard" }).catch(() => undefined); return { hub: row }; } }),
  route({ method: "PATCH", path: "/admin/exam-hubs/:id", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ name: z.string().min(1).max(120).optional(), targetScore: z.number().int().min(0).max(100).optional(), status: z.enum(["draft", "published", "closed"]).optional(), openAt: z.string().datetime().nullable().optional(), closeAt: z.string().datetime().nullable().optional(), announcement: z.string().max(2000).optional(), showMarquee: z.boolean().optional() })); const { openAt, closeAt, ...patch } = body; const row = (await db.update(examHubs).set({ ...patch, ...(openAt !== undefined ? { openAt: openAt ? new Date(openAt) : null } : {}), ...(closeAt !== undefined ? { closeAt: closeAt ? new Date(closeAt) : null } : {}), updatedAt: new Date() }).where(eq(examHubs.id, ctx.params.id)).returning())[0]; if (!row) throw notFound("找不到段考專區"); return { hub: row }; } }),
  route({ method: "POST", path: "/admin/exam-hubs/:id/materials/upload", auth: "admin", rate: { limit: 20, windowSec: 3600 }, handler: async (ctx) => {
    const admin = ctx.requireUser();
    const hub = (await db.select({ id: examHubs.id, name: examHubs.name }).from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    const form = await ctx.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length) throw fail("REQ_NO_FILE", { message: "請至少選擇一個 PDF、TXT、圖片或支援的教材檔案。" });
    if (files.length > 100) throw fail("REQ_VALIDATION", { message: "單次最多上傳 100 個檔案。" });
    const results: Array<{ importId: string; filename: string; status: string; chars: number }> = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) throw fail("REQ_VALIDATION", { message: `${file.name} 超過 25MB。` });
      const data = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "application/octet-stream";
      const stored = await putObject({ userId: admin.userId, filename: `exam-${hub.id}-${file.name}`, mimeType: mime, data, allow: ["pdf", "text", "image"] });
      let text = "";
      if (mime === "application/pdf") {
        try {
          const chunks = await extractPdfQuestionChunks(data, 12_000);
          text = chunks.map((chunk) => chunk.text).join("\n\n").trim();
        } catch {
          text = "";
        }
        // Scanned PDFs have no text layer. OCR the first pages instead of silently
        // saving an empty material; the original PDF remains in object storage.
        if (!text) {
          try {
            const pages = await renderPdfImagePages(data, 1.2);
            const ocrPages = await Promise.all(pages.slice(0, 8).map((page) => extractText("image/png", Buffer.from(page.base64, "base64"), admin.userId, "其他")));
            text = ocrPages.join("\n\n").trim();
          } catch {
            text = "";
          }
        }
      } else {
        text = await extractText(mime, data, admin.userId, "其他");
      }
      const pending = (await db.insert(examHubMaterialImports).values({ examHubId: hub.id, uploadedBy: admin.userId, filename: file.name, mimeType: mime, objectId: stored.id, extractedText: text, status: "pending" }).returning())[0];
      results.push({ importId: pending.id, filename: file.name, status: "pending", chars: text.length });
    }
    return { uploaded: results.length, imports: results };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs/:id/material-imports", auth: "admin", handler: async (ctx) => {
    const hub = (await db.select({ id: examHubs.id }).from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    const imports = await db.select({ id: examHubMaterialImports.id, filename: examHubMaterialImports.filename, mimeType: examHubMaterialImports.mimeType, status: examHubMaterialImports.status, extractedText: examHubMaterialImports.extractedText, materialId: examHubMaterialImports.materialId, createdAt: examHubMaterialImports.createdAt }).from(examHubMaterialImports).where(eq(examHubMaterialImports.examHubId, hub.id)).orderBy(desc(examHubMaterialImports.createdAt)).limit(200);
    return { imports };
  }}),
  route({ method: "POST", path: "/admin/exam-hubs/:id/material-imports/confirm", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ importIds: z.array(z.string().uuid()).min(1).max(100) }));
    const pending = await db.select().from(examHubMaterialImports).where(and(eq(examHubMaterialImports.examHubId, ctx.params.id), inArray(examHubMaterialImports.id, body.importIds), eq(examHubMaterialImports.status, "pending")));
    if (!pending.length) throw fail("SYS_CONFLICT", { message: "沒有可確認匯入的待審核檔案。" });
    const imported: string[] = [];
    await db.transaction(async (tx) => {
      for (const item of pending) {
        const material = (await tx.insert(studyMaterials).values({ userId: admin.userId, title: `段考資料｜${item.filename}`.slice(0, 120), subject: "其他", kind: item.mimeType === "application/pdf" ? "pdf" : item.mimeType.startsWith("image/") ? "image" : "txt", status: "ready", content: item.extractedText, visibility: "private" }).returning())[0];
        await tx.insert(studyMaterialPages).values({ materialId: material.id, pageNumber: 1, text: item.extractedText, objectId: item.objectId });
        await tx.update(examHubMaterialImports).set({ status: "imported", materialId: material.id, reviewedBy: admin.userId, reviewedAt: new Date() }).where(eq(examHubMaterialImports.id, item.id));
        imported.push(material.id);
      }
    });
    return { imported: imported.length, materialIds: imported };
  }}),
  route({ method: "POST", path: "/admin/exam-hubs/:id/material-imports/:importId/analyze", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const hub = (await db.select().from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    const material = (await db.select().from(examHubMaterialImports).where(and(eq(examHubMaterialImports.id, ctx.params.importId), eq(examHubMaterialImports.examHubId, ctx.params.id))).limit(1))[0];
    if (!hub || !material) throw notFound("找不到段考資料來源");
    let text = material.extractedText.trim();
    let visionParts: Array<{ kind: "image"; mimeType: string; base64: string }> = [];
    if (!text && material.objectId) {
      const original = await readObject(material.objectId);
      if (original.mimeType === "application/pdf") {
        const chunks = await extractPdfQuestionChunks(original.data, 12_000);
        text = chunks.map((chunk) => chunk.text).join("\n\n").trim();
        if (!text) {
          const pages = await renderPdfImagePages(original.data, 1.65);
          visionParts = pages.slice(0, 8).map((page) => ({ kind: "image" as const, mimeType: "image/png", base64: page.base64 }));
        }
      }
    }
    if (!text && !visionParts.length) throw fail("SYS_CONFLICT", { message: "這份檔案沒有可讀文字或可分析頁面。請改用清楚的 JPG／PNG 題目照片。" });
    const parsed = parseNumberedChoiceQuestionText(text);
    let drafts: Array<Record<string, unknown>> = parsed.map((question) => ({ subject: hub.name.includes("英") ? "英文" : "其他", type: question.type, stem: question.stem, options: question.options, answer: question.answer, acceptedAnswers: [], synonyms: [], variants: [], acceptableTranslations: [], explanation: question.explanation, difficulty: question.difficulty, topic: question.topic, chapter: "", unit: "", learningPoint: "由原卷題目匯入，請管理員確認答案與解析。", aiConfidence: question.confidence, sourceType: "uploaded_exam_paper", sourceMetadata: { filename: material.filename, questionNumber: question.questionNumber, answerSource: question.answerSource }, analysis: { source: "deterministic-pdf-parser", answerSource: question.answerSource } }));
    if (!drafts.length) {
      const ai = await runAiJson<Array<Record<string, unknown>>>({ feature: "exam_paper_question_extract", userId: admin.userId, system: "你是台灣高中英文段考試卷解析器。請逐頁閱讀原卷影像，保留題號、完整題幹、所有選項與圖片／表格資訊。只能輸出 JSON 陣列，每題必須有 stem、type(single或multiple)、options(至少4個字串)、answer(沒有答案就輸出空陣列)、explanation。不要建立空白題目，也不要把閱讀文章或說明文字誤當成題目。", parts: visionParts.length ? [{ kind: "text", text: "請從以下段考試卷影像拆出所有可互動的四選一或多選題；即使沒有答案，也要保留題目與選項。" }, ...visionParts] : [{ kind: "text", text: `請從以下原卷文字拆出所有選擇題：\n${text.slice(0, 60_000)}` }], maxOutputTokens: 10_000, temperature: 0.05 }, []);
      drafts = ai.data.filter((row) => String(row.stem ?? row.question ?? "").trim() && Array.isArray(row.options) && (row.options as unknown[]).length >= 4).map((row, index) => ({ subject: hub.name.includes("英") || material.filename.includes("英文") ? "英文" : "其他", type: String(row.type ?? "single"), stem: String(row.stem ?? row.question), options: (row.options as unknown[]).map(String), answer: Array.isArray(row.answer) ? row.answer.map(String) : [], acceptedAnswers: [], synonyms: [], variants: [], acceptableTranslations: [], explanation: String(row.explanation ?? "請管理員確認答案。"), difficulty: "normal", topic: "段考原卷", chapter: "", unit: "", learningPoint: "由原卷匯入，請管理員確認。", aiConfidence: 0.65, sourceType: "uploaded_exam_paper", sourceMetadata: { filename: material.filename, aiExtracted: true, pageCount: visionParts.length, itemIndex: index }, analysis: { source: "ai-paper-vision-parser" } }));
    }
    if (!drafts.length) throw fail("SYS_CONFLICT", { message: "找不到可互動的四選一／多選題。請使用含清楚題號與選項的檔案，或先手動整理題目。" });
    const job = (await db.insert(examQuestionGenerationJobs).values({ examHubId: hub.id, requestedBy: admin.userId, status: "ready", requirements: { educationLevel: hub.educationLevel, schoolName: hub.schoolName ?? "", grade: hub.grade, subject: "其他", examNumber: hub.examNumber, chapters: [], units: [], vocabularyRange: [], questionTypes: ["single", "multiple"], difficulty: "normal" }, sourcePolicy: { useGlobalBank: false, useMaterials: true, useExisting: false, generateNew: false, materialIds: [material.materialId ?? ""], questionIds: [] } }).returning())[0];
    await db.insert(examQuestionGenerationItems).values(drafts.map((draft, itemIndex) => ({ jobId: job.id, itemIndex, draft, quality: { passed: true, score: 100, checks: { source: true, nonEmpty: true, options: true } }, analysis: (draft.analysis ?? {}) as Record<string, unknown>, sourceMetadata: (draft.sourceMetadata ?? {}) as Record<string, unknown>, status: "generated" })));
    return { job, itemCount: drafts.length, message: `已解析 ${drafts.length} 題，請查看逐題預覽後確認入庫。` };
  }}),
  route({ method: "POST", path: "/admin/exam-hubs/:id/material-imports/:importId/analyze-vocabulary", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const material = (await db.select().from(examHubMaterialImports).where(and(eq(examHubMaterialImports.id, ctx.params.importId), eq(examHubMaterialImports.examHubId, ctx.params.id))).limit(1))[0];
    if (!material) throw notFound("找不到段考資料來源");
    let text = material.extractedText.trim();
    let visionParts: Array<{ kind: "image"; mimeType: string; base64: string }> = [];
    if (!text && material.objectId) {
      const original = await readObject(material.objectId);
      if (original.mimeType === "application/pdf") {
        const chunks = await extractPdfQuestionChunks(original.data, 12_000);
        text = chunks.map((chunk) => chunk.text).join("\n\n").trim();
        if (!text) visionParts = (await renderPdfImagePages(original.data, 1.65)).slice(0, 8).map((page) => ({ kind: "image" as const, mimeType: "image/png", base64: page.base64 }));
      }
    }
    if (!text && !visionParts.length) throw fail("SYS_CONFLICT", { message: "這份檔案尚未讀到文字或可分析頁面，無法分析單字。" });
    const result = await runAiJson<Array<Record<string, unknown>>>({ feature: "exam_vocabulary_extract", userId: admin.userId, system: "你是台灣國高中英文單字範圍整理器。請閱讀原卷影像或文字，只擷取真正的英文單字，不要把句子、題號、選項或功能詞整段當單字。輸出 JSON 陣列，每項包含 word、meaning、partOfSpeech、example、exampleZh、phonetic、collocations、phrases、synonyms、antonyms。", parts: visionParts.length ? [{ kind: "text", text: "請從這份段考試卷中整理值得複習的英文單字。" }, ...visionParts] : [{ kind: "text", text: text.slice(0, 60_000) }], maxOutputTokens: 10_000, temperature: 0.05 }, []);
    const rows = result.data.map((row) => ({ hubId: ctx.params.id, word: String(row.word ?? "").trim(), normalizedWord: String(row.word ?? "").trim().toLocaleLowerCase("en-US"), meaning: String(row.meaning ?? ""), partOfSpeech: String(row.partOfSpeech ?? ""), example: String(row.example ?? ""), exampleZh: String(row.exampleZh ?? ""), phonetic: String(row.phonetic ?? ""), collocations: Array.isArray(row.collocations) ? row.collocations.map(String) : [], phrases: Array.isArray(row.phrases) ? row.phrases.map(String) : [], synonyms: Array.isArray(row.synonyms) ? row.synonyms.map(String) : [], antonyms: Array.isArray(row.antonyms) ? row.antonyms.map(String) : [], published: true })).filter((row) => /^[A-Za-z][A-Za-z' -]{1,80}$/.test(row.word));
    const inserted = rows.length ? await db.insert(examHubWords).values(rows).onConflictDoNothing().returning() : [];
    return { analyzed: rows.length, added: inserted.length, words: inserted };
  }}),
  route({ method: "DELETE", path: "/admin/exam-hubs/:id", auth: "admin", handler: async (ctx) => {
    const deleted = await db.delete(examHubs).where(eq(examHubs.id, ctx.params.id)).returning({ id: examHubs.id });
    if (!deleted.length) throw notFound("找不到段考專區");
    return { deleted: true, id: ctx.params.id };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs/:id/words", auth: "admin", handler: async (ctx) => ({ words: await db.select().from(examHubWords).where(eq(examHubWords.hubId, ctx.params.id)).orderBy(asc(examHubWords.word)) }) }),
  route({ method: "POST", path: "/admin/exam-hubs/:id/words", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ words: z.array(wordInput).min(1).max(1000) })); const rows = await db.insert(examHubWords).values(body.words.map((word) => ({ ...word, hubId: ctx.params.id, normalizedWord: word.word.toLocaleLowerCase("en-US") }))).onConflictDoNothing().returning(); return { words: rows, added: rows.length }; } }),
  route({ method: "DELETE", path: "/admin/exam-hubs/:hubId/words/:id", auth: "admin", handler: async (ctx) => { await db.delete(examHubWords).where(and(eq(examHubWords.id, ctx.params.id), eq(examHubWords.hubId, ctx.params.hubId))); return { deleted: true }; } }),
  route({ method: "POST", path: "/admin/exam-hubs/:id/ai-generation-jobs", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const hub = (await db.select().from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    const body = await ctx.json(z.object({ requirements: generationRequirements, count: z.number().int().min(1).max(100), sourcePolicy }));
    const requirements = body.requirements;
    if (requirements.educationLevel !== hub.educationLevel || requirements.grade !== hub.grade || (hub.schoolName && requirements.schoolName !== hub.schoolName) || requirements.examNumber !== hub.examNumber) throw fail("SYS_CONFLICT", { message: "AI 出題條件必須與段考專區正式範圍一致。" });
    const existing = body.sourcePolicy.questionIds.length ? await db.select({ id: questions.id, stem: questions.stem, answer: questions.answer, subject: questions.subject, type: questions.type, difficulty: questions.difficulty }).from(questions).where(inArray(questions.id, body.sourcePolicy.questionIds)).limit(100) : [];
    const global = body.sourcePolicy.useGlobalBank ? await db.select({ id: questions.id, stem: questions.stem, answer: questions.answer, subject: questions.subject, type: questions.type, difficulty: questions.difficulty }).from(questions).leftJoin(questionBanks, eq(questions.bankId, questionBanks.id)).where(and(or(eq(questionBanks.scope, "global"), and(isNull(questions.bankId), eq(questions.targetBank, "general"))), eq(questions.status, "published"), eq(questions.subject, requirements.subject))).limit(100) : [];
    const materials = body.sourcePolicy.useMaterials && body.sourcePolicy.materialIds.length ? await db.select({ title: studyMaterials.title, content: studyMaterials.content }).from(studyMaterials).where(inArray(studyMaterials.id, body.sourcePolicy.materialIds)).limit(30) : [];
    const job = (await db.insert(examQuestionGenerationJobs).values({ examHubId: hub.id, requestedBy: admin.userId, status: "generating", requirements, sourcePolicy: body.sourcePolicy }).returning())[0];
    const itemRows = await db.insert(examQuestionGenerationItems).values(Array.from({ length: body.count }, (_, itemIndex) => ({ jobId: job.id, itemIndex, sourceMetadata: { sourcePolicy: body.sourcePolicy } }))).returning();
    const background = await createAiBackgroundJob({ userId: admin.userId, kind: "exam_question_generation", feature: "exam_question_generation", idempotencyKey: `exam-generation:${job.id}`, batchSize: 1, input: { generationJobId: job.id, requirements, sourcePolicy: body.sourcePolicy, candidates: [...global, ...existing], materialText: materials.map((row) => `【${row.title}】\n${row.content}`).join("\n\n") }, items: itemRows.map((item) => ({ generationItemId: item.id, itemIndex: item.itemIndex })) });
    await db.update(examQuestionGenerationJobs).set({ backgroundJobId: background.job.id, updatedAt: new Date() }).where(eq(examQuestionGenerationJobs.id, job.id));
    if (!background.deduplicated) await enqueueAiBackground(background.job.id);
    return { job, backgroundJob: background.job, itemCount: itemRows.length };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs/:id/ai-generation-jobs", auth: "admin", handler: async (ctx) => {
    const hub = (await db.select({ id: examHubs.id }).from(examHubs).where(eq(examHubs.id, ctx.params.id)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    return { jobs: await db.select().from(examQuestionGenerationJobs).where(eq(examQuestionGenerationJobs.examHubId, hub.id)).orderBy(desc(examQuestionGenerationJobs.createdAt)) };
  }}),
  route({ method: "GET", path: "/admin/exam-question-generation/:id", auth: "admin", handler: async (ctx) => {
    const job = (await db.select().from(examQuestionGenerationJobs).where(eq(examQuestionGenerationJobs.id, ctx.params.id)).limit(1))[0];
    if (!job) throw notFound("找不到段考 AI 出題工作");
    return { job, items: await db.select().from(examQuestionGenerationItems).where(eq(examQuestionGenerationItems.jobId, job.id)).orderBy(asc(examQuestionGenerationItems.itemIndex)) };
  }}),
  route({ method: "PATCH", path: "/admin/exam-question-generation/:id/items/:itemId", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ draft: z.record(z.string(), z.unknown()).optional(), adminNote: z.string().max(2000).optional(), status: z.enum(["generated", "rejected", "approved"]).optional() }));
    const item = (await db.select().from(examQuestionGenerationItems).where(and(eq(examQuestionGenerationItems.id, ctx.params.itemId), eq(examQuestionGenerationItems.jobId, ctx.params.id))).limit(1))[0];
    if (!item) throw notFound("找不到段考 AI 題目草稿");
    return { item: (await db.update(examQuestionGenerationItems).set({ draft: body.draft ?? item.draft, adminNote: body.adminNote ?? item.adminNote, status: body.status ?? item.status, updatedAt: new Date() }).where(eq(examQuestionGenerationItems.id, item.id)).returning())[0] };
  }}),
  route({ method: "POST", path: "/admin/exam-question-generation/:id/confirm", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const job = (await db.select().from(examQuestionGenerationJobs).where(eq(examQuestionGenerationJobs.id, ctx.params.id)).limit(1))[0];
    if (!job) throw notFound("找不到段考 AI 出題工作");
    const hub = (await db.select().from(examHubs).where(eq(examHubs.id, job.examHubId)).limit(1))[0];
    if (!hub) throw notFound("找不到段考專區");
    const body = await ctx.json(z.object({ itemIds: z.array(z.string().uuid()).min(1).max(100) }));
    const items = await db.select().from(examQuestionGenerationItems).where(and(eq(examQuestionGenerationItems.jobId, job.id), inArray(examQuestionGenerationItems.id, body.itemIds)));
    const invalid = items.filter((item) => !["generated", "approved"].includes(item.status) || (item.quality as { passed?: boolean }).passed === false || (item.quality as { answerConflict?: boolean }).answerConflict);
    const stems = items.map((item) => String((item.draft as Record<string, unknown>).stem ?? "").trim().toLocaleLowerCase());
    const repeatedStems = stems.filter((stem, index) => stem && stems.indexOf(stem) !== index);
    const optionCounts = new Map<string, number>();
    for (const item of items) for (const option of Array.isArray((item.draft as Record<string, unknown>).options) ? ((item.draft as Record<string, unknown>).options as unknown[]).map(String) : []) optionCounts.set(option.trim().toLocaleLowerCase(), (optionCounts.get(option.trim().toLocaleLowerCase()) ?? 0) + 1);
    const overusedOptions = [...optionCounts.entries()].filter(([, count]) => count >= Math.max(3, Math.ceil(items.length * 0.6))).map(([option]) => option);
    if (items.length !== body.itemIds.length || invalid.length || repeatedStems.length || overusedOptions.length) throw fail("SYS_CONFLICT", { message: "仍有題目未通過品質檢查、存在 ANSWER_CONFLICT，或跨題選項／題目重複，請先修改後再確認。", details: { invalidItemIds: invalid.map((item) => item.id), repeatedStems: repeatedStems.length, overusedOptions } });
    const requirements = job.requirements as { educationLevel: string; schoolName: string; grade: number; subject: string; examNumber: string; chapters: string[]; units: string[]; vocabularyRange: string[]; questionTypes: string[]; difficulty: string };
    let bankId = hub.questionBankId;
    await db.transaction(async (tx) => {
      if (!bankId) {
        const bank = (await tx.insert(questionBanks).values({ name: `${hub.name} 專屬題庫`, description: "管理員確認後正式發布的段考題庫", subject: String((job.requirements as Record<string, unknown>).subject ?? "其他"), grade: String(hub.grade), educationLevel: hub.educationLevel, scope: `exam:${hub.id}`, bankKind: "exam", scopeMetadata: { examHubId: hub.id, formalScope: job.requirements }, visibility: "private", status: "published", createdBy: admin.userId }).returning())[0];
        bankId = bank.id;
        await tx.update(examHubs).set({ questionBankId: bank.id, formalScope: requirements, updatedAt: new Date() }).where(eq(examHubs.id, hub.id));
      }
      for (const item of items) {
        const draft = item.draft as Record<string, unknown>;
        const fingerprint = questionFingerprint(draft);
        const existing = (await tx.select().from(questions).where(eq(questions.fingerprint, fingerprint)).limit(1))[0];
        const question = existing ?? (await tx.insert(questions).values({ bankId, origin: "ai", targetBank: "exam", bankCategory: "exam", sourceLabel: `AI 段考生成工作 ${job.id}`, subject: String(draft.subject ?? "其他"), topic: String(draft.topic ?? ""), chapter: String(draft.chapter ?? ""), unit: String(draft.unit ?? ""), sourceType: "ai_generated", status: "published", level: hub.educationLevel, difficulty: String(draft.difficulty ?? "normal"), type: String(draft.type ?? "single"), stem: String(draft.stem ?? ""), options: Array.isArray(draft.options) ? draft.options.map(String) : [], answer: Array.isArray(draft.answer) ? draft.answer.map(String) : [], explanation: String(draft.explanation ?? ""), metadata: { acceptedAnswers: draft.acceptedAnswers ?? [], synonyms: draft.synonyms ?? [], variants: draft.variants ?? [], acceptableTranslations: draft.acceptableTranslations ?? [], analysis: draft.analysis ?? {}, aiConfidence: draft.aiConfidence ?? 0, generationJobId: job.id }, fingerprint }).returning())[0];
        await tx.insert(questionBankMemberships).values({ bankId, questionId: question.id, relation: existing ? "referenced" : "generated", sourceMetadata: { generationJobId: job.id, generationItemId: item.id, scope: `exam:${hub.id}` }, addedBy: admin.userId }).onConflictDoNothing();
        await tx.insert(questionSources).values({ questionId: question.id, sourceType: existing ? "referenced" : "ai_generated", sourceId: existing?.id ?? null, sourceLabel: `段考 ${hub.name}`, metadata: { generationJobId: job.id, generationItemId: item.id, sourcePolicy: job.sourcePolicy }, createdBy: admin.userId });
        await tx.update(examQuestionGenerationItems).set({ questionId: question.id, status: "approved", updatedAt: new Date() }).where(eq(examQuestionGenerationItems.id, item.id));
      }
      await tx.update(examQuestionGenerationJobs).set({ status: "confirmed", confirmedAt: new Date(), confirmedBy: admin.userId, updatedAt: new Date() }).where(eq(examQuestionGenerationJobs.id, job.id));
    });
    return { confirmed: items.length, bankId, scope: `exam:${hub.id}` };
  }}),
];
