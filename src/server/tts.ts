import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentReadingSegments, ttsJobs, ttsSegments } from "@/db/schema";
import { deleteObject, putObject, signObjectUrl } from "./storage";

function serviceUrl() {
  return (process.env.TTS_SERVICE_URL || "").trim().replace(/\/$/, "");
}

export function ttsConfigured() {
  return Boolean(serviceUrl());
}

export async function processTtsJob(jobId: string) {
  const job = (await db.select().from(ttsJobs).where(eq(ttsJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("找不到 TTS 工作");
  if (["completed", "cancelled"].includes(job.status)) return job;
  const endpoint = serviceUrl();
  if (!endpoint) {
    await db.update(ttsJobs).set({ status: "failed", errorCode: "TTS_NOT_CONFIGURED", errorMessage: "請設定獨立 TTS Worker 的 TTS_SERVICE_URL；Next.js 不會在 serverless 內載入模型。", updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
    throw new Error("TTS_NOT_CONFIGURED");
  }
  await db.update(ttsJobs).set({ status: "processing", updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
  const segments = await db.select().from(ttsSegments).where(eq(ttsSegments.jobId, job.id)).orderBy(asc(ttsSegments.segmentIndex));
  for (const segment of segments) {
    if (segment.status === "completed") continue;
    const configuredTimeout = Number(process.env.TTS_REQUEST_TIMEOUT_MS || 120_000);
    const timeoutMs = Math.max(5_000, Math.min(Number.isFinite(configuredTimeout) ? configuredTimeout : 120_000, 300_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let storedObjectId: string | null = null;
    try {
      const response = await fetch(`${endpoint}/v1/tts`, { method: "POST", headers: { "content-type": "application/json", ...(process.env.TTS_SERVICE_TOKEN ? { authorization: `Bearer ${process.env.TTS_SERVICE_TOKEN}` } : {}) }, body: JSON.stringify({ text: segment.text, language: job.language, voice: job.voice, speed: job.speed, provider: job.provider }), signal: controller.signal });
      if (!response.ok) throw new Error(`TTS worker HTTP ${response.status}`);
      const payload = await response.json() as { audioBase64?: string; mimeType?: string; durationMs?: number; filename?: string };
      if (!payload.audioBase64) throw new Error("TTS worker 沒有回傳 audioBase64");
      if (payload.audioBase64.length > 70_000_000) throw new Error("TTS worker 回傳音訊超過 50 MB 上限");
      const mimeType = payload.mimeType || "audio/wav";
      const stored = await putObject({ userId: job.userId, filename: payload.filename || `studynova-tts-${segment.segmentIndex}.wav`, mimeType, data: Buffer.from(payload.audioBase64, "base64"), allow: ["audio"] });
      storedObjectId = stored.id;
      await db.update(ttsSegments).set({ status: "completed", objectId: stored.id, durationMs: Math.max(0, Number(payload.durationMs ?? 0)), updatedAt: new Date() }).where(eq(ttsSegments.id, segment.id));
      storedObjectId = null;
      const done = segments.filter((item) => item.status === "completed").length + 1;
      await db.update(ttsJobs).set({ progress: Math.min(1, done / Math.max(1, segments.length)), updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
    } catch (error) {
      if (storedObjectId && job.userId) await deleteObject(storedObjectId, job.userId, false).catch(() => undefined);
      const timedOut = error instanceof Error && error.name === "AbortError";
      const message = timedOut ? `TTS worker 逾時（${timeoutMs} 毫秒）` : error instanceof Error ? error.message.slice(0, 1000) : "TTS 產生失敗";
      await db.update(ttsSegments).set({ status: "failed", errorMessage: message, updatedAt: new Date() }).where(eq(ttsSegments.id, segment.id));
      await db.update(ttsJobs).set({ status: "failed", errorCode: timedOut ? "TTS_WORKER_TIMEOUT" : "TTS_WORKER_FAILED", errorMessage: message, updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  const completed = await db.update(ttsJobs).set({ status: "completed", progress: 1, completedAt: new Date(), updatedAt: new Date() }).where(eq(ttsJobs.id, job.id)).returning();
  return completed[0] ?? job;
}

export async function ttsJobView(jobId: string, userId: string) {
  const job = (await db.select().from(ttsJobs).where(and(eq(ttsJobs.id, jobId), eq(ttsJobs.userId, userId))).limit(1))[0];
  if (!job) return null;
  const segments = await db.select().from(ttsSegments).where(eq(ttsSegments.jobId, job.id)).orderBy(asc(ttsSegments.segmentIndex));
  return { job, segments: segments.map((segment) => ({ ...segment, audioUrl: segment.objectId ? signObjectUrl(segment.objectId, userId, 900) : null })) };
}

export async function createTtsSegmentsFromDocument(jobId: string, documentId: string) {
  const rows = await db.select({ text: contentReadingSegments.text, orderIndex: contentReadingSegments.orderIndex }).from(contentReadingSegments).where(eq(contentReadingSegments.documentId, documentId)).orderBy(asc(contentReadingSegments.orderIndex));
  if (!rows.length) throw new Error("教材尚未完成內容理解，沒有可朗讀區段");
  await db.insert(ttsSegments).values(rows.map((row) => ({ jobId, segmentIndex: row.orderIndex, text: row.text, status: "queued" })));
}
