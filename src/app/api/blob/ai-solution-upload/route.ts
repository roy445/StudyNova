import { del, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { storageObjects } from "@/db/schema";
import { requireUser, rateLimit } from "@/server/auth";
import { consumeFeature, featureState } from "@/server/economy";
import { AI_SOLUTION_UPLOAD_FEATURE } from "@/server/quota-policy";
import { AppError, safeErrorMessage } from "@/server/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 18 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/heic", "application/pdf"];
const allowedSet = new Set(ALLOWED_CONTENT_TYPES);

type UploadClientPayload = { filename?: string };
type UploadTokenPayload = { userId: string; filename: string };

function parsePayload(value: string | null): UploadClientPayload {
  try {
    const parsed = JSON.parse(value || "{}") as UploadClientPayload;
    return { filename: typeof parsed.filename === "string" ? parsed.filename.slice(0, 180) : "upload" };
  } catch {
    return { filename: "upload" };
  }
}

function filenameOnly(value: string) {
  return value.split(/[\\/]/).pop()?.trim().slice(0, 180) || "upload";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob 尚未設定，請在 Vercel 加入 BLOB_READ_WRITE_TOKEN 後重新部署。");
        if (!pathname.startsWith("ai-solution/")) throw new Error("上傳路徑不正確。");
        const user = await requireUser();
        await rateLimit(`ai-solution-blob:${user.userId}`, 120, 3600);
        const quota = await featureState(user.userId, AI_SOLUTION_UPLOAD_FEATURE);
        if (!quota.enabled) throw new Error("AI 解題圖片上傳目前已停用。");
        if (!quota.unlimited && quota.remaining <= 0) throw new Error(`今日 AI 解題圖片／檔案上傳已達上限（${quota.limit} 個）。`);
        if (quota.monthlyLimit > 0 && quota.monthlyRemaining <= 0) throw new Error(`本月 AI 解題圖片／檔案上傳已達上限（${quota.monthlyLimit} 個）。`);
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.userId, filename: filenameOnly(parsePayload(clientPayload).filename || "upload") } satisfies UploadTokenPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let owner: UploadTokenPayload;
        try {
          owner = JSON.parse(tokenPayload || "{}") as UploadTokenPayload;
        } catch {
          throw new Error("上傳授權資料無效。");
        }
        if (!owner.userId || !owner.filename) throw new Error("上傳授權資料不完整。");
        const existing = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.storageKey, blob.pathname)).limit(1);
        if (existing[0]) return;

        const metadata = await head(blob.pathname);
        const mimeType = String(metadata.contentType || blob.contentType || "").split(";")[0].trim().toLowerCase();
        if (!metadata.size || metadata.size > MAX_FILE_BYTES) {
          await del(blob.pathname).catch(() => undefined);
          throw new Error("單檔大小超過 18 MiB 上限。");
        }
        if (!allowedSet.has(mimeType)) {
          await del(blob.pathname).catch(() => undefined);
          throw new Error(`不支援的檔案類型：${mimeType || "unknown"}`);
        }

        let storageObjectId: string | undefined;
        try {
          const row = (await db.insert(storageObjects).values({
            userId: owner.userId,
            driver: "blob",
            storageKey: blob.pathname,
            bucket: "vercel-blob",
            mimeType,
            sizeBytes: metadata.size,
            filename: filenameOnly(owner.filename),
            visibility: "private",
            data: null,
          }).returning({ id: storageObjects.id }))[0];
          storageObjectId = row.id;
          await consumeFeature(owner.userId, AI_SOLUTION_UPLOAD_FEATURE, 1, `ai-solution-upload:${blob.pathname}`);
        } catch (error) {
          if (storageObjectId) await db.delete(storageObjects).where(eq(storageObjects.id, storageObjectId)).catch(() => undefined);
          await del(blob.pathname).catch((cleanupError) => console.error("[ai-solution-upload] upload compensation cleanup failed", { pathname: blob.pathname, error: safeErrorMessage(cleanupError) }));
          throw error;
        }
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = safeErrorMessage(error);
    const code = error instanceof AppError ? error.code : "AI_SOLUTION_UPLOAD_FAILED";
    const status = error instanceof AppError ? error.status : 400;
    console.error("[ai-solution-blob-upload] request failed", { code, message: message.slice(0, 200) });
    return NextResponse.json({ ok: false, code, error: message.slice(0, 240) }, { status });
  }
}
