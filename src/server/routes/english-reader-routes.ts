import { featureState, consumeFeature, isProUser } from "../economy";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { englishReadingDocuments, englishReadingItems, jobQueue, storageObjects } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, sanitizeText } from "../core";
import { putObject, deleteObject } from "../storage";
import { runAiJson, aiConfigured } from "../ai";
import { extractText } from "./content-routes";
import { ensureEnglishReaderSchema } from "../db-compat";
import { queue } from "../queue";

const allowedMime = new Set(["application/pdf", "text/plain", "text/markdown", "application/json", "image/png", "image/jpeg", "image/webp"]);
const wordSchema = z.object({ word: z.preprocess((value) => typeof value === "string" ? value : "", z.string().trim().max(120).default("")), meaning: z.preprocess((value) => typeof value === "string" ? value : "", z.string().max(500).default("")), partOfSpeech: z.preprocess((value) => typeof value === "string" ? value : "", z.string().max(80).default("")), phonetic: z.preprocess((value) => typeof value === "string" ? value : "", z.string().max(120).default("")) });
const sentenceSchema = z.object({ sentence: z.preprocess((value) => typeof value === "string" ? value : "", z.string().trim().max(2000).default("")), meaning: z.preprocess((value) => typeof value === "string" ? value : "", z.string().max(1000).default("")) });
const analysisSchema = z.object({ summary: z.string().max(4000).default(""), vocabulary: z.array(wordSchema).max(120).default([]), sentences: z.array(sentenceSchema).max(80).default([]) });

async function ownDocument(id: string, userId: string) {
  const document = (await db.select().from(englishReadingDocuments).where(and(eq(englishReadingDocuments.id, id), eq(englishReadingDocuments.userId, userId))).limit(1))[0];
  if (!document) throw notFound("找不到英文閱讀內容");
  return document;
}

async function requireEnglishReaderAccess(userId: string) {
  const state = await featureState(userId, "english_reader");
  if (!state.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: "「英文雜誌閱讀器」目前已停用" });
  const pro = await isProUser(userId);
  if (state.proOnly && !pro) throw fail("QUOTA_PRO_REQUIRED", { message: "「英文雜誌閱讀器」是 Nova Pro 專屬功能" });
  if (!state.unlimited && state.limit <= 0) throw fail("QUOTA_NOT_IN_PLAN", { message: "「英文雜誌閱讀器」目前未開放" });
  return state;
}

async function pendingEnglishReaderJobs() {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(jobQueue).where(and(eq(jobQueue.name, "english_reader_analyze"), sql`${jobQueue.status} in ('pending', 'running')`));
  return Number(rows[0]?.count ?? 0);
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/english-reader/documents", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    // 列表只需要摘要欄位；originalText 可能接近 36,000 字，完整內容由單筆 detail API 延遲載入。
    const documents = await db.select({
      id: englishReadingDocuments.id,
      title: englishReadingDocuments.title,
      sourceKind: englishReadingDocuments.sourceKind,
      status: englishReadingDocuments.status,
      progress: englishReadingDocuments.progress,
      progressStage: englishReadingDocuments.progressStage,
      errorMessage: englishReadingDocuments.errorMessage,
      createdAt: englishReadingDocuments.createdAt,
      updatedAt: englishReadingDocuments.updatedAt,
    }).from(englishReadingDocuments).where(eq(englishReadingDocuments.userId, user.userId)).orderBy(desc(englishReadingDocuments.updatedAt)).limit(30);
    const queueSize = await pendingEnglishReaderJobs();
    return { documents: documents.map((document) => ({ ...document, queueSize })) };
  }}),
  route({ method: "GET", path: "/english-reader/documents/:id", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    const document = await ownDocument(ctx.params.id, user.userId);
    const items = await db.select().from(englishReadingItems).where(eq(englishReadingItems.documentId, document.id)).orderBy(asc(englishReadingItems.orderIndex));
    return { document, items };
  }}),
  route({ method: "POST", path: "/english-reader/documents/from-blob", auth: "user", rate: { limit: 30, windowSec: 3600, key: "english-reader-blob" }, handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    const body = await ctx.json(z.object({ title: z.string().trim().max(160).default("英文閱讀文章"), pathname: z.string().trim().min(1).max(500) }));
    const object = (await db.select().from(storageObjects).where(and(eq(storageObjects.userId, user.userId), eq(storageObjects.storageKey, body.pathname))).limit(1))[0];
    if (!object || object.driver !== "blob") throw notFound("找不到剛上傳的雲端檔案，請稍候再試");
    const sourceKind = object.mimeType === "application/pdf" ? "pdf" : object.mimeType.startsWith("image/") ? "image" : "text";
    const document = (await db.insert(englishReadingDocuments).values({ userId: user.userId, title: body.title || "英文閱讀文章", sourceKind, sourceObjectId: object.id, originalText: "", status: "queued", progress: 0, progressStage: "等待背景工作", errorMessage: "" }).returning())[0];
    const pro = await isProUser(user.userId);
    await queue().enqueue({ name: "english_reader_analyze", payload: { documentId: document.id, priority: pro ? "pro" : "standard" }, uniqueKey: `english-reader:${document.id}`, runAt: new Date(Date.now() - (pro ? 60_000 : 0)) });
    return { document: { ...document, queueSize: (await pendingEnglishReaderJobs()) }, queued: true, priority: pro ? "pro" : "standard", message: pro ? "已加入 Pro 優先分析佇列。" : "已上傳，背景分析中；目前會依序排隊處理。" };
  }}),
  route({ method: "POST", path: "/english-reader/documents/:id/retry", auth: "user", rate: { limit: 10, windowSec: 3600, key: "english-reader-retry" }, handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    const document = await ownDocument(ctx.params.id, user.userId);
    if (!document.sourceObjectId) throw badRequest("這份內容沒有可重新分析的原始檔案，請重新上傳。");
    if (["queued", "extracting", "analyzing", "saving"].includes(document.status)) return { document, queued: true, alreadyQueued: true };
    const pro = await isProUser(user.userId);
    const updated = (await db.update(englishReadingDocuments).set({ status: "queued", progress: 0, progressStage: pro ? "Pro 優先佇列" : "等待背景工作", errorMessage: "", updatedAt: new Date() }).where(eq(englishReadingDocuments.id, document.id)).returning())[0];
    await queue().enqueue({ name: "english_reader_analyze", payload: { documentId: document.id, priority: pro ? "pro" : "standard", retry: true }, uniqueKey: `english-reader:${document.id}:retry:${Date.now()}`, runAt: new Date(Date.now() - (pro ? 60_000 : 0)) });
    return { document: { ...updated, queueSize: await pendingEnglishReaderJobs() }, queued: true, priority: pro ? "pro" : "standard" };
  }}),
  route({ method: "POST", path: "/english-reader/documents", auth: "user", rate: { limit: 12, windowSec: 3600, key: "english-reader" }, handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
    const form = await ctx.formData();
    const file = form.get("file");
    const pasted = String(form.get("content") ?? "").trim();
    const title = String(form.get("title") ?? "英文閱讀文章").trim().slice(0, 160) || "英文閱讀文章";
    if (!(file instanceof File) && pasted.length < 20) throw badRequest("請上傳英文雜誌圖片、PDF 或文字檔，或貼上至少 20 個字的英文內容。");
    let objectId: string | null = null;
    let sourceText = pasted;
    let sourceKind = "text";
    try {
      if (file instanceof File) {
        const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.name.toLowerCase().endsWith(".txt") ? "text/plain" : "application/octet-stream");
        if (!allowedMime.has(mime)) throw badRequest("英文閱讀器只支援 PDF、TXT、Markdown、JSON、JPG、PNG 或 WebP。");
        const buffer = Buffer.from(await file.arrayBuffer());
        if (buffer.byteLength > 15 * 1024 * 1024) throw badRequest("檔案不可超過 15MB。");
        const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: mime, data: buffer, allow: ["pdf", "text", "image"] });
        objectId = stored.id;
        sourceKind = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : "text";
        sourceText = await extractText(mime, buffer, user.userId, "英文");
      }
      sourceText = sanitizeText(sourceText).slice(0, 36000);
      if (sourceText.length < 20) throw badRequest("沒有取得足夠英文文字；請確認圖片清楚、PDF 有文字層，或改貼上英文內容。");
      const created = (await db.insert(englishReadingDocuments).values({ userId: user.userId, title, sourceKind, sourceObjectId: objectId, originalText: sourceText, status: "analyzing" }).returning())[0];
      const { data } = await runAiJson<z.infer<typeof analysisSchema>>({
        feature: "english_reader",
        userId: user.userId,
        system: "你是台灣高中英文閱讀教師。只分析英文內容，不得把中文說明或檔案雜訊當成英文。回傳 JSON：summary、vocabulary、sentences。vocabulary 擷取值得學習的英文單字或片語，提供繁體中文意思、詞性、KK 音標（不確定就留白）；sentences 擷取原文中適合朗讀與學習的完整英文句子，meaning 提供自然繁體中文翻譯。只根據原文，不要杜撰，不要輸出 Markdown。",
        parts: [{ kind: "text", text: `標題：${title}\n請分析以下英文內容：\n${sourceText}` }],
        maxOutputTokens: 7000,
        temperature: 0.1,
      }, { summary: "", vocabulary: [], sentences: [] });
      const analysis = analysisSchema.parse(data);
      await consumeFeature(user.userId, "english_reader", 1, `english-reader:${created.id}`);
      const vocabulary = analysis.vocabulary.filter((item) => /[A-Za-z]/.test(item.word));
      const sentences = analysis.sentences.filter((item) => /[A-Za-z]/.test(item.sentence));
      await db.insert(englishReadingItems).values([
        ...vocabulary.map((item, index) => ({ documentId: created.id, itemType: "vocabulary", orderIndex: index, word: item.word, meaning: item.meaning, partOfSpeech: item.partOfSpeech, phonetic: item.phonetic, sentence: "", sentenceZh: "" })),
        ...sentences.map((item, index) => ({ documentId: created.id, itemType: "sentence", orderIndex: vocabulary.length + index, word: "", meaning: "", partOfSpeech: "", phonetic: "", sentence: item.sentence, sentenceZh: item.meaning })),
      ]);
      await db.update(englishReadingDocuments).set({ summary: analysis.summary, status: "ready", updatedAt: new Date() }).where(eq(englishReadingDocuments.id, created.id));
      const items = await db.select().from(englishReadingItems).where(eq(englishReadingItems.documentId, created.id)).orderBy(asc(englishReadingItems.orderIndex));
      return { document: { ...created, summary: analysis.summary, status: "ready" }, items, counts: { vocabulary: vocabulary.length, sentences: sentences.length } };
    } catch (error) {
      if (objectId) await deleteObject(objectId, user.userId, false).catch(() => undefined);
      throw error;
    }
  }}),
  route({ method: "DELETE", path: "/english-reader/documents/:id", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requireEnglishReaderAccess(user.userId);
    const document = await ownDocument(ctx.params.id, user.userId);
    if (document.sourceObjectId) await deleteObject(document.sourceObjectId, user.userId, false).catch(() => undefined);
    await db.delete(englishReadingDocuments).where(eq(englishReadingDocuments.id, document.id));
    return { deleted: true };
  }}),
];
