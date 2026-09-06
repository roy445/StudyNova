import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { questionImportJobs, storageObjects } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { runAi } from "@/server/ai";

export const runtime = "nodejs";
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

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
        let payload: { jobId?: string; bankCategory?: string; sourceLabel?: string } = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch { throw new Error("題庫上傳參數格式不正確"); }
        if (!payload.jobId) throw new Error("缺少匯入工作 ID，請重新開始上傳");
        const job = (await db.select({ id: questionImportJobs.id }).from(questionImportJobs).where(eq(questionImportJobs.id, payload.jobId)).limit(1))[0];
        if (!job) throw new Error("找不到匯入工作");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: 50 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: admin.userId, jobId: payload.jobId, bankCategory: payload.bankCategory || "匯入題庫", sourceLabel: payload.sourceLabel || "線上上傳檔案" }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { userId: string; jobId: string; bankCategory: string; sourceLabel: string };
        const metadata = await head(blob.pathname);
        const object = (await db.insert(storageObjects).values({ userId: payload.userId, driver: "blob", storageKey: blob.pathname, bucket: "vercel-blob", mimeType: blob.contentType, sizeBytes: metadata.size, filename: blob.pathname.split("/").pop()?.slice(0, 180) || blob.pathname, visibility: "private", data: null }).returning({ id: storageObjects.id }))[0];
        try {
          if (metadata.size > 12 * 1024 * 1024) throw new Error("檔案超過 AI 單次解析上限 12MB，請拆成較小檔案再上傳");
          const fileResponse = await fetch(blob.url);
          if (!fileResponse.ok) throw new Error(`無法讀取 Blob 檔案：HTTP ${fileResponse.status}`);
          const base64 = Buffer.from(await fileResponse.arrayBuffer()).toString("base64");
          const ai = await runAi({ userId: payload.userId, feature: "admin_question_file_import", json: true, temperature: 0.1, maxOutputTokens: 8192, system: "你是 StudyNova 題庫整理器。只根據檔案中清楚看見的內容建立題目，不要猜測模糊文字。請回傳 JSON：{items:[{subject,topic,level,difficulty,type,stem,options,answer,explanation}]}。每一題 answer 必須是可驗證的答案；看不清楚或沒有完整答案的內容不要建立。type 只能是 single,multiple,fill,truefalse,short,reading。", parts: [{ kind: "text", text: `請解析這份${payload.sourceLabel}，整理成可用於國高中素養測驗的題目。題庫分類：${payload.bankCategory}。中英對照、選擇題、填空題與片語都要保留原意。` }, { kind: "image", mimeType: blob.contentType, base64 }] });
          const parsed = JSON.parse(ai.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "")) as { items?: Array<Record<string, unknown>> };
          const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 500) : [];
          const preview = [] as Array<Record<string, unknown>>;
          for (const item of items) {
            const subject = String(item.subject || "英文").slice(0, 20);
            const stem = String(item.stem || "").trim().slice(0, 2000);
            const answer = Array.isArray(item.answer) ? item.answer.map(String).slice(0, 8) : [];
            const options = Array.isArray(item.options) ? item.options.map(String).slice(0, 8) : [];
            if (!stem || !answer.length) continue;
            if ((item.type === "single" || item.type === "multiple") && !answer.every((value) => options.includes(value))) continue;
            preview.push({ subject, topic: String(item.topic || "").slice(0, 80), level: item.level === "senior" ? "senior" : "junior", difficulty: String(item.difficulty || "normal").slice(0, 20), type: String(item.type || "short").slice(0, 20), stem, options, answer, explanation: String(item.explanation || "").slice(0, 2000) });
          }
          const job = (await db.select().from(questionImportJobs).where(eq(questionImportJobs.id, payload.jobId)).limit(1))[0];
          if (job) {
            const existingKeys = new Set(job.preview.map((item) => `${item.subject}|${item.stem}|${Array.isArray(item.answer) ? item.answer.join("|") : ""}`));
            const merged = [...job.preview, ...preview.filter((item) => { const key = `${item.subject}|${item.stem}|${(item.answer as string[]).join("|")}`; if (existingKeys.has(key)) return false; existingKeys.add(key); return true; })];
            await db.update(questionImportJobs).set({ processedFiles: job.processedFiles + 1, totalQuestions: merged.length, preview: merged, status: job.processedFiles + 1 >= job.totalFiles ? "ready" : "analyzing", updatedAt: new Date() }).where(eq(questionImportJobs.id, job.id));
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
