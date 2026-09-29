import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentReadingSegments, contentUnderstandingBlocks, contentUnderstandingDocuments, studyMaterialHighlights, studyMaterialReadingProgress, studyMaterials } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, forbidden, notFound } from "../core";
import { createAiBackgroundJob, getAiBackgroundProgress } from "../ai-background";
import { queue } from "../queue";

async function ownMaterial(materialId: string, userId: string) {
  const material = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, materialId)).limit(1))[0];
  if (!material) throw notFound("找不到教材");
  if (material.userId !== userId) throw forbidden();
  return material;
}

export const routes: RouteDef[] = [
  route({
    method: "POST", path: "/materials/:id/understand", auth: "user", rate: { limit: 20, windowSec: 3600, key: "content-understanding" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const material = await ownMaterial(ctx.params.id, user.userId);
      if (material.content.trim().length < 2) throw fail("REQ_CONTENT_TOO_SHORT");
      const body = await ctx.json(z.object({ idempotencyKey: z.string().trim().max(240).optional() }).default({}));
      const created = await createAiBackgroundJob({ userId: user.userId, kind: "content_understanding", feature: "material_organize", items: [{ materialId: material.id }], batchSize: 1, idempotencyKey: body.idempotencyKey || `content-understanding:${material.id}:${material.updatedAt.getTime()}`, input: { quotaFeature: "material_organize", quotaUnits: 1 } });
      if (!created.deduplicated) {
        await queue().enqueue({ name: "ai_background_batch", payload: { jobId: created.job.id }, uniqueKey: `ai-background:${created.job.id}:wake`, runAt: new Date() });
        void queue().drain(1);
      }
      return { job: created.job, deduplicated: created.deduplicated, progress: await getAiBackgroundProgress(created.job.id) };
    },
  }),
  route({
    method: "GET", path: "/materials/:id/understanding", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await ownMaterial(ctx.params.id, user.userId);
      const document = (await db.select().from(contentUnderstandingDocuments).where(and(eq(contentUnderstandingDocuments.materialId, ctx.params.id), eq(contentUnderstandingDocuments.userId, user.userId))).orderBy(desc(contentUnderstandingDocuments.version), desc(contentUnderstandingDocuments.createdAt)).limit(1))[0];
      if (!document) return { document: null, blocks: [], segments: [] };
      const [blocks, segments] = await Promise.all([
        db.select().from(contentUnderstandingBlocks).where(eq(contentUnderstandingBlocks.documentId, document.id)).orderBy(asc(contentUnderstandingBlocks.pageNumber), asc(contentUnderstandingBlocks.orderIndex)),
        db.select().from(contentReadingSegments).where(eq(contentReadingSegments.documentId, document.id)).orderBy(asc(contentReadingSegments.orderIndex)),
      ]);
      return { document, blocks, segments };
    },
  }),
  route({
    method: "PATCH", path: "/materials/:id/reading-progress", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await ownMaterial(ctx.params.id, user.userId);
      const body = await ctx.json(z.object({ currentPage: z.number().int().min(1).default(1), currentBlockId: z.string().uuid().nullable().optional(), percent: z.number().min(0).max(100).default(0) }));
      const row = await db.insert(studyMaterialReadingProgress).values({ materialId: ctx.params.id, userId: user.userId, currentPage: body.currentPage, currentBlockId: body.currentBlockId ?? null, percent: body.percent, lastReadAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: [studyMaterialReadingProgress.materialId, studyMaterialReadingProgress.userId], set: { currentPage: body.currentPage, currentBlockId: body.currentBlockId ?? null, percent: body.percent, lastReadAt: new Date(), updatedAt: new Date() } }).returning();
      return { progress: row[0] };
    },
  }),
  route({
    method: "GET", path: "/materials/:id/highlights", auth: "user",
    handler: async (ctx) => { const user = ctx.requireUser(); await ownMaterial(ctx.params.id, user.userId); return { highlights: await db.select().from(studyMaterialHighlights).where(and(eq(studyMaterialHighlights.materialId, ctx.params.id), eq(studyMaterialHighlights.userId, user.userId))).orderBy(desc(studyMaterialHighlights.createdAt)) }; },
  }),
  route({
    method: "POST", path: "/materials/:id/highlights", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await ownMaterial(ctx.params.id, user.userId);
      const body = await ctx.json(z.object({ pageNumber: z.number().int().min(1).default(1), blockId: z.string().uuid().nullable().optional(), selectedText: z.string().trim().min(1).max(5000), color: z.string().max(20).default("yellow"), note: z.string().max(1000).default("") }));
      const row = await db.insert(studyMaterialHighlights).values({ materialId: ctx.params.id, userId: user.userId, ...body, blockId: body.blockId ?? null }).returning();
      return { highlight: row[0] };
    },
  }),
  route({ method: "POST", path: "/tts/jobs", auth: "user", featureGate: "lesson_tts", handler: async () => { throw fail("TTS_BROWSER_SPEECH_ONLY"); } }),
  route({ method: "GET", path: "/tts/jobs/:id", auth: "user", featureGate: "lesson_tts", handler: async () => { throw fail("TTS_BROWSER_SPEECH_ONLY"); } }),
];
