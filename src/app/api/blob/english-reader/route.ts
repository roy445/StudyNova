import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storageObjects } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { isProUser } from "@/server/economy";

export const runtime = "nodejs";
const ALLOWED = ["application/pdf", "text/plain", "text/markdown", "application/json", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob 尚未設定，請在 Vercel Production 環境變數加入 BLOB_READ_WRITE_TOKEN");
        const user = await requireUser();
        if (!(await isProUser(user.userId))) throw new Error("英文閱讀器目前為 Nova Pro 專屬功能");
        let payload: { filename?: string } = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch { throw new Error("英文閱讀器上傳參數格式不正確"); }
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: user.userId, filename: payload.filename || "英文閱讀檔案" }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { userId: string; filename: string };
        const metadata = await head(blob.pathname);
        await db.insert(storageObjects).values({ userId: payload.userId, driver: "blob", storageKey: blob.pathname, bucket: "vercel-blob", mimeType: blob.contentType, sizeBytes: metadata.size, filename: payload.filename.slice(0, 180), visibility: "private", data: null }).onConflictDoNothing();
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上傳失敗";
    console.error("[english-reader-blob-upload]", error);
    return NextResponse.json({ ok: false, code: "ENGLISH_READER_BLOB_UPLOAD_FAILED", error: message }, { status: 400 });
  }
}
