import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiBackgroundBatches,
  aiBackgroundItems,
  aiBackgroundJobs,
  aiBackgroundUsageClaims,
  aiArtifacts,
  examQuestionGenerationJobs,
  examQuestionGenerationItems,
  questions,
} from "@/db/schema";
import { consumeFeature } from "./economy";
import { analyzeQuestionWithAi } from "./question-analysis";
import { generateExamQuestion } from "./exam-question-generation";
import { runAiJson } from "./ai";
import { chooseIllustration, normalizeVisualNote, renderVisualNote } from "./visual-note";
import { deleteObject, putObject } from "./storage";
import { understandMaterial } from "./content-understanding";

export type AiBackgroundStatus = "queued" | "processing" | "paused" | "completed" | "partial" | "failed" | "cancelled";
export type AiBackgroundItemStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type AiBackgroundCreateInput = {
  userId: string;
  kind: string;
  feature: string;
  items: Array<Record<string, unknown>>;
  batchSize?: number;
  idempotencyKey: string;
  input?: Record<string, unknown>;
  provider?: string;
  model?: string;
  maxRetries?: number;
};

export type AiBackgroundProgress = {
  id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  percent: number;
  remainingItems: number;
  startedAt: Date | null;
  completedAt: Date | null;
  averageItemMs: number | null;
  nextRunAt: Date | null;
};

export class AiBackgroundError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AiBackgroundError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function classifyAiBackgroundError(error: unknown): { code: string; message: string; retryable: boolean } {
  const message = error instanceof Error ? error.message : String(error ?? "未知錯誤");
  const statusMatch = message.match(/\b(400|401|403|404|422|429|500|502|503|504)\b/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const retryable = status === 429 || status >= 500 || /timeout|timed out|network|ECONNRESET|ETIMEDOUT/i.test(message);
  const code = status ? `HTTP_${status}` : retryable ? "TRANSIENT_ERROR" : "AI_ITEM_FAILED";
  return { code, message: message.slice(0, 1000), retryable };
}

export function retryDelayMs(retryCount: number): number {
  const safeCount = Math.max(1, Math.min(retryCount, 8));
  return Math.min(15 * 60_000, 1_000 * 2 ** (safeCount - 1));
}

export async function createAiBackgroundJob(input: AiBackgroundCreateInput) {
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 20, 100));
  const maxRetries = Math.max(0, Math.min(input.maxRetries ?? 3, 8));
  if (!input.items.length) throw new AiBackgroundError("AI_JOB_EMPTY", "至少需要一個分析項目。");

  const existing = (await db.select().from(aiBackgroundJobs).where(and(eq(aiBackgroundJobs.userId, input.userId), eq(aiBackgroundJobs.idempotencyKey, input.idempotencyKey))).limit(1))[0];
  if (existing) return { job: existing, deduplicated: true };

  const job = await db.transaction(async (tx) => {
    const created = (await tx.insert(aiBackgroundJobs).values({
      userId: input.userId,
      kind: input.kind,
      feature: input.feature,
      totalItems: input.items.length,
      batchSize,
      input: input.input ?? {},
      provider: input.provider ?? "",
      model: input.model ?? "",
      idempotencyKey: input.idempotencyKey,
      status: "queued",
    }).returning())[0];
    if (!created) throw new AiBackgroundError("AI_JOB_CREATE_FAILED", "無法建立 AI 背景工作。");

    for (let start = 0; start < input.items.length; start += batchSize) {
      const batchItems = input.items.slice(start, start + batchSize);
      const batch = (await tx.insert(aiBackgroundBatches).values({
        jobId: created.id,
        batchIndex: Math.floor(start / batchSize),
        totalItems: batchItems.length,
        status: "queued",
      }).returning())[0];
      if (!batch) throw new AiBackgroundError("AI_BATCH_CREATE_FAILED", "無法建立 AI 批次。");
      await tx.insert(aiBackgroundItems).values(batchItems.map((item, offset) => ({
        jobId: created.id,
        batchId: batch.id,
        itemIndex: start + offset,
        input: item,
        idempotencyKey: `${input.idempotencyKey}:item:${start + offset}`,
        maxRetries,
        status: "queued",
      })));
    }
    return created;
  });
  return { job, deduplicated: false };
}

export async function getAiBackgroundProgress(jobId: string): Promise<AiBackgroundProgress | null> {
  const job = (await db.select().from(aiBackgroundJobs).where(eq(aiBackgroundJobs.id, jobId)).limit(1))[0];
  if (!job) return null;
  const completedAt = job.completedAt?.getTime() ?? 0;
  const startedAt = job.startedAt?.getTime() ?? 0;
  const averageItemMs = completedAt > startedAt && job.completedItems > 0 ? Math.round((completedAt - startedAt) / job.completedItems) : null;
  const nextBatch = (await db.select({ nextRunAt: aiBackgroundBatches.nextRunAt }).from(aiBackgroundBatches).where(and(eq(aiBackgroundBatches.jobId, jobId), inArray(aiBackgroundBatches.status, ["queued", "processing"]))).orderBy(asc(aiBackgroundBatches.nextRunAt)).limit(1))[0];
  return {
    id: job.id,
    status: job.status,
    totalItems: job.totalItems,
    completedItems: job.completedItems,
    failedItems: job.failedItems,
    skippedItems: job.skippedItems,
    percent: job.totalItems ? Math.round((job.completedItems / job.totalItems) * 1000) / 10 : 0,
    remainingItems: Math.max(0, job.totalItems - job.completedItems - job.failedItems - job.skippedItems),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    averageItemMs,
    nextRunAt: nextBatch?.nextRunAt ?? null,
  };
}

async function processItem(job: typeof aiBackgroundJobs.$inferSelect, item: typeof aiBackgroundItems.$inferSelect) {
  const input = item.input ?? {};
  if (job.kind === "visual_note") {
    const title = typeof input.title === "string" ? input.title : "我的學習重點";
    const sourceText = typeof input.sourceText === "string" ? input.sourceText : "";
    const style = input.style === "handwritten" || input.style === "doodle" || input.style === "sticker" || input.style === "clean" ? input.style : "cute";
    const { data } = await runAiJson<{ title?: string; central?: string; nodes?: unknown[] }>({
      feature: "ai_visual_note",
      userId: job.userId,
      system: "你是 StudyNova 的學習重點整理器。請把教材整理成適合心智圖的繁體中文結構。只輸出 JSON：title、central、nodes。nodes 最多 8 個，每個 children 最多 8 個。保留重要英文術語與公式，不要捏造教材沒有的資訊。summary 要短而清楚。",
      parts: [{ kind: "text", text: `標題：${title}\n視覺風格：${style}\n教材：\n${sourceText}` }],
      maxOutputTokens: 2800,
    }, { title, central: title, nodes: [] });
    const illustration = await chooseIllustration({ keywords: sourceText.split(/\s+/).slice(0, 12), context: "mind_map" });
    const visual = normalizeVisualNote({ ...data, title, style, icon: typeof input.icon === "string" ? input.icon : illustration.icon, illustrationId: illustration.id, illustrationUrl: illustration.url });
    const rendered = await renderVisualNote(visual);
    const stored = await putObject({ userId: job.userId, filename: `${title.slice(0, 60)}.png`, mimeType: "image/png", data: rendered.data, allow: ["image"] });
    let artifact: { id: string } | undefined;
    try {
      artifact = (await db.insert(aiArtifacts).values({ userId: job.userId!, kind: "mind_map", title: visual.title, objectId: stored.id, preview: sourceText.slice(0, 500), metadata: { mimeType: "image/png", renderer: rendered.renderer, illustrationId: illustration.id, visual } }).returning({ id: aiArtifacts.id }))[0];
    } catch (error) {
      if (job.userId) await deleteObject(stored.id, job.userId, false).catch(() => undefined);
      throw error;
    }
    return { visual, artifactId: artifact?.id ?? null, objectId: stored.id, mimeType: "image/png" };
  }
  if (job.kind === "content_understanding") {
    const materialId = typeof input.materialId === "string" ? input.materialId : "";
    if (!materialId || !job.userId) throw new AiBackgroundError("AI_INPUT_INVALID", "缺少教材理解必要資料。", false);
    return understandMaterial({ materialId, userId: job.userId });
  }
  if (job.kind === "question_analysis") {
    const questionId = typeof input.questionId === "string" ? input.questionId : "";
    if (!questionId) throw new AiBackgroundError("AI_INPUT_INVALID", "缺少 questionId。");
    const question = (await db.select().from(questions).where(eq(questions.id, questionId)).limit(1))[0];
    if (!question) throw new AiBackgroundError("AI_INPUT_NOT_FOUND", "找不到待分析題目。");
    return analyzeQuestionWithAi(question, job.userId ?? "system");
  }
  if (job.kind === "exam_question_generation") {
    const generationItemId = typeof input.generationItemId === "string" ? input.generationItemId : "";
    const requirements = (job.input?.requirements ?? {}) as Parameters<typeof generateExamQuestion>[0]["requirements"];
    if (!generationItemId || !requirements.subject) throw new AiBackgroundError("AI_INPUT_INVALID", "缺少段考生成工作必要資料。");
    const result = await generateExamQuestion({
      requirements,
      itemIndex: Number(input.itemIndex ?? 0),
      candidates: Array.isArray(job.input?.candidates) ? job.input.candidates as Array<Record<string, unknown>> : [],
      materialText: typeof job.input?.materialText === "string" ? job.input.materialText : "",
      userId: job.userId ?? "system",
      sourcePolicy: (job.input?.sourcePolicy ?? {}) as Record<string, unknown>,
    });
    const itemStatus = result.quality.answerConflict ? "answer_conflict" : result.quality.passed ? "generated" : "quality_failed";
    await db.update(examQuestionGenerationItems).set({ draft: result.draft, quality: result.quality, analysis: (result.draft.analysis ?? {}) as Record<string, unknown>, sourceMetadata: (result.draft.sourceMetadata ?? {}) as Record<string, unknown>, status: itemStatus, updatedAt: new Date() }).where(eq(examQuestionGenerationItems.id, generationItemId));
    const counts = (await db.select({ total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${examQuestionGenerationItems.status} in ('generated','quality_failed','answer_conflict'))::int`, failed: sql<number>`count(*) filter (where ${examQuestionGenerationItems.status} in ('quality_failed','answer_conflict'))::int` }).from(examQuestionGenerationItems).where(eq(examQuestionGenerationItems.jobId, job.input?.generationJobId as string)))[0];
    if (counts && Number(counts.total) === Number(counts.done)) await db.update(examQuestionGenerationJobs).set({ status: Number(counts.failed) ? "partially_failed" : "ready", qualitySummary: { total: counts.total, failed: counts.failed }, updatedAt: new Date() }).where(eq(examQuestionGenerationJobs.id, job.input?.generationJobId as string));
    return result;
  }
  throw new AiBackgroundError("AI_PROCESSOR_NOT_REGISTERED", `尚未註冊背景分析類型：${job.kind}`);
}

async function claimUsage(job: typeof aiBackgroundJobs.$inferSelect, item: typeof aiBackgroundItems.$inferSelect) {
  const quotaByKind: Record<string, string> = {
    visual_note: "ai_visual",
    content_understanding: "material_organize",
    question_analysis: "question_analysis",
    exam_question_generation: "exam_question_generation",
  };
  const quotaFeature = quotaByKind[job.kind];
  const units = 1;
  if (job.userId && (!quotaFeature || job.feature !== quotaFeature)) {
    throw new AiBackgroundError("AI_QUOTA_POLICY_UNKNOWN", "這種 AI 背景工作沒有有效的伺服器配額政策。", false);
  }
  const key = `ai-job:${job.id}:item:${item.id}`;
  const claimed = (await db.insert(aiBackgroundUsageClaims).values({ jobId: job.id, itemId: item.id, userId: job.userId, idempotencyKey: key, units }).onConflictDoNothing().returning({ id: aiBackgroundUsageClaims.id }))[0];
  if (!claimed) return false;
  try {
    if (job.userId && quotaFeature) await consumeFeature(job.userId, quotaFeature, units, key);
    return true;
  } catch (error) {
    await db.delete(aiBackgroundUsageClaims).where(eq(aiBackgroundUsageClaims.id, claimed.id));
    throw error;
  }
}

async function updateJobCounters(jobId: string) {
  const counts = (await db.select({
    completed: sql<number>`count(*) filter (where ${aiBackgroundItems.status} = 'completed')::int`,
    failed: sql<number>`count(*) filter (where ${aiBackgroundItems.status} = 'failed')::int`,
    cancelled: sql<number>`count(*) filter (where ${aiBackgroundItems.status} = 'cancelled')::int`,
  }).from(aiBackgroundItems).where(eq(aiBackgroundItems.jobId, jobId)))[0];
  const job = (await db.select().from(aiBackgroundJobs).where(eq(aiBackgroundJobs.id, jobId)).limit(1))[0];
  if (!job || !counts) return;
  const terminal = Number(counts.completed) + Number(counts.failed) + Number(counts.cancelled) >= job.totalItems;
  const status: AiBackgroundStatus = terminal ? (Number(counts.failed) > 0 ? (Number(counts.completed) > 0 ? "partial" : "failed") : "completed") : job.status === "paused" || job.status === "cancelled" ? job.status : "processing";
  await db.update(aiBackgroundJobs).set({ completedItems: Number(counts.completed), failedItems: Number(counts.failed), skippedItems: Number(counts.cancelled), status, completedAt: terminal ? new Date() : null, updatedAt: new Date() }).where(eq(aiBackgroundJobs.id, jobId));
}

export async function processAiBackgroundBatch(jobId: string, workerId = `worker:${process.pid}`) {
  const job = (await db.select().from(aiBackgroundJobs).where(eq(aiBackgroundJobs.id, jobId)).limit(1))[0];
  if (!job) throw new AiBackgroundError("AI_JOB_NOT_FOUND", "找不到 AI 背景工作。");
  if (["completed", "partial", "failed", "cancelled", "paused"].includes(job.status)) return getAiBackgroundProgress(jobId);

  const now = new Date();
  const batch = (await db.select().from(aiBackgroundBatches).where(and(eq(aiBackgroundBatches.jobId, jobId), inArray(aiBackgroundBatches.status, ["queued", "processing"]), lte(aiBackgroundBatches.nextRunAt, now))).orderBy(asc(aiBackgroundBatches.batchIndex)).limit(1))[0];
  if (!batch) {
    await updateJobCounters(jobId);
    return getAiBackgroundProgress(jobId);
  }
  const claimedBatch = (await db.update(aiBackgroundBatches).set({ status: "processing", lockedBy: workerId, lockedAt: now, startedAt: batch.startedAt ?? now, updatedAt: now }).where(and(eq(aiBackgroundBatches.id, batch.id), or(eq(aiBackgroundBatches.status, "queued"), and(eq(aiBackgroundBatches.status, "processing"), sql`${aiBackgroundBatches.lockedAt} < now() - interval '10 minutes'`)))).returning())[0];
  if (!claimedBatch) return getAiBackgroundProgress(jobId);
  await db.update(aiBackgroundJobs).set({ status: "processing", startedAt: job.startedAt ?? now, updatedAt: now }).where(eq(aiBackgroundJobs.id, jobId));

  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const staleItems = await db.select().from(aiBackgroundItems).where(and(eq(aiBackgroundItems.batchId, batch.id), eq(aiBackgroundItems.status, "processing"), lte(aiBackgroundItems.updatedAt, staleBefore)));
  for (const stale of staleItems) {
    const nextRetry = stale.retryCount + 1;
    const finalFailure = nextRetry > stale.maxRetries;
    await db.update(aiBackgroundItems).set({ status: finalFailure ? "failed" : "queued", retryCount: nextRetry, errorCode: "AI_WORKER_INTERRUPTED", errorMessage: "背景工作逾時中斷，系統已回收工作並安排重試。", completedAt: finalFailure ? now : null, updatedAt: now }).where(and(eq(aiBackgroundItems.id, stale.id), eq(aiBackgroundItems.status, "processing"), lte(aiBackgroundItems.updatedAt, staleBefore)));
  }

  const items = await db.select().from(aiBackgroundItems).where(and(eq(aiBackgroundItems.batchId, batch.id), inArray(aiBackgroundItems.status, ["queued", "failed"]))).orderBy(asc(aiBackgroundItems.itemIndex));
  for (const item of items) {
    const liveJob = (await db.select({ status: aiBackgroundJobs.status }).from(aiBackgroundJobs).where(eq(aiBackgroundJobs.id, jobId)).limit(1))[0];
    if (liveJob?.status === "cancelled" || liveJob?.status === "paused") break;
    if (item.status === "failed" && item.retryCount >= item.maxRetries) continue;
    const started = Date.now();
    const claimedItem = (await db.update(aiBackgroundItems).set({ status: "processing", startedAt: new Date(), errorCode: "", errorMessage: "", updatedAt: new Date() }).where(and(eq(aiBackgroundItems.id, item.id), or(eq(aiBackgroundItems.status, "queued"), eq(aiBackgroundItems.status, "failed")), sql`${aiBackgroundItems.retryCount} < ${aiBackgroundItems.maxRetries} + 1`)).returning())[0];
    if (!claimedItem) continue;
    try {
      await claimUsage(job, claimedItem);
      const output = await processItem(job, claimedItem);
      const outputRecord = output as { result?: unknown };
      await db.update(aiBackgroundItems).set({ status: "completed", output: (outputRecord.result ?? output) as Record<string, unknown>, latencyMs: Date.now() - started, completedAt: new Date(), updatedAt: new Date() }).where(eq(aiBackgroundItems.id, claimedItem.id));
    } catch (error) {
      const failure = classifyAiBackgroundError(error);
      const nextRetry = claimedItem.retryCount + 1;
      const finalFailure = !failure.retryable || nextRetry > claimedItem.maxRetries;
      await db.update(aiBackgroundItems).set({ status: finalFailure ? "failed" : "queued", retryCount: nextRetry, errorCode: failure.code, errorMessage: failure.message, latencyMs: Date.now() - started, completedAt: finalFailure ? new Date() : null, updatedAt: new Date() }).where(eq(aiBackgroundItems.id, claimedItem.id));
      if (!finalFailure) await db.update(aiBackgroundBatches).set({ nextRunAt: new Date(Date.now() + retryDelayMs(nextRetry)), retryCount: nextRetry, errorCode: failure.code, errorMessage: failure.message, updatedAt: new Date() }).where(eq(aiBackgroundBatches.id, batch.id));
    }
    await updateJobCounters(jobId);
  }
  const pending = (await db.select({ count: sql<number>`count(*)::int` }).from(aiBackgroundItems).where(and(eq(aiBackgroundItems.batchId, batch.id), inArray(aiBackgroundItems.status, ["queued", "processing"]))).limit(1))[0]?.count ?? 0;
  await db.update(aiBackgroundBatches).set({ status: Number(pending) > 0 ? "queued" : "completed", completedItems: sql`(select count(*) from ai_background_items where batch_id = ${batch.id} and status = 'completed')`, failedItems: sql`(select count(*) from ai_background_items where batch_id = ${batch.id} and status = 'failed')`, completedAt: Number(pending) > 0 ? null : new Date(), lockedBy: "", lockedAt: null, updatedAt: new Date() }).where(eq(aiBackgroundBatches.id, batch.id));
  await updateJobCounters(jobId);
  return getAiBackgroundProgress(jobId);
}

export async function pauseAiBackgroundJob(jobId: string, userId?: string) {
  const where = userId ? and(eq(aiBackgroundJobs.id, jobId), eq(aiBackgroundJobs.userId, userId)) : eq(aiBackgroundJobs.id, jobId);
  const updated = (await db.update(aiBackgroundJobs).set({ status: "paused", pausedAt: new Date(), updatedAt: new Date() }).where(and(where, inArray(aiBackgroundJobs.status, ["queued", "processing"]))).returning({ id: aiBackgroundJobs.id }))[0];
  return Boolean(updated);
}

export async function resumeAiBackgroundJob(jobId: string, userId?: string) {
  const where = userId ? and(eq(aiBackgroundJobs.id, jobId), eq(aiBackgroundJobs.userId, userId)) : eq(aiBackgroundJobs.id, jobId);
  const updated = (await db.update(aiBackgroundJobs).set({ status: "queued", pausedAt: null, updatedAt: new Date() }).where(and(where, eq(aiBackgroundJobs.status, "paused"))).returning({ id: aiBackgroundJobs.id }))[0];
  if (!updated) return false;
  await db.update(aiBackgroundBatches).set({ status: "queued", nextRunAt: new Date(), updatedAt: new Date() }).where(and(eq(aiBackgroundBatches.jobId, jobId), eq(aiBackgroundBatches.status, "paused")));
  return true;
}

export async function cancelAiBackgroundJob(jobId: string, userId?: string) {
  const where = userId ? and(eq(aiBackgroundJobs.id, jobId), eq(aiBackgroundJobs.userId, userId)) : eq(aiBackgroundJobs.id, jobId);
  const updated = (await db.update(aiBackgroundJobs).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(where).returning({ id: aiBackgroundJobs.id }))[0];
  if (!updated) return false;
  await db.update(aiBackgroundItems).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiBackgroundItems.jobId, jobId), inArray(aiBackgroundItems.status, ["queued", "processing"])));
  await db.update(aiBackgroundBatches).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiBackgroundBatches.jobId, jobId), inArray(aiBackgroundBatches.status, ["queued", "processing"])));
  return true;
}

export async function retryFailedAiBackgroundItems(jobId: string, userId?: string) {
  const jobWhere = userId ? and(eq(aiBackgroundJobs.id, jobId), eq(aiBackgroundJobs.userId, userId)) : eq(aiBackgroundJobs.id, jobId);
  const job = (await db.select().from(aiBackgroundJobs).where(jobWhere).limit(1))[0];
  if (!job) return null;
  await db.update(aiBackgroundItems).set({ status: "queued", retryCount: 0, errorCode: "", errorMessage: "", completedAt: null, updatedAt: new Date() }).where(and(eq(aiBackgroundItems.jobId, jobId), eq(aiBackgroundItems.status, "failed")));
  await db.update(aiBackgroundBatches).set({ status: "queued", retryCount: 0, errorCode: "", errorMessage: "", completedAt: null, nextRunAt: new Date(), updatedAt: new Date() }).where(and(eq(aiBackgroundBatches.jobId, jobId), eq(aiBackgroundBatches.status, "failed")));
  await db.update(aiBackgroundJobs).set({ status: "queued", completedAt: null, lastErrorCode: "", lastErrorMessage: "", updatedAt: new Date() }).where(eq(aiBackgroundJobs.id, jobId));
  return getAiBackgroundProgress(jobId);
}
