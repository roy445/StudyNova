import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storageObjects, weeklyExamFiles, weeklyExamWeeks } from "@/db/schema";
import { requireAdmin } from "@/server/auth";

const KINDS = ["paper", "answer", "magazine", "word_source", "sentence_source", "extra"] as const;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 未設定，請在 Vercel Production 環境變數加入 Blob token 並重新部署");
        const admin = await requireAdmin();
        let payload: { weekId?: string; fileKind?: string };
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("上傳請求缺少有效的 Weekly 參數");
        }
        if (!payload.weekId || !payload.fileKind || !KINDS.includes(payload.fileKind as (typeof KINDS)[number])) throw new Error("Weekly 上傳參數不正確");
        const week = (await db.select({ id: weeklyExamWeeks.id }).from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, payload.weekId)).limit(1))[0];
        if (!week) throw new Error("找不到 Weekly 週次");
        return {
          allowedContentTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: admin.userId, weekId: payload.weekId, fileKind: payload.fileKind }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { userId: string; weekId: string; fileKind: (typeof KINDS)[number] };
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(weeklyExamFiles).where(and(eq(weeklyExamFiles.weekId, payload.weekId), eq(weeklyExamFiles.fileKind, payload.fileKind)));
        const metadata = await head(blob.pathname);
        const object = (await db.insert(storageObjects).values({ userId: payload.userId, driver: "blob", storageKey: blob.pathname, bucket: "vercel-blob", mimeType: blob.contentType, sizeBytes: metadata.size, filename: blob.pathname.split("/").pop()?.slice(0, 180) || blob.pathname, visibility: "private", data: null }).returning({ id: storageObjects.id }))[0];
        await db.insert(weeklyExamFiles).values({ weekId: payload.weekId, objectId: object.id, fileKind: payload.fileKind, orderIndex: count, ocrStatus: "pending" });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上傳失敗";
    console.error("[weekly-blob-upload]", error);
    return NextResponse.json({ ok: false, code: "WEEKLY_BLOB_UPLOAD_FAILED", error: message }, { status: 400 });
  }
}
