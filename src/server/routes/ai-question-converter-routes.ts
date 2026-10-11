import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiQuestionConverterItems, aiQuestionConverterJobs, fileContexts, platformSettings } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { converterConfig, confirmConverterJob, createConverterJob } from "../ai-question-converter";
import { queue } from "../queue";

const converterBody = z.object({ contextId: z.string().uuid(), title: z.string().trim().max(120).optional() });

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/ai/question-converter/jobs",
    auth: "user",
    rate: { limit: 10, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(converterBody);
      const job = await createConverterJob({ userId: user.userId, contextId: body.contextId, title: body.title });
      await queue().enqueue({ name: "ai_question_converter", payload: { jobId: job.id }, uniqueKey: `ai-question-converter:${job.id}` });
      return { job, message: "已送入背景分析佇列。" };
    },
  }),
  route({
    method: "GET",
    path: "/ai/question-converter/jobs",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { jobs: await db.select().from(aiQuestionConverterJobs).where(eq(aiQuestionConverterJobs.userId, user.userId)).orderBy(desc(aiQuestionConverterJobs.createdAt)).limit(50) };
    },
  }),
  route({
    method: "GET",
    path: "/ai/question-converter/jobs/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const job = (await db.select().from(aiQuestionConverterJobs).where(and(eq(aiQuestionConverterJobs.id, ctx.params.id), eq(aiQuestionConverterJobs.userId, user.userId))).limit(1))[0];
      if (!job) throw notFound("找不到 AI 題目互動化工作");
      const items = await db.select().from(aiQuestionConverterItems).where(eq(aiQuestionConverterItems.jobId, job.id)).orderBy(aiQuestionConverterItems.ordinal);
      return { job, items };
    },
  }),
  route({
    method: "POST",
    path: "/ai/question-converter/jobs/:id/confirm",
    auth: "user",
    handler: async (ctx) => ({ result: await confirmConverterJob(ctx.requireUser().userId, ctx.params.id) }),
  }),
  route({
    method: "GET",
    path: "/admin/ai-question-converter/settings",
    auth: "admin",
    handler: async () => {
      const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_question_converter")).limit(1))[0];
      return { config: converterConfig(row?.value) };
    },
  }),
  route({
    method: "PUT",
    path: "/admin/ai-question-converter/settings",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.record(z.string(), z.unknown()));
      const current = converterConfig(body);
      if (Number(current.freeRetentionDays) < 1 || Number(current.proRetentionDays) < 1) throw fail("REQ_VALIDATION", { message: "保存期限必須為正整數；永久保存請使用 null。" });
      const row = (await db.insert(platformSettings).values({ key: "ai_question_converter", value: current, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { value: current, updatedAt: new Date() } }).returning())[0];
      console.info("[admin] ai_question_converter.settings.updated", { adminUserId: admin.userId, config: current });
      return { config: current, setting: row };
    },
  }),
  route({
    method: "GET",
    path: "/admin/ai-question-converter/jobs",
    auth: "admin",
    handler: async () => {
      const jobs = await db.select().from(aiQuestionConverterJobs).orderBy(desc(aiQuestionConverterJobs.createdAt)).limit(200);
      const contexts = jobs.length ? await db.select({ id: fileContexts.id, name: fileContexts.originalName }).from(fileContexts).where(eq(fileContexts.id, jobs[0].sourceContextId)) : [];
      return { jobs, sourceContextCount: contexts.length };
    },
  }),
];
