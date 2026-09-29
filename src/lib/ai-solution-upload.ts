"use client";

import { upload } from "@vercel/blob/client";
import { apiPost, errorMessage } from "@/lib/api";

export const MAX_AI_SOLUTION_FILES = 30;
export const MAX_AI_SOLUTION_FILE_BYTES = 18 * 1024 * 1024;

export type AiSolutionScope = {
  includeQuestion?: boolean;
  includeHandwriting?: boolean;
  includeNote?: boolean;
  highlightPriority?: boolean;
  questionColor?: string;
  sentenceColor?: string;
  keywordColor?: string;
};

export type AiSolutionFileContext = {
  id: string;
  originalName: string;
  status: string;
  detected: Array<{ kind: string; text: string; confidence: number }>;
  error: string;
  uploadBatch: number;
};

export type AiSolutionUploadResult = {
  pathname?: string;
  context: AiSolutionFileContext | null;
  duplicate: boolean;
  errorCode?: string;
  error?: string;
};

type UploadProgress = (progress: { value: number; label: string }) => void;
type UploadedPath = { pathname: string; originalName: string; index: number };

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/heic",
  "application/pdf",
]);

function contentTypeFor(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  let contentType = file.type.trim().toLowerCase();
  if (!contentType) {
    contentType = extension === "pdf"
      ? "application/pdf"
      : extension === "png" ? "image/png"
        : extension === "webp" ? "image/webp"
          : extension === "avif" ? "image/avif"
            : extension === "heic" ? "image/heic"
              : ["jpg", "jpeg"].includes(extension) ? "image/jpeg" : "";
  }
  if (contentType === "image/jpg") contentType = "image/jpeg";
  return contentType;
}

function safeFilename(filename: string) {
  const base = filename.split(/[\\/]/).pop() || "upload";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Upload bytes directly from the browser to private Vercel Blob, then ask StudyNova to analyze them. */
export async function uploadAiSolutionFiles(
  files: File[],
  options: { subject: string; scope: AiSolutionScope; onProgress?: UploadProgress },
): Promise<{ results: AiSolutionUploadResult[]; newCount: number; duplicateCount: number }> {
  if (!files.length) throw new Error("請先選擇圖片或 PDF。");
  if (files.length > MAX_AI_SOLUTION_FILES) throw new Error(`一次最多上傳 ${MAX_AI_SOLUTION_FILES} 個檔案，請分批選取。`);

  const results: AiSolutionUploadResult[] = files.map(() => ({ context: null, duplicate: false }));
  const uploads: UploadedPath[] = [];
  let completed = 0;
  const report = (label: string, value: number) => options.onProgress?.({ value: Math.max(0, Math.min(100, value)), label });

  const prepared = files.map((file, index) => {
    const contentType = contentTypeFor(file);
    if (!file.size) results[index] = { context: null, duplicate: false, errorCode: "FILE_EMPTY", error: `${file.name} 是空檔案` };
    else if (file.size > MAX_AI_SOLUTION_FILE_BYTES) results[index] = { context: null, duplicate: false, errorCode: "FILE_TOO_LARGE", error: `${file.name} 超過單檔 18 MiB 上限` };
    else if (!ALLOWED_CONTENT_TYPES.has(contentType)) results[index] = { context: null, duplicate: false, errorCode: "FILE_MIME_UNSUPPORTED", error: `${file.name} 的格式不支援` };
    return { file, index, contentType, valid: Boolean(file.size && file.size <= MAX_AI_SOLUTION_FILE_BYTES && ALLOWED_CONTENT_TYPES.has(contentType)) };
  });
  const valid = prepared.filter((item) => item.valid);
  if (!valid.length) return { results, newCount: 0, duplicateCount: 0 };

  report(`準備直傳 ${valid.length} 個檔案…`, 8);
  for (let start = 0; start < valid.length; start += 3) {
    const group = valid.slice(start, start + 3);
    await Promise.all(group.map(async ({ file, index, contentType }) => {
      try {
        const pathname = `ai-solution/${crypto.randomUUID()}-${safeFilename(file.name)}`;
        const blob = await upload(pathname, file, {
          access: "private",
          contentType,
          handleUploadUrl: "/api/blob/ai-solution-upload",
          clientPayload: JSON.stringify({ filename: file.name }),
        });
        uploads.push({ pathname: blob.pathname, originalName: file.name, index });
        results[index] = { pathname: blob.pathname, context: null, duplicate: false };
      } catch (error) {
        results[index] = {
          context: null,
          duplicate: false,
          errorCode: "AI_SOLUTION_UPLOAD_FAILED",
          error: error instanceof Error ? error.message.slice(0, 240) : "直傳圖片失敗，請重試。",
        };
      } finally {
        completed += 1;
        report(`已完成上傳 ${completed}/${valid.length} 個檔案…`, 8 + Math.round((completed / valid.length) * 52));
      }
    }));
  }

  let sharedBatch: number | undefined;
  for (let start = 0; start < uploads.length; start += 2) {
    const group = uploads.slice(start, start + 2);
    let pending = [...group];
    for (let attempt = 0; pending.length && attempt < 5; attempt += 1) {
      report(`已上傳 ${uploads.length} 個，正在辨識 ${start + group.length - pending.length}/${uploads.length} 個檔案…`, 64 + Math.round(((start + group.length - pending.length) / uploads.length) * 34));
      let response: { batch: number; results: AiSolutionUploadResult[] };
      try {
        response = await apiPost<{ batch: number; results: AiSolutionUploadResult[] }>("/ai/solution/upload/complete", {
          pathnames: pending.map((item) => item.pathname),
          batch: sharedBatch,
          subject: options.subject,
          scope: options.scope,
        });
      } catch (error) {
        if (attempt < 4) {
          await wait(500 + attempt * 400);
          continue;
        }
        const message = errorMessage(error).slice(0, 200);
        for (const item of pending) results[item.index] = { pathname: item.pathname, context: null, duplicate: false, errorCode: "AI_SOLUTION_COMPLETE_FAILED", error: message };
        pending = [];
        break;
      }
      sharedBatch = response.batch;
      const stillPending: UploadedPath[] = [];
      const returned = new Set<string>();
      for (const item of response.results) {
        const pathname = item.pathname;
        if (!pathname) continue;
        const source = pending.find((candidate) => candidate.pathname === pathname);
        if (!source) continue;
        returned.add(pathname);
        if (item.errorCode === "FILE_UPLOAD_INCOMPLETE") stillPending.push(source);
        else results[source.index] = item;
      }
      for (const item of pending) if (!returned.has(item.pathname)) stillPending.push(item);
      pending = stillPending;
      if (pending.length && attempt < 4) await wait(500 + attempt * 400);
    }

    for (const item of pending) {
      results[item.index] = { pathname: item.pathname, context: null, duplicate: false, errorCode: "FILE_UPLOAD_INCOMPLETE", error: "雲端檔案登記尚未完成，請稍候後重試。" };
    }
  }

  report("圖片辨識處理完成", 100);
  return {
    results,
    newCount: results.filter((item) => item.context && !item.duplicate).length,
    duplicateCount: results.filter((item) => item.context && item.duplicate).length,
  };
}
