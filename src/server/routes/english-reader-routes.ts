import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { englishReadingDocuments, englishReadingItems } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, sanitizeText } from "../core";
import { putObject, deleteObject } from "../storage";
import { runAiJson, aiConfigured } from "../ai";
import { extractText } from "./content-routes";
import { isProUser } from "../economy";
import { ensureEnglishReaderSchema } from "../db-compat";

const allowedMime = new Set(["application/pdf", "text/plain", "text/markdown", "application/json", "image/png", "image/jpeg", "image/webp"]);
const wordSchema = z.object({ word: z.string().trim().min(1).max(120), meaning: z.string().max(500).default(""), partOfSpeech: z.string().max(80).default(""), phonetic: z.string().max(120).default("") });
const sentenceSchema = z.object({ sentence: z.string().trim().min(3).max(2000), meaning: z.string().max(1000).default("") });
const analysisSchema = z.object({ summary: z.string().max(4000).default(""), vocabulary: z.array(wordSchema).max(120).default([]), sentences: z.array(sentenceSchema).max(80).default([]) });

async function requirePro(userId: string) {
  if (!(await isProUser(userId))) throw fail("QUOTA_PRO_REQUIRED", { message: "英文閱讀器目前為 Nova Pro 專屬功能。" });
}
async function ownDocument(id: string, userId: string) {
  const document = (await db.select().from(englishReadingDocuments).where(and(eq(englishReadingDocuments.id, id), eq(englishReadingDocuments.userId, userId))).limit(1))[0];
  if (!document) throw notFound("找不到英文閱讀內容");
  return document;
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/english-reader/documents", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requirePro(user.userId);
    return { documents: await db.select().from(englishReadingDocuments).where(eq(englishReadingDocuments.userId, user.userId)).orderBy(desc(englishReadingDocuments.updatedAt)).limit(30) };
  }}),
  route({ method: "GET", path: "/english-reader/documents/:id", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requirePro(user.userId);
    const document = await ownDocument(ctx.params.id, user.userId);
    const items = await db.select().from(englishReadingItems).where(eq(englishReadingItems.documentId, document.id)).orderBy(asc(englishReadingItems.orderIndex));
    return { document, items };
  }}),
  route({ method: "POST", path: "/english-reader/documents", auth: "user", rate: { limit: 12, windowSec: 3600, key: "english-reader" }, handler: async (ctx) => {
    const user = ctx.requireUser();
    await ensureEnglishReaderSchema();
    await requirePro(user.userId);
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
    await requirePro(user.userId);
    const document = await ownDocument(ctx.params.id, user.userId);
    if (document.sourceObjectId) await deleteObject(document.sourceObjectId, user.userId, false).catch(() => undefined);
    await db.delete(englishReadingDocuments).where(eq(englishReadingDocuments.id, document.id));
    return { deleted: true };
  }}),
];
