import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { englishReadingDocuments, englishReadingItems } from "@/db/schema";
import { sanitizeText } from "./core";
import { readObject } from "./storage";
import { runAiJson } from "./ai";
import { extractText } from "./routes/content-routes";

const wordSchema = z.object({ word: z.string().trim().min(1).max(120), meaning: z.string().max(500).default(""), partOfSpeech: z.string().max(80).default(""), phonetic: z.string().max(120).default("") });
const sentenceSchema = z.object({ sentence: z.string().trim().min(3).max(2000), meaning: z.string().max(1000).default("") });
const analysisSchema = z.object({ summary: z.string().max(4000).default(""), vocabulary: z.array(wordSchema).max(120).default([]), sentences: z.array(sentenceSchema).max(80).default([]) });

export async function processEnglishReaderDocument(documentId: string) {
  const document = (await db.select().from(englishReadingDocuments).where(eq(englishReadingDocuments.id, documentId)).limit(1))[0];
  if (!document) throw new Error("找不到英文閱讀文件");
  if (!document.sourceObjectId) throw new Error("英文閱讀文件缺少雲端檔案");
  const object = await readObject(document.sourceObjectId);
  const extracted = await extractText(object.mimeType, object.data, document.userId, "英文");
  const sourceText = sanitizeText(extracted).slice(0, 120_000);
  if (sourceText.length < 20) throw new Error("沒有取得足夠英文文字；請確認圖片清楚或 PDF 有文字層");
  const { data } = await runAiJson<z.infer<typeof analysisSchema>>({
    feature: "english_reader",
    userId: document.userId,
    system: "你是台灣高中英文閱讀教師。只分析英文內容，不得把中文說明或檔案雜訊當成英文。回傳 JSON：summary、vocabulary、sentences。vocabulary 擷取值得學習的英文單字或片語，提供繁體中文意思、詞性、KK 音標（不確定就留白）；sentences 擷取原文中適合朗讀與學習的完整英文句子，meaning 提供自然繁體中文翻譯。只根據原文，不要杜撰，不要輸出 Markdown。",
    parts: [{ kind: "text", text: `標題：${document.title}\n請分析以下英文內容：\n${sourceText}` }],
    maxOutputTokens: 7000,
    temperature: 0.1,
  }, { summary: "", vocabulary: [], sentences: [] });
  const analysis = analysisSchema.parse(data);
  const vocabulary = analysis.vocabulary.filter((item) => /[A-Za-z]/.test(item.word));
  const sentences = analysis.sentences.filter((item) => /[A-Za-z]/.test(item.sentence));
  await db.delete(englishReadingItems).where(eq(englishReadingItems.documentId, document.id));
  await db.insert(englishReadingItems).values([
    ...vocabulary.map((item, index) => ({ documentId: document.id, itemType: "vocabulary", orderIndex: index, word: item.word, meaning: item.meaning, partOfSpeech: item.partOfSpeech, phonetic: item.phonetic, sentence: "", sentenceZh: "" })),
    ...sentences.map((item, index) => ({ documentId: document.id, itemType: "sentence", orderIndex: vocabulary.length + index, word: "", meaning: "", partOfSpeech: "", phonetic: "", sentence: item.sentence, sentenceZh: item.meaning })),
  ]);
  await db.update(englishReadingDocuments).set({ originalText: sourceText, summary: analysis.summary, status: "ready", updatedAt: new Date() }).where(eq(englishReadingDocuments.id, document.id));
  return { vocabulary: vocabulary.length, sentences: sentences.length };
}

export async function markEnglishReaderFailed(documentId: string, message: string) {
  await db.update(englishReadingDocuments).set({ status: "failed", summary: message.slice(0, 4000), updatedAt: new Date() }).where(eq(englishReadingDocuments.id, documentId));
}
