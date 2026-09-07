import { z } from "zod";
import { route, type RouteDef } from "../router";
import { fail } from "../core";
import { consumeFeature } from "../economy";
import { aiConfigured, runAiJson } from "../ai";

const nodeSchema = z.object({ title: z.string().min(1).max(80), summary: z.string().max(180).default(""), color: z.string().max(20).optional(), children: z.array(z.object({ title: z.string().min(1).max(80), summary: z.string().max(180).default(""), color: z.string().max(20).optional() })).max(8).default([]) });

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/visual-notes/generate",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "visual-notes" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().max(100).default("學習重點"), sourceText: z.string().min(20, "請輸入至少 20 個字的教材內容").max(16000), style: z.enum(["cute", "handwritten", "doodle", "sticker", "clean"]).default("cute") }));
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      await consumeFeature(user.userId, "ai_visual");
      const { data } = await runAiJson<{ title?: string; central?: string; nodes?: Array<z.infer<typeof nodeSchema>> }>(
        {
          feature: "ai_visual_note",
          userId: user.userId,
          system: "你是 StudyNova 的學習重點整理器。請把教材整理成適合心智圖的繁體中文結構。只輸出 JSON：title、central、nodes。nodes 最多 8 個，每個 children 最多 8 個。保留重要英文術語與公式，不要捏造教材沒有的資訊。summary 要短而清楚。",
          parts: [{ kind: "text", text: `標題：${body.title}\n視覺風格：${body.style}\n教材：\n${body.sourceText}` }],
          maxOutputTokens: 2800,
        },
        { title: body.title, central: body.title, nodes: [] },
      );
      const nodes = (data.nodes ?? []).map((node) => ({ ...node, children: node.children ?? [] })).slice(0, 8);
      return { visual: { title: String(data.title || body.title).slice(0, 100), central: String(data.central || body.title).slice(0, 100), nodes, style: body.style, generatedAt: new Date().toISOString() } };
    },
  }),
];
