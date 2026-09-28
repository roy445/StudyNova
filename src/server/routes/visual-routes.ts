import { z } from "zod";
import { route, type RouteDef } from "../router";
import { fail, fingerprint } from "../core";
import { aiConfigured } from "../ai";
import { createAiBackgroundJob, getAiBackgroundProgress } from "../ai-background";
import { queue } from "../queue";

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/visual-notes/generate",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "visual-notes" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().max(100).default("學習重點"), sourceText: z.string().min(20, "請輸入至少 20 個字的教材內容").max(16000), style: z.enum(["cute", "handwritten", "doodle", "sticker", "clean"]).default("cute"), icon: z.string().max(8).default("✦"), idempotencyKey: z.string().trim().max(240).optional() }));
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const idempotencyKey = body.idempotencyKey || fingerprint("visual-note", user.userId, body.title, body.sourceText, body.style, body.icon);
      const created = await createAiBackgroundJob({
        userId: user.userId,
        kind: "visual_note",
        feature: "ai_visual",
        items: [{ title: body.title, sourceText: body.sourceText, style: body.style, icon: body.icon }],
        batchSize: 1,
        idempotencyKey,
        input: { quotaFeature: "ai_visual", quotaUnits: 1 },
      });
      if (!created.deduplicated) {
        await queue().enqueue({ name: "ai_background_batch", payload: { jobId: created.job.id }, uniqueKey: `ai-background:${created.job.id}:wake`, runAt: new Date() });
        void queue().drain(1);
      }
      return { job: created.job, deduplicated: created.deduplicated, progress: await getAiBackgroundProgress(created.job.id) };
    },
  }),
];
