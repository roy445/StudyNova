import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { aiQuestionConverterItems, aiQuestionConverterJobs, fileContexts, platformSettings, questions, quizzes, storageObjects } from "@/db/schema";
import { runAiJson } from "./ai";
import { consumeFeature, featureState, isProUser } from "./economy";
import { fail } from "./core";
import { readObject } from "./storage";

export type ConvertedItem = {
  ordinal: number;
  pageNumber: number;
  type: "single" | "multiple" | "fill" | "short_answer" | "essay" | "image_question" | "handwritten" | "unknown";
  stem: string;
  options: string[];
  answer: string[];
  originalExplanation: string;
  aiExplanation: string;
  skipReason: string;
  sourceText: string;
  confidence: number;
};

export const CONVERTER_FEATURE = "ai_question_converter";
export const DEFAULT_CONVERTER_CONFIG = {
  enabled: true,
  freeEnabled: true,
  proEnabled: true,
  freeDailyLimit: 3,
  proDailyLimit: 20,
  maxPdfBytes: 20 * 1024 * 1024,
  maxPages: 100,
  maxQuestions: 100,
  freeRetentionDays: 15,
  proRetentionDays: 30,
  autoDelete: true,
  expiryReminderDays: 3,
  allowedTypes: ["single", "multiple", "fill"],
  printEnabled: false,
  printFree: false,
  printPro: true,
};

export function converterConfig(value: Record<string, unknown> | undefined) {
  return { ...DEFAULT_CONVERTER_CONFIG, ...(value ?? {}) };
}

export function cleanItems(items: ConvertedItem[], allowedTypes: string[], maxQuestions: number) {
  return items.slice(0, maxQuestions).map((item, index) => {
    const type = item.type || "unknown";
    const options = Array.isArray(item.options) ? item.options.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 8) : [];
    const answer = Array.isArray(item.answer) ? item.answer.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 8) : [];
    const stem = String(item.stem ?? "").trim();
    let skipReason = String(item.skipReason ?? "").trim();
    if (!stem) skipReason ||= "無法可靠辨識題目文字";
    if (["image_question", "handwritten"].includes(type)) skipReason ||= type === "image_question" ? "圖片為解題必要資訊，目前無法可靠互動化" : "手寫內容目前無法可靠辨識";
    if (["short_answer", "essay"].includes(type)) skipReason ||= "簡答／申論題，無法可靠自動判分";
    if (!allowedTypes.includes(type)) skipReason ||= "目前未開放此題型";
    if (!answer.length) skipReason ||= "找不到對應答案／解答";
    if ((type === "single" || type === "multiple") && options.length < 2) skipReason ||= "選項不足，無法建立客觀題";
    if (Number(item.confidence ?? 0) < 0.68) skipReason ||= "辨識信心不足，為避免猜測而略過";
    return {
      ordinal: Number(item.ordinal) || index + 1,
      pageNumber: Number(item.pageNumber) || 0,
      type,
      stem,
      options,
      answer,
      originalExplanation: String(item.originalExplanation ?? "").trim(),
      aiExplanation: String(item.aiExplanation ?? "").trim(),
      skipReason,
      sourceText: String(item.sourceText ?? stem).slice(0, 6000),
      confidence: Number(item.confidence ?? 0),
      status: skipReason ? "skipped" : "interactive",
    };
  });
}

async function sourceTextForContext(context: typeof fileContexts.$inferSelect, maxPages: number) {
  const object = await readObject(context.objectId);
  if (object.mimeType !== "application/pdf" && !/\.pdf$/i.test(object.filename)) throw fail("FILE_MIME_UNSUPPORTED", { message: "AI 題目互動化目前只接受 PDF。" });
  // fileContexts already contains the existing OCR/vision result. It is deliberately
  // included as a source, but never treated as authoritative without AI quality checks.
  const detected = Array.isArray(context.detected) ? context.detected.map((item) => `[${item.kind}] ${item.text}`).join("\n") : "";
  let extracted = "";
  let pageCount = 0;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(object.data), useWorkerFetch: false, isEvalSupported: false }).promise;
    pageCount = pdf.numPages;
    if (pageCount > maxPages) throw fail("FILE_TOO_LARGE", { message: `PDF 不得超過 ${maxPages} 頁。` });
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => "str" in item ? item.str : "").join(" ").trim();
      if (pageText) extracted += `\n[PDF 第 ${pageNumber} 頁]\n${pageText}`;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("不得超過")) throw error;
    // A scanned PDF can have no text layer; existing OCR is still passed to AI.
    console.warn("[ai-question-converter] PDF text extraction unavailable", { contextId: context.id, error: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
  }
  return { text: `檔名：${object.filename}\n既有 OCR／版面文字：\n${detected}\nPDF 可讀文字：\n${extracted}`.slice(0, 90000), pageCount };
}

export async function createConverterJob(params: { userId: string; contextId: string; title?: string }) {
  const context = (await db.select().from(fileContexts).where(and(eq(fileContexts.id, params.contextId), eq(fileContexts.userId, params.userId))).limit(1))[0];
  if (!context) throw fail("FILE_NOT_FOUND", { message: "找不到你上傳的 PDF，請重新上傳。" });
  const object = (await db.select().from(storageObjects).where(eq(storageObjects.id, context.objectId)).limit(1))[0];
  if (!object || object.mimeType !== "application/pdf") throw fail("FILE_MIME_UNSUPPORTED", { message: "AI 題目互動化目前只接受 PDF。" });
  const config = converterConfig((await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_question_converter")).limit(1))[0]?.value);
  if (!config.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: "AI 題目互動化目前暫停使用。" });
  const pro = await isProUser(params.userId);
  if (pro ? !config.proEnabled : !config.freeEnabled) throw fail("QUOTA_NOT_IN_PLAN", { message: pro ? "Nova Pro 目前未開放此功能。" : "一般會員目前未開放此功能。" });
  if (object.sizeBytes > Number(config.maxPdfBytes)) throw fail("FILE_TOO_LARGE", { message: `PDF 不得超過 ${Math.round(Number(config.maxPdfBytes) / 1024 / 1024)}MB。` });
  const state = await featureState(params.userId, CONVERTER_FEATURE);
  if (!state.enabled || (!state.unlimited && state.remaining <= 0)) throw fail("QUOTA_EXHAUSTED", { message: `今日 AI 題目互動化次數已用完（${state.limit} 次）。` });
  const existing = (await db.select().from(aiQuestionConverterJobs).where(and(eq(aiQuestionConverterJobs.userId, params.userId), eq(aiQuestionConverterJobs.sourceContextId, context.id), eq(aiQuestionConverterJobs.status, "processing"))).limit(1))[0];
  if (existing) return existing;
  const retentionDays = pro ? Number(config.proRetentionDays) : Number(config.freeRetentionDays);
  const expiresAt = Number.isFinite(retentionDays) && retentionDays > 0 ? new Date(Date.now() + retentionDays * 86400000) : null;
  const rows = await db.insert(aiQuestionConverterJobs).values({ userId: params.userId, sourceContextId: context.id, sourceFileName: object.filename, title: params.title?.trim().slice(0, 120) || object.filename.replace(/\.pdf$/i, ""), status: "queued", stage: "queued", isPro: pro, expiresAt }).returning();
  return rows[0];
}

export async function processConverterJob(jobId: string) {
  const job = (await db.select().from(aiQuestionConverterJobs).where(eq(aiQuestionConverterJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("找不到 AI 題目互動化工作");
  if (["completed", "failed", "expired"].includes(job.status)) return job;
  const started = Date.now();
  const setting = (await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_question_converter")).limit(1))[0];
  const config = converterConfig(setting?.value);
  try {
    await db.update(aiQuestionConverterJobs).set({ status: "processing", stage: "reading", updatedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, jobId));
    const context = (await db.select().from(fileContexts).where(eq(fileContexts.id, job.sourceContextId)).limit(1))[0];
    if (!context) throw new Error("來源檔案不存在");
    const extracted = await sourceTextForContext(context, Number(config.maxPages));
    const source = extracted.text;
    await db.update(aiQuestionConverterJobs).set({ stage: "recognizing", updatedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, jobId));
    const { data } = await runAiJson<{ pageCount?: number; hasAnswerKey?: boolean; items?: ConvertedItem[] }>(
      {
        feature: CONVERTER_FEATURE,
        userId: job.userId,
        temperature: 0.05,
        maxOutputTokens: 12000,
        system: `你是 StudyNova 的高可靠 PDF 題目轉換器。只能從來源 PDF/OCR 找到的內容建立題目，絕對不可補寫、猜答案或把簡答題改成選擇題。請辨識題號、頁碼、題目、選項、答案與原始解答。若圖片是解題必要資訊、文字模糊、答案無法配對、手寫內容、簡答／申論題，必須輸出 skipReason 並略過。只有有明確答案且 confidence >= 0.68 的單選、多選、填充題才可互動化。originalExplanation 必須保留 PDF 原始解答；aiExplanation 只能是整理文字，不能改寫官方答案。回傳 JSON。`,
        parts: [{ kind: "text", text: `來源內容：\n${source}` }],
      },
      { pageCount: 0, hasAnswerKey: false, items: [] },
    );
    await db.update(aiQuestionConverterJobs).set({ stage: "matching", updatedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, jobId));
    const items = cleanItems(Array.isArray(data.items) ? data.items : [], Array.isArray(config.allowedTypes) ? config.allowedTypes.map(String) : DEFAULT_CONVERTER_CONFIG.allowedTypes, Number(config.maxQuestions));
    const answerMissing = !data.hasAnswerKey || !items.some((item) => item.answer.length > 0);
    if (answerMissing) {
      for (const item of items) { if (!item.skipReason) item.skipReason = "找不到題目與答案／解答的可靠配對"; item.status = "skipped"; }
    }
    const summary = items.reduce<Record<string, number>>((out, item) => { const key = item.skipReason ? item.skipReason.includes("圖片") ? "image_question" : item.skipReason.includes("簡答") || item.type === "essay" ? "written" : item.skipReason.includes("答案") ? "missing_answer" : "unreadable" : "interactive"; out[key] = (out[key] ?? 0) + 1; return out; }, {});
    await db.delete(aiQuestionConverterItems).where(eq(aiQuestionConverterItems.jobId, jobId));
    if (items.length) await db.insert(aiQuestionConverterItems).values(items.map((item) => ({ jobId, ordinal: item.ordinal, pageNumber: item.pageNumber, type: item.type, status: item.status, stem: item.stem, options: item.options, answer: item.answer, originalExplanation: item.originalExplanation, aiExplanation: item.aiExplanation, skipReason: item.skipReason, sourceText: item.sourceText, metadata: { confidence: item.confidence } })));
    const interactiveCount = items.filter((item) => item.status === "interactive").length;
    const skippedCount = items.length - interactiveCount;
    await db.update(aiQuestionConverterJobs).set({ status: "preview", stage: "quality_check", pageCount: extracted.pageCount || Number(data.pageCount ?? 0), totalCount: items.length, interactiveCount, skippedCount, summary, aiUsage: 1, processingMs: Date.now() - started, updatedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, jobId));
    return (await db.select().from(aiQuestionConverterJobs).where(eq(aiQuestionConverterJobs.id, jobId)).limit(1))[0];
  } catch (error) {
    await db.update(aiQuestionConverterJobs).set({ status: "failed", stage: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "PDF 分析失敗", processingMs: Date.now() - started, updatedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, jobId));
    throw error;
  }
}

export async function confirmConverterJob(userId: string, jobId: string) {
  const job = (await db.select().from(aiQuestionConverterJobs).where(and(eq(aiQuestionConverterJobs.id, jobId), eq(aiQuestionConverterJobs.userId, userId))).limit(1))[0];
  if (!job || job.status !== "preview") throw fail("REQ_VALIDATION", { message: "這份分析尚未完成預覽，無法建立題目。" });
  if (job.expiresAt && job.expiresAt <= new Date()) throw fail("REQ_VALIDATION", { message: "這份題目分析已過保存期限。" });
  const rows = await db.select().from(aiQuestionConverterItems).where(and(eq(aiQuestionConverterItems.jobId, job.id), eq(aiQuestionConverterItems.status, "interactive")));
  if (!rows.length) throw fail("REQ_VALIDATION", { message: "沒有可可靠互動化的題目；請確認 PDF 同時包含題目與答案／解答。" });
  await consumeFeature(userId, CONVERTER_FEATURE, 1, `converter:${job.id}`);
  const ids: string[] = [];
  for (const item of rows) {
    const fingerprint = createHash("sha256").update(`${userId}\n${item.type}\n${item.stem}`.toLowerCase()).digest("hex");
    const inserted = await db.insert(questions).values({ ownerId: userId, origin: "user", sourceLabel: job.sourceFileName, sourceType: "ai_question_converter", subject: "其他", topic: job.title, type: item.type === "multiple" ? "multiple" : item.type === "fill" ? "fill" : "single", stem: item.stem, options: item.options, answer: item.answer, explanation: item.originalExplanation || item.aiExplanation || "此題原始檔案只有答案，沒有提供解答。", metadata: { converterJobId: job.id, originalExplanation: item.originalExplanation, aiExplanation: item.aiExplanation, sourceText: item.sourceText }, fingerprint }).onConflictDoNothing().returning({ id: questions.id });
    if (inserted[0]) ids.push(inserted[0].id);
  }
  const quiz = (await db.insert(quizzes).values({ userId, title: job.title, subject: "其他", source: "ai_question_converter", timeLimitSec: Math.max(60, ids.length * 90), questionIds: ids, expiresAt: job.expiresAt, visibility: "private" }).returning())[0];
  await db.update(aiQuestionConverterJobs).set({ status: "completed", stage: "completed", quizId: quiz.id, updatedAt: new Date(), completedAt: new Date() }).where(eq(aiQuestionConverterJobs.id, job.id));
  return { jobId: job.id, quiz, createdCount: ids.length, skippedCount: job.skippedCount };
}
