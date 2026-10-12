import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { examVocabularyImportJobs, examVocabularyItems } from "@/db/schema";
import { readObject } from "./storage";
import { runAiJson } from "./ai";

export type ExtractedWord = { word?: string; meaning?: string; partOfSpeech?: string; phonetic?: string; phrase?: string; phraseMeaning?: string; example?: string; exampleZh?: string };

function normalizeWord(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

export async function processExamVocabularyImport(jobId: string) {
  const job = (await db.select().from(examVocabularyImportJobs).where(eq(examVocabularyImportJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("找不到英文段考單字匯入工作");
  if (job.status === "completed") return job;
  if (!job.uploadedBy) throw new Error("英文段考匯入缺少建立者");
  await db.update(examVocabularyImportJobs).set({ status: "processing", progress: 10, errorMessage: "", updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id));
  try {
    const object = await readObject(job.objectId);
    await db.update(examVocabularyImportJobs).set({ progress: 35, updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id));
    const { data } = await runAiJson<{ words?: ExtractedWord[]; readable?: boolean; message?: string }>({
      feature: "learning_vocabulary_ocr",
      userId: job.uploadedBy,
      system: "你是高中英文段考單字 OCR 專家。請辨識圖片或 PDF 中所有單字與片語，不能只取幾個。只回傳 JSON：{words:[{word,meaning,partOfSpeech,phonetic,phrase,phraseMeaning,example,exampleZh}],readable:true}。word 必須是英文單字或片語的核心形式；中文意義保留繁體中文；看不清楚的項目不要猜。若圖片不是單字資料，words 回傳空陣列。",
      parts: [{ kind: "image", mimeType: object.mimeType, base64: object.data.toString("base64") }],
      maxOutputTokens: 6000,
    }, { words: [], readable: true });
    const rows = (data.words ?? []).map((item, index) => ({
      setId: job.setId,
      unitId: job.unitId,
      word: String(item.word ?? "").trim().slice(0, 160),
      meaning: String(item.meaning ?? "").trim().slice(0, 500),
      partOfSpeech: String(item.partOfSpeech ?? "").trim().slice(0, 80),
      phonetic: String(item.phonetic ?? "").trim().slice(0, 100),
      phrase: String(item.phrase ?? "").trim().slice(0, 240),
      phraseMeaning: String(item.phraseMeaning ?? "").trim().slice(0, 300),
      example: String(item.example ?? "").trim().slice(0, 500),
      exampleZh: String(item.exampleZh ?? "").trim().slice(0, 500),
      sourceFile: job.filename,
      metadata: { objectId: job.objectId, readable: data.readable !== false },
      sortOrder: index,
    } as const)).filter((item) => normalizeWord(item.word));
    let accepted = 0;
    let skipped = 0;
    for (const row of rows) {
      const normalized = normalizeWord(row.word);
      const existing = (await db.select({ id: examVocabularyItems.id }).from(examVocabularyItems).where(and(eq(examVocabularyItems.setId, job.setId), sql`lower(trim(${examVocabularyItems.word})) = ${normalized}`)).limit(1))[0];
      if (existing) { skipped += 1; continue; }
      await db.insert(examVocabularyItems).values(row);
      accepted += 1;
    }
    const completed = (await db.update(examVocabularyImportJobs).set({ status: "completed", progress: 100, accepted, skipped, updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id)).returning())[0];
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "OCR 分析失敗";
    const failed = (await db.update(examVocabularyImportJobs).set({ status: "failed", progress: 100, errorMessage: message, updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id)).returning())[0];
    return failed;
  }
}
