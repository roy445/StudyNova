import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { examVocabularyImportJobs, examVocabularyItems } from "@/db/schema";
import { readObject } from "./storage";
import { runAiJson } from "./ai";
import { normalizeKkPhonetic } from "./pronunciation";

export type ExtractedWord = { word?: string; meaning?: string; partOfSpeech?: string; phonetic?: string; phrase?: string; phraseMeaning?: string; example?: string; exampleZh?: string };

function primaryMeaning(value: unknown) {
  return String(value ?? "").trim().split(/[、；;，,\/\|]/)[0]?.trim().slice(0, 500) ?? "";
}

function needsMeaning(value: unknown) {
  const text = String(value ?? "").trim();
  return !text || /不確定|不清楚|看不清|待確認|無法辨識|unknown|unclear|\?{1,}/i.test(text);
}

async function fillMissingMeanings(words: ExtractedWord[], userId: string) {
  const targets = words.map((item, index) => ({ index, word: String(item.word ?? "").trim(), meaning: String(item.meaning ?? "").trim() }))
    .filter((item) => item.word && needsMeaning(item.meaning));
  if (!targets.length) return words;
  try {
    const { data } = await runAiJson<{ translations?: Array<{ index?: number; meaning?: string }> }>({
      feature: "learning_vocabulary_translation",
      userId,
      system: "你是繁體中文英文字典。只補上英文單字或片語最常用、適合高中段考的繁體中文意思。不要輸出不確定、待確認、問號或英文原文。只回傳 JSON：{translations:[{index,meaning}]}。",
      parts: [{ kind: "text", text: JSON.stringify(targets) }],
      maxOutputTokens: 3000,
      temperature: 0.1,
    }, { translations: [] });
    const translated = new Map((data.translations ?? []).map((item) => [Number(item.index), String(item.meaning ?? "").trim()]));
    return words.map((item, index) => {
      const replacement = translated.get(index);
      return replacement && !needsMeaning(replacement) ? { ...item, meaning: replacement } : item;
    });
  } catch (error) {
    console.warn("[StudyNova][exam-vocabulary-translation]", error instanceof Error ? error.message : error);
    return words;
  }
}

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
      system: "你是高中英文段考單字 OCR 專家。請辨識圖片或 PDF 中所有單字與片語，不能只取幾個。只回傳 JSON：{words:[{word,meaning,partOfSpeech,phonetic,phrase,phraseMeaning,example,exampleZh}],readable:true}。phonetic 必須是台灣常用 KK 音標，使用 Unicode 原始字元，可用 / / 或 [ ] 包住；不要輸出 IPA 標籤、KK音標文字、HTML、\\uXXXX、亂碼或不確定結果，看不清楚時 phonetic 請留空。word 必須是英文單字或片語的核心形式；中文意義保留繁體中文；看不清楚的項目不要猜。若圖片不是單字資料，words 回傳空陣列。",
      parts: [{ kind: "image", mimeType: object.mimeType, base64: object.data.toString("base64") }],
      maxOutputTokens: 6000,
    }, { words: [], readable: true });
    const translatedWords = await fillMissingMeanings(data.words ?? [], job.uploadedBy);
    const rows = translatedWords.map((item, index) => ({
      setId: job.setId,
      unitId: job.unitId,
      word: String(item.word ?? "").trim().slice(0, 160),
      meaning: primaryMeaning(item.meaning),
      partOfSpeech: String(item.partOfSpeech ?? "").trim().slice(0, 80),
      phonetic: normalizeKkPhonetic(item.phonetic).slice(0, 100),
      phrase: String(item.phrase ?? "").trim().slice(0, 240),
      phraseMeaning: String(item.phraseMeaning ?? "").trim().slice(0, 300),
      example: String(item.example ?? "").trim().slice(0, 500),
      exampleZh: String(item.exampleZh ?? "").trim().slice(0, 500),
      sourceFile: job.filename,
      metadata: { objectId: job.objectId, readable: data.readable !== false },
      sortOrder: index,
    } as const)).filter((item) => normalizeWord(item.word) && !needsMeaning(item.meaning));
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
    const raw = error instanceof Error ? error.message : "OCR 分析失敗";
    const record = (error && typeof error === "object") ? error as { code?: unknown; requestId?: unknown; details?: unknown } : {};
    const details = record.details && typeof record.details === "object" ? record.details as { category?: unknown; provider?: unknown; reason?: unknown } : {};
    const category = typeof details.category === "string" ? details.category : "unknown";
    const provider = typeof details.provider === "string" ? details.provider : "unknown";
    const reason = typeof details.reason === "string" ? details.reason : "";
    const message = `${raw}${reason ? `｜${reason}` : ""}`.slice(0, 500);
    const transient = ["rate_limited", "server_error", "timeout", "network"].includes(category) || /high demand|temporarily|try again later|timeout|忙碌|逾時/i.test(`${raw} ${reason}`);
    console.error("[StudyNova][exam-vocabulary-ocr]", {
      jobId: job.id,
      objectId: job.objectId,
      filename: job.filename,
      setId: job.setId,
      userId: job.uploadedBy,
      code: typeof record.code === "string" ? record.code : "",
      requestId: typeof record.requestId === "string" ? record.requestId : "",
      category,
      provider,
      reason,
      error: raw,
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (transient) {
      await db.update(examVocabularyImportJobs).set({ status: "queued", progress: 35, errorMessage: "AI 目前忙碌或暫時無回應，已自動排隊等待重試。", updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id));
      const retryError = error instanceof Error ? error : new Error(raw);
      (retryError as Error & { retryableQueue?: boolean }).retryableQueue = true;
      throw retryError;
    }
    const failed = (await db.update(examVocabularyImportJobs).set({ status: "failed", progress: 100, errorMessage: message, updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id)).returning())[0];
    return failed;
  }
}
