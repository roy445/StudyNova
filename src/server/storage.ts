import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storageObjects } from "@/db/schema";
import { fail } from "./core";

export type StorageDriver = "db" | "s3";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 15 * 1024 * 1024);

export const ALLOWED_MIME: Record<string, string[]> = {
  image: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"],
  pdf: ["application/pdf"],
  text: ["text/plain", "text/markdown", "application/json"],
  audio: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/mp3"],
};

export function s3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

export function activeDriver(): StorageDriver {
  return s3Configured() ? "s3" : "db";
}

function extensionOf(filename: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

const EXT_WHITELIST = new Set([
  "png", "jpg", "jpeg", "webp", "heic", "pdf", "txt", "md", "json", "webm", "ogg", "mp3", "m4a", "wav",
]);

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function putObject(params: {
  userId: string | null;
  filename: string;
  mimeType: string;
  data: Buffer;
  allow: Array<keyof typeof ALLOWED_MIME>;
}) {
  const { userId, filename, mimeType, data, allow } = params;
  if (!data.length) throw fail("FILE_EMPTY");
  if (data.length > MAX_BYTES) throw fail("FILE_TOO_LARGE", { hint: `單檔上限為 ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB，請壓縮後再上傳。` });
  const allowedMimes = allow.flatMap((k) => ALLOWED_MIME[k]);
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  if (!allowedMimes.includes(baseMime)) throw fail("FILE_MIME_UNSUPPORTED", { message: `不支援的檔案類型：${baseMime}` });
  const ext = extensionOf(filename);
  if (ext && !EXT_WHITELIST.has(ext)) throw fail("FILE_EXT_UNSUPPORTED", { message: `不支援的副檔名：.${ext}` });

  const driver = activeDriver();
  const storageKey = `${userId ?? "system"}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  if (driver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: storageKey,
        Body: data,
        ContentType: baseMime,
      }),
    );
  }

  const rows = await db
    .insert(storageObjects)
    .values({
      userId,
      driver,
      storageKey,
      bucket: driver === "s3" ? process.env.S3_BUCKET! : "",
      mimeType: baseMime,
      sizeBytes: data.length,
      filename: filename.slice(0, 180),
      data: driver === "db" ? data : null,
    })
    .returning({ id: storageObjects.id, storageKey: storageObjects.storageKey, mimeType: storageObjects.mimeType, sizeBytes: storageObjects.sizeBytes });
  return rows[0];
}

export async function readObject(objectId: string): Promise<{ data: Buffer; mimeType: string; filename: string; userId: string | null }> {
  const rows = await db.select().from(storageObjects).where(eq(storageObjects.id, objectId)).limit(1);
  const row = rows[0];
  if (!row) throw fail("FILE_NOT_FOUND");
  if (row.driver === "s3") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const res = await client.send(new GetObjectCommand({ Bucket: row.bucket, Key: row.storageKey }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw fail("FILE_READ_FAILED");
    return { data: Buffer.from(bytes), mimeType: row.mimeType, filename: row.filename, userId: row.userId };
  }
  if (!row.data) throw fail("FILE_READ_FAILED", { message: "檔案內容遺失" });
  return { data: Buffer.from(row.data), mimeType: row.mimeType, filename: row.filename, userId: row.userId };
}

export async function objectOwner(objectId: string) {
  const rows = await db
    .select({ userId: storageObjects.userId, mimeType: storageObjects.mimeType })
    .from(storageObjects)
    .where(eq(storageObjects.id, objectId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteObject(objectId: string, requesterId: string, isAdmin: boolean) {
  const owner = await objectOwner(objectId);
  if (!owner) throw fail("FILE_NOT_FOUND");
  if (owner.userId !== requesterId && !isAdmin) throw fail("PERM_FILE_DENIED");
  const rows = await db.select().from(storageObjects).where(eq(storageObjects.id, objectId)).limit(1);
  const row = rows[0];
  if (row?.driver === "s3") {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(new DeleteObjectCommand({ Bucket: row.bucket, Key: row.storageKey }));
  }
  await db.delete(storageObjects).where(eq(storageObjects.id, objectId));
}

/* ------------------------------------------------------- signed URLs */

function signingSecret() {
  const secret = process.env.SESSION_SECRET || process.env.STORAGE_SECRET;
  if (!secret) throw fail("FILE_STORAGE_MISCONFIG");
  return secret;
}

export function signObjectUrl(objectId: string, viewerId: string, ttlSec = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac("sha256", signingSecret()).update(`${objectId}.${viewerId}.${exp}`).digest("base64url");
  return `/api/files/${objectId}?exp=${exp}&sig=${sig}&v=${viewerId}`;
}

export function verifyObjectSignature(objectId: string, viewerId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", signingSecret()).update(`${objectId}.${viewerId}.${exp}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function storageHealth() {
  const driver = activeDriver();
  try {
    if (driver === "s3") {
      const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const client = await s3Client();
      await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
      return { status: "healthy" as const, driver, detail: `S3 bucket ${process.env.S3_BUCKET}` };
    }
    await db.select({ id: storageObjects.id }).from(storageObjects).limit(1);
    return { status: "healthy" as const, driver, detail: "PostgreSQL 物件儲存（開發／單機模式）" };
  } catch {
    return { status: "error" as const, driver, detail: "儲存服務無法連線" };
  }
}
