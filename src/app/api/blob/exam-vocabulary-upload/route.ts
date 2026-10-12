import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { examVocabularyImportJobs, examVocabularySets, examVocabularyUnits, storageObjects } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { queue } from "@/server/queue";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
type Payload = { setId: string; unitTitle?: string; filename: string };

function parsePayload(value: string | null | undefined) {
  if (!value) throw new Error("缺少英文段考上傳授權資料");
  const parsed = JSON.parse(value) as Partial<Payload>;
  if (!parsed.setId || !parsed.filename) throw new Error("英文段考上傳授權資料不完整");
  return parsed as Payload;
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 未設定，請在 Vercel Production 環境變數加入 Blob token 並重新部署");
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        if (!pathname.startsWith(`exam-vocabulary/${payload.setId}/`)) throw new Error("英文段考上傳路徑驗證失敗");
        const set = (await db.select({ id: examVocabularySets.id }).from(examVocabularySets).where(eq(examVocabularySets.id, payload.setId)).limit(1))[0];
        if (!set) throw new Error("找不到英文段考總範圍");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify(payload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parsePayload(tokenPayload);
        if (!blob.pathname.startsWith(`exam-vocabulary/${payload.setId}/`)) throw new Error("英文段考檔案路徑驗證失敗");
        const set = (await db.select({ id: examVocabularySets.id }).from(examVocabularySets).where(eq(examVocabularySets.id, payload.setId)).limit(1))[0];
        if (!set) throw new Error("找不到英文段考總範圍");
        const metadata = await head(blob.pathname);
        const mimeType = String(metadata.contentType || blob.contentType || "").split(";")[0].trim().toLowerCase();
        if (!metadata.size || metadata.size > MAX_FILE_BYTES || !ALLOWED.includes(mimeType)) throw new Error("檔案大小或格式不符合限制");
        const existing = (await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.storageKey, blob.pathname)).limit(1))[0];
        const storedId = existing?.id ?? (await db.insert(storageObjects).values({ userId: admin.userId, driver: "blob", storageKey: blob.pathname, bucket: "vercel-blob", mimeType, sizeBytes: Number(metadata.size), filename: payload.filename.slice(0, 180), visibility: "private", data: null }).returning({ id: storageObjects.id }))[0].id;
        const unitName = payload.unitTitle || "未分類單元";
        let unit = (await db.select({ id: examVocabularyUnits.id }).from(examVocabularyUnits).where(and(eq(examVocabularyUnits.setId, set.id), eq(examVocabularyUnits.title, unitName))).limit(1))[0];
        if (!unit) unit = (await db.insert(examVocabularyUnits).values({ setId: set.id, title: unitName }).returning({ id: examVocabularyUnits.id }))[0];
        const job = (await db.insert(examVocabularyImportJobs).values({ setId: set.id, unitId: unit.id, uploadedBy: admin.userId, objectId: storedId, filename: payload.filename.slice(0, 500), status: "queued", progress: 0 }).returning({ id: examVocabularyImportJobs.id }))[0];
        await queue().enqueue({ name: "exam_vocabulary_import", payload: { jobId: job.id }, uniqueKey: `exam-vocabulary-import:${job.id}` });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "英文段考直傳失敗" }, { status: 400 });
  }
}
