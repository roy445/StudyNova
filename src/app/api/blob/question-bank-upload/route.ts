import { get, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { questionImportJobs, storageObjects } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { extractJson, runAi } from "@/server/ai";

export const runtime = "nodejs";
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg", "audio/webm"];
const MAX_AI_BYTES = 18 * 1024 * 1024;

type DraftItem = Record<string, unknown> & {
  stem: string;
  subject: string;
  type: string;
  answer: string[];
  options: string[];
  status: "READY" | "NEEDS_REVIEW" | "DUPLICATE";
};

function safeText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeItem(item: Record<string, unknown>, sourceObjectId: string, sourcePage?: number): DraftItem | null {
  const stem = safeText(item.stem ?? item.question ?? item.text, 10000);
  if (!stem) return null;
  const answer = Array.isArray(item.answer) ? item.answer.map((value) => safeText(value, 1000)).filter(Boolean).slice(0, 12) : [];
  const options = Array.isArray(item.options) ? item.options.map((value) => safeText(value, 2000)).filter(Boolean).slice(0, 12) : [];
  const type = safeText(item.type || "short", 40).toLowerCase();
  const confidence = Number(item.confidence ?? 0);
  const reasons = Array.isArray(item.reviewReasons) ? item.reviewReasons.map((value) => safeText(value, 200)).filter(Boolean) : [];
  if (!answer.length) reasons.push("答案無法確認");
  if (confidence > 0 && confidence < 0.75) reasons.push("AI 信心低於 75%");
  if (["single", "multiple"].includes(type) && options.length < 2) reasons.push("選項缺失");
  if (Boolean(item.handwritingUncertain)) reasons.push("此區域可能存在手寫辨識錯誤");
  if (Boolean(item.formulaUncertain)) reasons.push("公式無法完全確認");
  const metadata: Record<string, unknown> = {
    questionNumber: item.questionNumber ?? item.number ?? null,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    answerSource: safeText(item.answerSource || "", 200),
    sourcePage: sourcePage ?? (Number(item.sourcePage ?? 0) || null),
    reviewReasons: reasons,
    imageAsset: Boolean(item.hasImage || item.questionImage || item.imageAsset),
    questionImage: item.questionImage || null,
    formula: item.latex || item.mathml || null,
    audioSegment: item.audioSegment || null,
    sourceObjectId,
  };
  return {
    subject: safeText(item.subject || "其他", 30),
    topic: safeText(item.topic || item.knowledgePoint || "", 160),
    level: item.level === "senior" ? "senior" : "junior",
    difficulty: safeText(item.difficulty || "normal", 30),
    type,
    stem,
    options,
    answer,
    explanation: safeText(item.explanation || "", 6000),
    confidence,
    status: reasons.length ? "NEEDS_REVIEW" : "READY",
    reviewReasons: reasons,
    metadata,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 未設定，請先在 Vercel Blob 連接儲存庫");
        const admin = await requireAdmin();
        let payload: { jobId?: string; bankCategory?: string; sourceLabel?: string; subjectHint?: string } = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch { throw new Error("題庫上傳參數格式不正確"); }
        if (!payload.jobId) throw new Error("缺少匯入工作 ID，請重新開始上傳");
        const job = (await db.select({ id: questionImportJobs.id }).from(questionImportJobs).where(eq(questionImportJobs.id, payload.jobId)).limit(1))[0];
        if (!job) throw new Error("找不到匯入工作");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: 50 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: admin.userId, jobId: payload.jobId, bankCategory: payload.bankCategory || "匯入題庫", sourceLabel: payload.sourceLabel || "線上上傳檔案", subjectHint: payload.subjectHint || "auto" }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { userId: string; jobId: string; bankCategory: string; sourceLabel: string; subjectHint?: string };
        const metadata = await head(blob.pathname);
        const object = (await db.insert(storageObjects).values({ userId: payload.userId, driver: "blob", storageKey: blob.pathname, bucket: "vercel-blob", mimeType: blob.contentType, sizeBytes: metadata.size, filename: blob.pathname.split("/").pop()?.slice(0, 180) || blob.pathname, visibility: "private", data: null }).returning({ id: storageObjects.id }))[0];
        try {
          if (metadata.size > MAX_AI_BYTES) throw new Error("檔案超過 AI 單次解析上限 18MB，請拆成較小檔案再上傳");
          const privateBlob = await get(blob.pathname, { access: "private" });
          if (!privateBlob?.stream) throw new Error("無法讀取 Blob 私有檔案內容");
          const base64 = Buffer.from(await new Response(privateBlob.stream).arrayBuffer()).toString("base64");
          const isAudio = blob.contentType.startsWith("audio/");
          const ai = await runAi({
            userId: payload.userId,
            feature: "admin_question_file_import",
            json: true,
            temperature: 0.1,
            maxOutputTokens: 12000,
            system: `你是 StudyNova 題庫數位化分析器。必須掃描整個檔案，盡可能列出檔案中所有題目，不得因為答案缺漏、手寫、圖片、表格、公式、作文或聽力而丟棄題目。請區分 Question、Answer Key、Explanation、Reference、Notes。答案可能在文件最後幾頁、同一份檔案的最後一頁，或另一個上傳檔案中；在目前檔案中找不到答案時仍保留題目，answer 回傳 []、status 由後端標記 NEEDS_REVIEW。支援選擇、複選、填空、克漏字、配合、閱讀、聽力、文法、字彙、翻譯、計算、應用、圖表、實驗、手寫、作文、圖片、幾何、綜合、非選題。題號支援 1.、1、2024、（1）、(1)、1)、Q1、Question 1、一、二、（一），沒有題號時建立 temporaryQuestionId。科目要綜合題目文字、圖片、選項、公式、專有名詞與上下文判斷，不確定就降低 confidence。請只回傳 JSON：{questions:[{questionNumber,temporaryQuestionId,subject,topic,level,difficulty,type,stem,options,answer,explanation,confidence,answerSource,sourcePage,reviewReasons,hasImage,questionImage,latex,mathml,handwritingUncertain,formulaUncertain,audioSegment}],answerKeys:[{questionNumber,answer,sourcePage}],answerRegions:[{text,sourcePage}]}。不要把答案 key 建成題目。type 可使用 single,multiple,fill,cloze,matching,reading,listening,grammar,vocabulary,translation,calculation,application,chart,experiment,handwriting,essay,image,geometry,composite,short。${isAudio ? "音檔請辨識可聽見的題號、停頓與語音段落，推測 audioSegment 的 startSec/endSec，但標記為建議值供 Admin Preview 調整。" : "圖片題與公式題請保留 imageAsset/questionImage/latex 或 mathml 欄位。"}`,
            parts: [{ kind: "text", text: `請完整解析檔案 ${payload.sourceLabel}。題庫分類：${payload.bankCategory}。科目提示：${payload.subjectHint && payload.subjectHint !== "auto" ? payload.subjectHint : "請依題目內容自動判斷科目"}。不要摘要、不要只挑容易解析的題目。` }, { kind: isAudio ? "audio" : "image", mimeType: blob.contentType, base64 }],
          });
          const parsed = extractJson<{ questions?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>>; answerKeys?: Array<Record<string, unknown>> }>(ai.text, {});
          const rawItems = Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed.items) ? parsed.items : [];
          const preview = rawItems.map((item) => normalizeItem(item, object.id, Number(item.sourcePage ?? 0) || undefined)).filter((item): item is DraftItem => Boolean(item)).slice(0, 1000);
          const answerKeys = Array.isArray(parsed.answerKeys) ? parsed.answerKeys.slice(0, 1000) : [];
          const job = (await db.select().from(questionImportJobs).where(eq(questionImportJobs.id, payload.jobId)).limit(1))[0];
          if (job) {
            const existingKeys = new Set(job.preview.map((item) => `${item.subject}|${item.stem}|${Array.isArray(item.answer) ? item.answer.join("|") : ""}`));
            const merged = [...job.preview, ...preview.filter((item) => { const key = `${item.subject}|${item.stem}|${item.answer.join("|")}`; if (existingKeys.has(key)) return false; existingKeys.add(key); return true; })];
            await db.update(questionImportJobs).set({ processedFiles: job.processedFiles + 1, totalQuestions: merged.length, acceptedQuestions: merged.filter((item) => item.status !== "DUPLICATE").length, preview: merged.map((item) => ({ ...item, answerKeys })), status: job.processedFiles + 1 >= job.totalFiles ? "ready" : "analyzing", updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id));
          }
        } catch (error) {
          console.error("[question-bank-upload] parse failed", { objectId: object.id, error });
          const job = (await db.select().from(questionImportJobs).where(eq(questionImportJobs.id, payload.jobId)).limit(1))[0];
          if (job) await db.update(questionImportJobs).set({ processedFiles: job.processedFiles + 1, status: job.processedFiles + 1 >= job.totalFiles ? "ready" : "analyzing", errorMessage: String(error instanceof Error ? error.message : error).slice(0, 500), updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id));
        }
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "題庫檔案上傳失敗";
    console.error("[question-bank-upload] upload failed", error);
    return NextResponse.json({ ok: false, code: "QUESTION_BANK_UPLOAD_FAILED", error: message }, { status: 400 });
  }
}
