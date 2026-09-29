import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentReadingSegments, ttsJobs, ttsSegments } from "@/db/schema";
import { deleteObject, putObject, signObjectUrl } from "./storage";
import { buildAzureSpeechRequest, wavDurationMs } from "./azure-tts-utils";

type TtsProvider = "azure" | "cosyvoice" | "gpt-sovits";
type RenderedAudio = { audio: Buffer; mimeType: string; filename: string; durationMs: number };

class TtsProviderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TtsProviderError";
  }
}

function serviceUrl() {
  return (process.env.TTS_SERVICE_URL || "").trim().replace(/\/$/, "");
}

function azureRegion() {
  const region = (process.env.AZURE_SPEECH_REGION || "").trim().toLowerCase();
  return /^[a-z0-9-]{2,40}$/.test(region) ? region : "";
}

export function defaultTtsProvider(): TtsProvider {
  if (process.env.AZURE_SPEECH_KEY?.trim() || process.env.AZURE_SPEECH_REGION?.trim()) return "azure";
  return "cosyvoice";
}

export function ttsConfigured(provider: string = defaultTtsProvider()) {
  if (provider === "azure") return Boolean(process.env.AZURE_SPEECH_KEY?.trim() && azureRegion());
  return Boolean(serviceUrl());
}

function requestTimeoutMs() {
  const configuredTimeout = Number(process.env.TTS_REQUEST_TIMEOUT_MS || 120_000);
  return Math.max(5_000, Math.min(Number.isFinite(configuredTimeout) ? configuredTimeout : 120_000, 300_000));
}

async function renderAzureAudio(job: typeof ttsJobs.$inferSelect, text: string, segmentIndex: number, signal: AbortSignal): Promise<RenderedAudio> {
  const key = process.env.AZURE_SPEECH_KEY?.trim() || "";
  const region = azureRegion();
  if (!key || !region) throw new TtsProviderError("TTS_NOT_CONFIGURED", "Azure Speech 未設定，請確認 server-side 的 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION。");

  let request: ReturnType<typeof buildAzureSpeechRequest>;
  try {
    request = buildAzureSpeechRequest({ key, region, text, language: job.language, voice: job.voice, speed: job.speed });
  } catch (error) {
    throw new TtsProviderError("AZURE_TTS_VOICE_UNSUPPORTED", error instanceof Error ? error.message : "Azure 語音或語言設定不支援");
  }

  const response = await fetch(request.url, {
    ...request.init,
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TtsProviderError("AZURE_TTS_AUTH_FAILED", "Azure Speech 驗證失敗；請檢查 Speech key 與 region 是否來自同一個資源。");
    }
    if (response.status === 429) {
      throw new TtsProviderError("AZURE_TTS_QUOTA_OR_RATE_LIMIT", "Azure Speech F0 配額或請求頻率已達限制；F0 免費額度為每月 50 萬字元、每分鐘最多 20 次請求。");
    }
    throw new TtsProviderError(`AZURE_TTS_HTTP_${response.status}`, `Azure Speech 回應 HTTP ${response.status}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new TtsProviderError("AZURE_TTS_EMPTY_AUDIO", "Azure Speech 回傳空音訊。");
  if (audio.length > 50 * 1024 * 1024) throw new TtsProviderError("AZURE_TTS_AUDIO_TOO_LARGE", "Azure Speech 回傳音訊超過 50 MB 上限。");
  return {
    audio,
    mimeType: "audio/wav",
    filename: `studynova-tts-${job.id}-${segmentIndex}.wav`,
    durationMs: wavDurationMs(audio),
  };
}

async function renderWorkerAudio(job: typeof ttsJobs.$inferSelect, text: string, segmentIndex: number, signal: AbortSignal): Promise<RenderedAudio> {
  const endpoint = serviceUrl();
  if (!endpoint) throw new TtsProviderError("TTS_NOT_CONFIGURED", "請設定獨立 TTS Worker 的 TTS_SERVICE_URL。");
  const response = await fetch(`${endpoint}/v1/tts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.TTS_SERVICE_TOKEN ? { authorization: `Bearer ${process.env.TTS_SERVICE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ text, language: job.language, voice: job.voice, speed: job.speed, provider: job.provider }),
    signal,
  });
  if (!response.ok) throw new TtsProviderError("TTS_WORKER_FAILED", `TTS worker HTTP ${response.status}`);
  const payload = await response.json() as { audioBase64?: string; mimeType?: string; durationMs?: number; filename?: string };
  if (!payload.audioBase64) throw new TtsProviderError("TTS_WORKER_FAILED", "TTS worker 沒有回傳 audioBase64");
  if (payload.audioBase64.length > 70_000_000) throw new TtsProviderError("TTS_WORKER_AUDIO_TOO_LARGE", "TTS worker 回傳音訊超過 50 MB 上限");
  const audio = Buffer.from(payload.audioBase64, "base64");
  if (!audio.length || audio.length > 50 * 1024 * 1024) throw new TtsProviderError("TTS_WORKER_AUDIO_INVALID", "TTS worker 回傳空音訊或超過 50 MB 上限");
  return {
    audio,
    mimeType: payload.mimeType || "audio/wav",
    filename: payload.filename || `studynova-tts-${job.id}-${segmentIndex}.wav`,
    durationMs: Number.isFinite(Number(payload.durationMs ?? 0)) ? Math.max(0, Number(payload.durationMs ?? 0)) : 0,
  };
}

export async function processTtsJob(jobId: string) {
  const job = (await db.select().from(ttsJobs).where(eq(ttsJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("找不到 TTS 工作");
  if (["completed", "cancelled"].includes(job.status)) return job;
  const provider: TtsProvider = job.provider === "azure" ? "azure" : job.provider === "gpt-sovits" ? "gpt-sovits" : "cosyvoice";
  if (!ttsConfigured(provider)) {
    const message = provider === "azure"
      ? "請設定 Azure Speech server-side 的 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION。"
      : "請設定獨立 TTS Worker 的 TTS_SERVICE_URL；Next.js 不會在 serverless 內載入模型。";
    await db.update(ttsJobs).set({ status: "failed", errorCode: "TTS_NOT_CONFIGURED", errorMessage: message, updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
    throw new TtsProviderError("TTS_NOT_CONFIGURED", message);
  }

  await db.update(ttsJobs).set({ status: "processing", updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
  const segments = await db.select().from(ttsSegments).where(eq(ttsSegments.jobId, job.id)).orderBy(asc(ttsSegments.segmentIndex));
  for (const segment of segments) {
    if (segment.status === "completed") continue;
    const timeoutMs = requestTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let storedObjectId: string | null = null;
    try {
      const rendered = provider === "azure"
        ? await renderAzureAudio(job, segment.text, segment.segmentIndex, controller.signal)
        : await renderWorkerAudio(job, segment.text, segment.segmentIndex, controller.signal);
      const stored = await putObject({ userId: job.userId, filename: rendered.filename, mimeType: rendered.mimeType, data: rendered.audio, allow: ["audio"] });
      storedObjectId = stored.id;
      await db.update(ttsSegments).set({ status: "completed", objectId: stored.id, durationMs: Math.max(0, Math.round(rendered.durationMs)), updatedAt: new Date() }).where(eq(ttsSegments.id, segment.id));
      storedObjectId = null;
      const done = segments.filter((item) => item.status === "completed").length + 1;
      await db.update(ttsJobs).set({ progress: Math.min(1, done / Math.max(1, segments.length)), updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
    } catch (error) {
      if (storedObjectId && job.userId) await deleteObject(storedObjectId, job.userId, false).catch(() => undefined);
      const timedOut = error instanceof Error && error.name === "AbortError";
      const providerError = error instanceof TtsProviderError ? error : null;
      const message = timedOut
        ? `${provider === "azure" ? "Azure Speech" : "TTS worker"} 逾時（${timeoutMs} 毫秒）`
        : error instanceof Error ? error.message.slice(0, 1000) : "TTS 產生失敗";
      const errorCode = timedOut
        ? provider === "azure" ? "AZURE_TTS_TIMEOUT" : "TTS_WORKER_TIMEOUT"
        : providerError?.code ?? (provider === "azure" ? "AZURE_TTS_FAILED" : "TTS_WORKER_FAILED");
      await db.update(ttsSegments).set({ status: "failed", errorMessage: message, updatedAt: new Date() }).where(eq(ttsSegments.id, segment.id));
      await db.update(ttsJobs).set({ status: "failed", errorCode, errorMessage: message, updatedAt: new Date() }).where(eq(ttsJobs.id, job.id));
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
