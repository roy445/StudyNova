import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiBackgroundBatches, aiBackgroundItems, aiBackgroundJobs } from "@/db/schema";
import { notFound } from "../core";
import { route } from "../router";
import { cancelAiBackgroundJob, createAiBackgroundJob, getAiBackgroundProgress, pauseAiBackgroundJob, resumeAiBackgroundJob, retryFailedAiBackgroundItems } from "../ai-background";
import { queue } from "../queue";

const itemSchema = z.record(z.string(), z.unknown());
const createSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  feature: z.string().trim().min(1).max(120),
  items: z.array(itemSchema).min(1).max(100_000),
  batchSize: z.number().int().min(1).max(100).optional(),
  idempotencyKey: z.string().trim().min(1).max(240),
  input: z.record(z.string(), z.unknown()).optional(),
  provider: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  maxRetries: z.number().int().min(0).max(8).optional(),
});

async function enqueue(jobId: string, runAt?: Date | null) {
  await queue().enqueue({ name: "ai_background_batch", payload: { jobId }, uniqueKey: `ai-background:${jobId}:wake:${Date.now()}`, runAt: runAt ?? undefined });
  void queue().drain(1);
}

export const routes = [
  route({
    method: "POST", path: "/ai/background-jobs", auth: "user", rate: { limit: 10, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(createSchema);
      const created = await createAiBackgroundJob({ ...body, userId: user.userId });
      if (!created.deduplicated) await enqueue(created.job.id);
      return { job: created.job, deduplicated: created.deduplicated, progress: await getAiBackgroundProgress(created.job.id) };
    },
  }),
  route({
    method: "GET", path: "/ai/background-jobs", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(aiBackgroundJobs).where(eq(aiBackgroundJobs.userId, user.userId)).orderBy(desc(aiBackgroundJobs.createdAt)).limit(100);
      return { jobs: await Promise.all(rows.map(async (job) => ({ ...job, progress: await getAiBackgroundProgress(job.id) }))) };
    },
  }),
  route({
    method: "GET", path: "/ai/background-jobs/:id", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const job = (await db.select().from(aiBackgroundJobs).where(and(eq(aiBackgroundJobs.id, ctx.params.id), eq(aiBackgroundJobs.userId, user.userId))).limit(1))[0];
      if (!job) throw notFound("找不到 AI 背景工作");
      const [batches, items] = await Promise.all([
        db.select().from(aiBackgroundBatches).where(eq(aiBackgroundBatches.jobId, job.id)).orderBy(asc(aiBackgroundBatches.batchIndex)),
        db.select().from(aiBackgroundItems).where(eq(aiBackgroundItems.jobId, job.id)).orderBy(asc(aiBackgroundItems.itemIndex)),
      ]);
      return { job, progress: await getAiBackgroundProgress(job.id), batches, items };
    },
  }),
  route({
    method: "POST", path: "/ai/background-jobs/:id/pause", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await pauseAiBackgroundJob(ctx.params.id, user.userId))) throw notFound("找不到可暫停的 AI 背景工作");
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/ai/background-jobs/:id/resume", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await resumeAiBackgroundJob(ctx.params.id, user.userId))) throw notFound("找不到可恢復的 AI 背景工作");
      await enqueue(ctx.params.id);
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/ai/background-jobs/:id/cancel", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!(await cancelAiBackgroundJob(ctx.params.id, user.userId))) throw notFound("找不到可取消的 AI 背景工作");
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/ai/background-jobs/:id/retry-failed", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const progress = await retryFailedAiBackgroundItems(ctx.params.id, user.userId);
      if (!progress) throw notFound("找不到 AI 背景工作");
      await enqueue(ctx.params.id, progress.nextRunAt);
      return { progress };
    },
  }),
  route({
    method: "GET", path: "/admin/ai/background-jobs", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      const jobs = await db.select().from(aiBackgroundJobs).orderBy(desc(aiBackgroundJobs.createdAt)).limit(200);
      return { jobs: await Promise.all(jobs.map(async (job) => ({ ...job, progress: await getAiBackgroundProgress(job.id) }))) };
    },
  }),
  route({
    method: "GET", path: "/admin/ai/background-jobs/:id", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      const job = (await db.select().from(aiBackgroundJobs).where(eq(aiBackgroundJobs.id, ctx.params.id)).limit(1))[0];
      if (!job) throw notFound("找不到 AI 背景工作");
      const [batches, items] = await Promise.all([
        db.select().from(aiBackgroundBatches).where(eq(aiBackgroundBatches.jobId, job.id)).orderBy(asc(aiBackgroundBatches.batchIndex)),
        db.select().from(aiBackgroundItems).where(eq(aiBackgroundItems.jobId, job.id)).orderBy(asc(aiBackgroundItems.itemIndex)),
      ]);
      return { job, progress: await getAiBackgroundProgress(job.id), batches, items };
    },
  }),
  route({
    method: "POST", path: "/admin/ai/background-jobs/:id/pause", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      if (!(await pauseAiBackgroundJob(ctx.params.id))) throw notFound("找不到可暫停的 AI 背景工作");
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/admin/ai/background-jobs/:id/resume", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      if (!(await resumeAiBackgroundJob(ctx.params.id))) throw notFound("找不到可恢復的 AI 背景工作");
      await enqueue(ctx.params.id);
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/admin/ai/background-jobs/:id/cancel", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      if (!(await cancelAiBackgroundJob(ctx.params.id))) throw notFound("找不到可取消的 AI 背景工作");
      return { progress: await getAiBackgroundProgress(ctx.params.id) };
    },
  }),
  route({
    method: "POST", path: "/admin/ai/background-jobs/:id/retry-failed", auth: "admin",
    handler: async (ctx) => {
      ctx.requireUser();
      const progress = await retryFailedAiBackgroundItems(ctx.params.id);
      if (!progress) throw notFound("找不到 AI 背景工作");
      await enqueue(ctx.params.id, progress.nextRunAt);
      return { progress };
    },
  }),
];
