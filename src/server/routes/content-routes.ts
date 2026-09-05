import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  studyMaterials,
  studyMaterialPages,
  ocrDocuments,
  ocrPages,
  notes,
  userVocabularies,
  voiceRecords,
  voiceTranscripts,
  voiceAnalysis,
  tasks,
  questions,
  quizzes,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, sanitizeText, slugToken, todayStr, fingerprint } from "../core";
import { putObject, readObject, deleteObject, signObjectUrl } from "../storage";
import { consumeFeature, grantLearningReward, progressDailyTask, bumpAchievement } from "../economy";
import { runAi, runAiJson, aiConfigured, type AiPart } from "../ai";
import { routes as quizRoutes } from "./quiz-routes";
import { recordStudy } from "./learning-routes";

async function extractText(mime: string, data: Buffer, userId: string): Promise<string> {
  if (mime.startsWith("text/") || mime === "application/json") return sanitizeText(data.toString("utf8"));
  if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED", { hint: "此檔案需要 AI 視覺辨識。你可以改上傳純文字檔，或請管理員設定 AI Provider。" });
  const res = await runAi({
    feature: mime === "application/pdf" ? "material_pdf_extract" : "ocr",
    userId,
    system: "你是精準的 OCR 與文件解析引擎。請完整輸出文件中的文字，保留段落、題號與公式（公式用 LaTeX）。只輸出文字，不要加入說明。",
    parts: [
      { kind: "text", text: "請完整輸出這份文件的文字內容。" },
      { kind: mime === "application/pdf" ? "image" : "image", mimeType: mime, base64: data.toString("base64") },
    ],
    maxOutputTokens: 4000,
    temperature: 0.1,
  });
  return sanitizeText(res.text);
}

const visibility = z.enum(["private", "friends", "group", "link", "public"]);

function parseQuickMemoryText(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(題目|問題|question)\s*[,|\t：:>→-]?\s*(答案|answer)/i.test(line))
    .map((line) => {
      const parts = line.split(/\t+|\s*=>\s*|\s*→\s*|\s*\|\s*|\s*[：:]\s*|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      return parts.length >= 2 ? { stem: parts[0].slice(0, 2000), answer: parts.slice(1).join("｜").slice(0, 1000) } : null;
    })
    .filter((item): item is { stem: string; answer: string } => Boolean(item?.stem && item.answer));
}

export const contentRoutes: RouteDef[] = [
  /* ------------------------------------------------------ materials */
  route({
    method: "GET",
    path: "/materials",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(studyMaterials).where(eq(studyMaterials.userId, user.userId)).orderBy(desc(studyMaterials.createdAt)).limit(100);
      return { materials: rows };
    },
  }),

  route({
    method: "POST",
    path: "/materials",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const form = await ctx.formData();
      const title = String(form.get("title") ?? "").slice(0, 120);
      const subject = String(form.get("subject") ?? "其他").slice(0, 20);
      const rawText = String(form.get("content") ?? "");
      const file = form.get("file");

      if (!title.trim()) throw badRequest("請輸入教材標題");

      if (!(file instanceof File) && rawText.trim().length < 5) throw badRequest("請上傳檔案或貼上教材內容");

      const created = await db
        .insert(studyMaterials)
        .values({ userId: user.userId, title, subject, kind: file instanceof File ? "pdf" : "text", status: "processing", content: sanitizeText(rawText) })
        .returning();
      const material = created[0];

      try {
        if (file instanceof File) {
          const buf = Buffer.from(await file.arrayBuffer());
          const mime = file.type || "application/octet-stream";
          const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: mime, data: buf, allow: ["pdf", "text", "image"] });
          const kind = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : "txt";
          if (kind !== "txt") await consumeFeature(user.userId, "material_organize");
          const text = await extractText(mime, buf, user.userId);
          await db.insert(studyMaterialPages).values({ materialId: material.id, pageNumber: 1, text, objectId: stored.id });
          await db
            .update(studyMaterials)
            .set({ kind, content: text, status: "ready", updatedAt: new Date() })
            .where(eq(studyMaterials.id, material.id));
        } else {
          await db.update(studyMaterials).set({ status: "ready", updatedAt: new Date() }).where(eq(studyMaterials.id, material.id));
        }
      } catch (err) {
        await db
          .update(studyMaterials)
          .set({ status: "failed", errorMessage: err instanceof Error ? err.message.slice(0, 200) : "處理失敗" })
          .where(eq(studyMaterials.id, material.id));
        throw err;
      }

      await progressDailyTask(user.userId, "material", 1);
      const count = await db.select({ c: sql<number>`count(*)::int` }).from(studyMaterials).where(eq(studyMaterials.userId, user.userId));
      await bumpAchievement(user.userId, "materials_added", count[0]?.c ?? 1);
      const fresh = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, material.id)).limit(1))[0];
      return { material: fresh };
    },
  }),

  route({
    method: "GET",
    path: "/materials/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, ctx.params.id)).limit(1))[0];
      if (!m) throw notFound("找不到教材");
      if (m.userId !== user.userId && m.visibility === "private") throw forbidden();
      const pages = await db.select().from(studyMaterialPages).where(eq(studyMaterialPages.materialId, m.id)).orderBy(asc(studyMaterialPages.pageNumber));
      return {
        material: m,
        pages: pages.map((p) => ({ ...p, fileUrl: p.objectId ? signObjectUrl(p.objectId, user.userId) : null })),
      };
    },
  }),

  route({
    method: "PATCH",
    path: "/materials/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({ title: z.string().min(1).max(120).optional(), subject: z.string().max(20).optional(), visibility: visibility.optional(), content: z.string().max(60000).optional() }),
      );
      const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, ctx.params.id)).limit(1))[0];
      if (!m) throw notFound("找不到教材");
      if (m.userId !== user.userId) throw forbidden();
      const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.visibility && body.visibility !== "private" && !m.shareSlug) patch.shareSlug = slugToken(14);
      const rows = await db.update(studyMaterials).set(patch).where(eq(studyMaterials.id, m.id)).returning();
      return { material: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/materials/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, ctx.params.id)).limit(1))[0];
      if (!m) throw notFound("找不到教材");
      if (m.userId !== user.userId) throw forbidden();
      const pages = await db.select().from(studyMaterialPages).where(eq(studyMaterialPages.materialId, m.id));
      for (const p of pages) if (p.objectId) await deleteObject(p.objectId, user.userId, false);
      await db.delete(studyMaterials).where(eq(studyMaterials.id, m.id));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/materials/:id/analyze",
    auth: "user",
    rate: { limit: 30, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, ctx.params.id)).limit(1))[0];
      if (!m) throw notFound("找不到教材");
      if (m.userId !== user.userId) throw forbidden();
      if (m.content.trim().length < 20) throw fail("REQ_CONTENT_TOO_SHORT");
      await consumeFeature(user.userId, "material_organize");
      await db.update(studyMaterials).set({ status: "analyzing" }).where(eq(studyMaterials.id, m.id));
      try {
        const { data } = await runAiJson<{
          summary?: string;
          keyPoints?: string[];
          vocabulary?: Array<{ word: string; meaning: string }>;
          sentences?: string[];
          note?: string;
          tags?: string[];
        }>(
          {
            feature: "material_organize",
            userId: user.userId,
            system:
              '你是台灣國高中教材整理專家。根據教材輸出 JSON：{"summary":"200字摘要","keyPoints":["重點"],"vocabulary":[{"word":"","meaning":""}],"sentences":["重要句子"],"note":"markdown 筆記","tags":["標籤"]}。只根據教材內容，不要杜撰。繁體中文。',
            parts: [{ kind: "text", text: `科目：${m.subject}\n標題：${m.title}\n內容：\n${m.content.slice(0, 14000)}` }],
            maxOutputTokens: 2600,
          },
          {},
        );
        await db
          .update(studyMaterials)
          .set({ summary: (data.summary ?? "").slice(0, 4000), tags: (data.tags ?? []).slice(0, 8), status: "ready", updatedAt: new Date() })
          .where(eq(studyMaterials.id, m.id));
        if (data.note) {
          await db.insert(notes).values({
            userId: user.userId,
            title: `${m.title}｜AI 筆記`,
            subject: m.subject,
            body: data.note.slice(0, 20000),
            source: "ai_material",
            materialId: m.id,
          });
        }
        await recordStudy({ userId: user.userId, kind: "material", subject: m.subject, minutes: 5, detail: { materialId: m.id } });
        return { analysis: data };
      } catch (err) {
        await db.update(studyMaterials).set({ status: "ready" }).where(eq(studyMaterials.id, m.id));
        throw err;
      }
    },
  }),

  /* -------------------------------------------------------- quick memory */
  route({
    method: "GET",
    path: "/quick-memory",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(questions).where(and(eq(questions.ownerId, user.userId), eq(questions.origin, "quick_memory"))).orderBy(desc(questions.createdAt)).limit(100);
      return { items: rows.map((row) => ({ id: row.id, question: row.stem, answer: row.answer[0] ?? "", explanation: row.explanation, createdAt: row.createdAt })) };
    },
  }),
  route({
    method: "POST",
    path: "/quick-memory",
    auth: "user",
    rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const form = await ctx.formData();
      const title = String(form.get("title") ?? "快速背題目").slice(0, 120);
      const pasted = String(form.get("content") ?? "");
      const file = form.get("file");
      if (!(file instanceof File) && pasted.trim().length < 3) throw badRequest("請貼上題目與答案，或上傳文字／PDF 檔案");
      const raw = file instanceof File ? await extractText(file.type || "text/plain", Buffer.from(await file.arrayBuffer()), user.userId) : pasted;
      const pairs = parseQuickMemoryText(raw).slice(0, 100);
      if (!pairs.length) throw badRequest("找不到可辨識的題目／答案。請使用「題目 → 答案」或「題目\t答案」格式");
      const created = [];
      for (const pair of pairs) {
        const rows = await db.insert(questions).values({ ownerId: user.userId, origin: "quick_memory", subject: "快速背", topic: title, level: "custom", difficulty: "normal", type: "short", stem: pair.stem, options: [], answer: [pair.answer], explanation: "", fingerprint: fingerprint("快速背", pair.stem, pair.answer) }).onConflictDoNothing().returning();
        if (rows[0]) created.push(rows[0]);
      }
      return { created: created.length, items: created.map((row) => ({ id: row.id, question: row.stem, answer: row.answer[0] ?? "", explanation: row.explanation, createdAt: row.createdAt })) };
    },
  }),
  route({
    method: "PATCH",
    path: "/quick-memory/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ question: z.string().min(1).max(2000), answer: z.string().min(1).max(1000), explanation: z.string().max(4000).optional() }));
      const current = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!current || current.origin !== "quick_memory") throw notFound("找不到快速背題目");
      if (current.ownerId !== user.userId) throw forbidden();
      const rows = await db.update(questions).set({ stem: body.question.trim(), answer: [body.answer.trim()], explanation: body.explanation?.trim() ?? current.explanation, fingerprint: fingerprint("快速背", body.question, body.answer) }).where(eq(questions.id, current.id)).returning();
      const row = rows[0];
      return { item: { id: row.id, question: row.stem, answer: row.answer[0] ?? "", explanation: row.explanation, createdAt: row.createdAt } };
    },
  }),
  route({
    method: "DELETE",
    path: "/quick-memory/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const current = (await db.select().from(questions).where(eq(questions.id, ctx.params.id)).limit(1))[0];
      if (!current || current.origin !== "quick_memory") throw notFound("找不到快速背題目");
      if (current.ownerId !== user.userId) throw forbidden();
      await db.delete(questions).where(eq(questions.id, current.id));
      return { deleted: true };
    },
  }),

  /* ------------------------------------------------------------ OCR */
  route({
    method: "GET",
    path: "/ocr/documents",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const docs = await db.select().from(ocrDocuments).where(eq(ocrDocuments.userId, user.userId)).orderBy(desc(ocrDocuments.createdAt)).limit(50);
      return { documents: docs };
    },
  }),

  route({
    method: "GET",
    path: "/ocr/search",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const q = (ctx.query.get("q") ?? "").trim().slice(0, 120);
      if (!q) return { documents: [] };
      const rows = await db.execute(sql`
        select id, title, subject, status, combined_text, created_at, updated_at,
          case when ai_result ? 'visionAnalysis' then '影像理解' when ai_result ? 'visionPreflight' then '影像預檢' else 'OCR' end as analysis_kind
        from ocr_documents
        where user_id = ${user.userId}
          and (title ilike ${`%${q}%`} or combined_text ilike ${`%${q}%`} or coalesce(ai_result::text, '') ilike ${`%${q}%`})
        order by updated_at desc limit 50
      `);
      return { documents: rows.rows };
    },
  }),
  route({
    method: "POST",
    path: "/ocr/documents",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().max(80).optional(), subject: z.string().max(20).optional() }));
      const rows = await db
        .insert(ocrDocuments)
        .values({ userId: user.userId, title: body.title || `辨識 ${todayStr()}`, subject: body.subject || "其他" })
        .returning();
      return { document: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/ocr/documents/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const pages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      return { document: doc, pages: pages.map((p) => ({ ...p, imageUrl: p.objectId ? signObjectUrl(p.objectId, user.userId) : null })) };
    },
  }),

  route({
    method: "POST",
    path: "/ocr/documents/:id/pages",
    auth: "user",
    rate: { limit: 120, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const form = await ctx.formData();
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) throw fail("REQ_NO_FILE", { message: "請至少選擇一張圖片" });
      const existing = await db.select({ c: sql<number>`count(*)::int` }).from(ocrPages).where(eq(ocrPages.documentId, doc.id));
      let order = existing[0]?.c ?? 0;
      const previousBatches = Array.isArray((doc.aiResult as Record<string, unknown> | null)?.uploadBatches) ? ((doc.aiResult as Record<string, unknown>).uploadBatches as unknown[]) : [];
      const batchNumber = previousBatches.length + 1;
      const created = [];
      for (const file of files) {
        const buf = Buffer.from(await file.arrayBuffer());
        const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: file.type, data: buf, allow: ["image"] });
        const rows = await db.insert(ocrPages).values({ documentId: doc.id, objectId: stored.id, orderIndex: order }).returning();
        created.push({ ...rows[0], imageUrl: signObjectUrl(stored.id, user.userId) });
        order += 1;
      }
      await db.update(ocrDocuments).set({ aiResult: { ...(doc.aiResult ?? {}), uploadBatches: [...previousBatches, { batchNumber, pageIds: created.map((p) => p.id), count: created.length, uploadedAt: new Date().toISOString() }] }, updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      return { pages: created, batchNumber };
    },
  }),

  route({
    method: "PATCH",
    path: "/ocr/pages/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          orderIndex: z.number().int().min(0).max(200).optional(),
          rotation: z.number().int().min(0).max(359).optional(),
          crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable().optional(),
          text: z.string().max(30000).optional(),
          highlights: z.array(z.object({ color: z.string().max(20), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).max(50).optional(),
        }),
      );
      const page = (await db.select().from(ocrPages).where(eq(ocrPages.id, ctx.params.id)).limit(1))[0];
      if (!page) throw notFound("找不到頁面");
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, page.documentId)).limit(1))[0];
      if (doc.userId !== user.userId) throw forbidden();
      const rows = await db.update(ocrPages).set(body).where(eq(ocrPages.id, page.id)).returning();
      if (body.text !== undefined) {
        const pages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
        await db.update(ocrDocuments).set({ combinedText: pages.map((p) => p.text).join("\n\n"), updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      }
      return { page: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/ocr/pages/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const page = (await db.select().from(ocrPages).where(eq(ocrPages.id, ctx.params.id)).limit(1))[0];
      if (!page) throw notFound("找不到頁面");
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, page.documentId)).limit(1))[0];
      if (doc.userId !== user.userId) throw forbidden();
      if (page.objectId) await deleteObject(page.objectId, user.userId, false);
      await db.delete(ocrPages).where(eq(ocrPages.id, page.id));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/ocr/documents/:id/run",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ pageIds: z.array(z.string().uuid()).max(20).optional() }));
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const allPages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      const pages = body.pageIds?.length ? allPages.filter((p) => body.pageIds!.includes(p.id)) : allPages;
      if (!pages.length) throw fail("REQ_NO_FILE", { message: "請先上傳圖片再執行 OCR" });
      if (pages.length > 1) await consumeFeature(user.userId, "multi_image_ocr");
      await consumeFeature(user.userId, "image_ocr", pages.length);

      await db.update(ocrDocuments).set({ status: "processing", updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      const results: Array<{ pageId: string; ok: boolean; error?: string }> = [];
      await Promise.all(pages.map(async (page) => {
        if (!page.objectId) return;
        try {
          await db.update(ocrPages).set({ status: "processing" }).where(eq(ocrPages.id, page.id));
          const obj = await readObject(page.objectId);
          const hints = page.highlights.length
            ? `圖片上的螢光筆標記區域（相對座標 0-1）：${JSON.stringify(page.highlights)}。請特別標示這些區域內的文字，於輸出時以 [顏色] 前綴標註。`
            : "";
          const { data: ocrData, meta: ocrMeta } = await runAiJson<{ text: string; blocks: Array<{ content: string; x: number; y: number; width: number; height: number; confidence: number; page: number; line: number; block: number }> }>(
            {
              feature: "ocr",
              userId: user.userId,
              system:
                "你是高精度教育 OCR 引擎，擅長中文課本、講義、考卷、手寫筆記、表格與數學公式。請回傳 JSON，不得猜測看不清楚的文字；不確定內容請在文字加上 [不確定:候選]。公式用 LaTeX。JSON 形狀：{text:string,blocks:[{content,x,y,width,height,confidence,page,line,block}]}。座標必須是圖片相對比例 0-1；每段至少一個 block；page 使用圖片頁序 1；line 與 block 從 1 開始。" + hints,
              parts: [
                { kind: "text", text: "辨識圖片全部可見文字，保留題號、選項、段落、表格、公式與標點。" },
                { kind: "image", mimeType: obj.mimeType, base64: obj.data.toString("base64") },
              ],
              temperature: 0.1,
              maxOutputTokens: 5000,
            },
            { text: "", blocks: [] },
          );
          const normalizedBlocks = Array.isArray(ocrData.blocks) ? ocrData.blocks.filter((b) => b && typeof b.content === "string").map((b) => ({ ...b, x: Math.max(0, Math.min(1, Number(b.x) || 0)), y: Math.max(0, Math.min(1, Number(b.y) || 0)), width: Math.max(0, Math.min(1, Number(b.width) || 0)), height: Math.max(0, Math.min(1, Number(b.height) || 0)), confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0)), page: Number(b.page) || 1, line: Number(b.line) || 1, block: Number(b.block) || 1 })) : [];
          const ocrText = sanitizeText(ocrData.text || normalizedBlocks.map((b) => b.content).join("\n"));
          const ocrConfidence = normalizedBlocks.length ? normalizedBlocks.reduce((sum, b) => sum + b.confidence, 0) / normalizedBlocks.length : ocrMeta.outputTokens > 0 ? 0.5 : 0;
          await db.update(ocrPages).set({ text: ocrText, blocks: normalizedBlocks, status: "completed", confidence: ocrConfidence }).where(eq(ocrPages.id, page.id));
          results.push({ pageId: page.id, ok: true });
        } catch (err) {
          await db.update(ocrPages).set({ status: "failed" }).where(eq(ocrPages.id, page.id));
          results.push({ pageId: page.id, ok: false, error: err instanceof Error ? err.message : "辨識失敗" });
        }
      }));
      const fresh = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      const combined = fresh.map((p) => p.text).join("\n\n");
      const anyOk = results.some((r) => r.ok);
      await db
        .update(ocrDocuments)
        .set({ combinedText: combined, status: anyOk ? "completed" : "failed", updatedAt: new Date() })
        .where(eq(ocrDocuments.id, doc.id));
      if (anyOk) await recordStudy({ userId: user.userId, kind: "ocr", subject: doc.subject, minutes: 3, detail: { documentId: doc.id } });
      return { results, combinedText: combined, pages: fresh.map((p) => ({ ...p, imageUrl: p.objectId ? signObjectUrl(p.objectId, user.userId) : null })) };
    },
  }),

  route({
    method: "POST",
    path: "/ocr/documents/:id/vision-analysis",
    auth: "user",
    rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          stage: z.enum(["preflight", "analyze"]),
          pageIds: z.array(z.string().uuid()).max(20).optional(),
          itemIds: z.array(z.string().max(80)).max(100).optional(),
          analysisMode: z.enum(["auto", "vocabulary", "sentences", "questions"]).default("auto"),
          selectedHighlightColors: z.array(z.enum(["yellow", "green", "blue", "pink", "orange", "purple"])).max(6).default([]),
          highlightPreferences: z.object({ vocabulary: z.string().max(20), sentence: z.string().max(20), keypoint: z.string().max(20) }).nullable().optional(),
          force: z.boolean().optional(),
        }),
      );
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const allPages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      const pages = body.pageIds?.length ? allPages.filter((p) => body.pageIds!.includes(p.id)) : allPages;
      if (!pages.length) throw fail("REQ_NO_FILE", { message: "請先選擇至少一張圖片" });
      if (pages.length > 8) throw fail("SYS_CONFLICT", { message: "一次最多分析 8 張圖片，請分批處理" });
      const imageParts: AiPart[] = [];
      const pageContext: string[] = [];
      for (const page of pages) {
        if (!page.objectId) continue;
        const obj = await readObject(page.objectId);
        let ocrText = page.text;
        if (!ocrText.trim()) {
          const ocr = await runAi({
            feature: "camera_ocr_stage",
            userId: user.userId,
            system: "你是高精度教育 OCR。辨識圖片中可見文字並保留題號、段落、選項、公式與標點；數學公式請使用 LaTeX；無法確認的字以 [不確定:候選] 標記，不要猜測。只輸出文字。",
            parts: [{ kind: "image", mimeType: obj.mimeType, base64: obj.data.toString("base64") }],
            maxOutputTokens: 5000,
            temperature: 0.05,
          });
          ocrText = sanitizeText(ocr.text);
          await db.update(ocrPages).set({ text: ocrText, status: "completed", confidence: 0.85 }).where(eq(ocrPages.id, page.id));
        }
        imageParts.push({ kind: "text", text: `\n--- PAGE ${page.orderIndex + 1} / pageId=${page.id} ---\n既有 OCR：${ocrText || "（影像未取得文字）"}` });
        imageParts.push({ kind: "image", mimeType: obj.mimeType, base64: obj.data.toString("base64") });
        pageContext.push(`pageId=${page.id}; page=${page.orderIndex + 1}; OCR=${ocrText.slice(0, 8000)}`);
      }
      if (!imageParts.length) throw fail("AI_OCR_EMPTY", { message: "圖片內容無法讀取，請重新上傳" });
      const studentProfile = await db.execute(sql`select school_level, grade, english_level, favorite_subjects from user_settings where user_id = ${user.userId} limit 1`);
      const profile = (studentProfile.rows[0] ?? {}) as { school_level?: string; grade?: number; english_level?: string; favorite_subjects?: string[] };
      const level = profile.school_level === "senior" ? "高中" : "國中";
      if (body.stage === "preflight") {
        const { data } = await runAiJson<Record<string, unknown>>(
          {
            feature: "camera_vision_preflight",
            userId: user.userId,
            system: `你是 StudyNova 的影像品質與版面理解模型。你必須真的查看每張圖片，不可以只依 OCR 猜測。請輸出繁體中文 JSON，不得補造圖片中不存在的內容。學生程度：${level}${profile.grade ?? ""}年級。每頁回傳 quality（resolution、blur、brightness、contrast、glare、skew、textSize、occlusion、shadow、background、readability，皆為 good|warning|poor|unknown）、issues（實際原因）、canAnalyze（boolean）、contentTypes（題目／單字／英文句子／中文句子／文章／數學／自然／表格／圖表／圖形／手寫筆記／考卷／講義／混合內容／無法判斷）、detectedCounts（questions、vocabulary、sentences）與 items（每個題目或語言區塊的 id、kind、label、pageIds、bbox 0-1、confidence）。若不確定，confidence 必須降低並在 issues 或 notes 說明。JSON 形狀：{pages:[...], totalItems:number, notes:string[]}.`,
            parts: imageParts,
            maxOutputTokens: 6000,
            temperature: 0.1,
          },
          { pages: [], totalItems: 0, notes: ["模型未回傳預檢結果"] },
        );
        await db.update(ocrDocuments).set({ aiResult: { ...(doc.aiResult ?? {}), visionPreflight: data }, updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
        const qualityText = JSON.stringify(data);
        const retakeMessage = /"poor"|看不清|模糊|解析度不足|無法辨識/i.test(qualityText)
          ? "圖片有些內容看不清楚，請拍攝的清楚一點後再分析。"
          : null;
        return { stage: body.stage, preflight: data, retakeMessage, pages: pages.map((p) => ({ id: p.id, orderIndex: p.orderIndex, imageUrl: p.objectId ? signObjectUrl(p.objectId, user.userId) : null })) };
      }
      const preflight = (doc.aiResult as Record<string, unknown> | null)?.visionPreflight;
      if (!body.force && !preflight) throw fail("SYS_CONFLICT", { message: "請先執行圖片品質檢查" });
      const selected = body.itemIds?.length ? `只分析這些項目：${body.itemIds.join(", ")}` : "分析所有偵測到的項目";
      const modeInstruction = body.analysisMode === "vocabulary" ? "目前模式是只分析單字與片語：忽略一般文章與廣告文字，只輸出有學習價值的單字、補充單字、片語，並補上繁體中文、詞性、一字多意與中文片語。" : body.analysisMode === "sentences" ? "目前模式是只分析句子與句型：忽略零散單字，只輸出完整英文句子、中文翻譯、重要句型、文法與重要單字。" : body.analysisMode === "questions" ? "目前模式是只分析題目：只輸出題目、選項、答案與詳細解析，不要把普通文章文字當成題目。" : "目前模式是智慧讀取：自動判斷題目、單字、句子、文章、筆記與混合內容。";
      const previousAnalysis = (doc.aiResult as Record<string, unknown> | null)?.visionAnalysis;
      const previousItems = previousAnalysis && typeof previousAnalysis === "object" && Array.isArray((previousAnalysis as Record<string, unknown>).items) ? (previousAnalysis as Record<string, unknown>).items as Array<Record<string, unknown>> : [];
      const previousWords = previousItems.flatMap((item) => {
        const language = item.language && typeof item.language === "object" ? item.language as Record<string, unknown> : {};
        const vocabulary = Array.isArray(language.vocabulary) ? language.vocabulary : [];
        return [item.kind === "vocabulary" ? item.word : null, ...vocabulary.map((v) => v && typeof v === "object" ? (v as Record<string, unknown>).word : null)].filter((word): word is string => typeof word === "string" && word.trim().length > 0);
      });
      const duplicateInstruction = `同一批圖片中相同單字只輸出一次；如果下列單字已在前一次批次分析過，這次請直接省略：${previousWords.slice(0, 200).join(", ")}；題目若出現斜線、或、頓號分隔的多個答案，必須保留成 answer.values 陣列，代表多個可接受答案。`;
      const colorInstruction = body.highlightPreferences ? `已開啟螢光筆優先分析：${body.highlightPreferences.vocabulary}代表單字、${body.highlightPreferences.sentence}代表句子、${body.highlightPreferences.keypoint}代表重點；請只分析這些指定用途，沒有指定顏色的內容不必特別分析。` : "未開啟螢光筆優先分析，不要因為看到螢光筆就自行擴大分析範圍。";
      const { data } = await runAiJson<Record<string, unknown>>(
        {
          feature: "camera_vision_analysis",
          userId: user.userId,
          system: `你是 StudyNova 的台灣國高中教學助教與 Vision 分析器。你必須同時查看原圖與 OCR，原圖優先；圖片中的圖形、表格、公式、附註、作答要求都屬於內容。${selected}。${modeInstruction} ${colorInstruction} 學生程度為${level}${profile.grade ?? ""}年級，英文程度為${profile.english_level ?? "未知"}。跨頁時請將文章頁與後續問題頁建立 sourcePageIds 關聯，若文章找不到答案，明確寫「文章中沒有找到足夠資訊確認答案」，不得推測。\n\n請只輸出 JSON，形狀如下：{\n  "documentSummary": "",\n  "contentTypes": [],\n  "uncertainties": [{"location":"pageId/itemId","text":"","alternatives":[]}],\n  "items": [{\n    "id":"stable-id", "kind":"question|vocabulary|sentence|article|note", "label":"", "sourcePageIds":[], "bbox":{"x":0,"y":0,"w":1,"h":1}, "confidence":0, "rawText":"完整原文", "subject":"國文|英文|數學|自然|社會|其他", "type":"選擇題|多選題|填空題|計算題|閱讀理解|文法題|翻譯題|配合題|證明題|應用題|實驗題|單字|句子|文章|手寫筆記|其他", "difficulty":"基礎|中等|困難|不確定", "elements":{"questionNumber":"","prompt":"","options":[{"label":"A","text":"","isCorrect":false,"confidence":0,"analysis":""}],"figures":[{"description":"","role":"題目必要圖片或圖表","observations":[]}],"tables":[],"formulas":[],"units":[],"annotations":[],"requirements":""}, "answer":{"value":"","certainty":"confirmed|uncertain|not-found","given":"","asked":"","concept":"","steps":[],"finalReason":""}, "language":{"translationNatural":"","translationStructural":"","grammar":[{"name":"","evidence":"","explanation":""}],"clauses":[{"text":"","role":"","explanation":""}],"mainVerb":"","subject":"","object":"","phrases":[{"phrase":"","meaning":"","pattern":"","example":"","usage":""}],"tokens":[{"surface":"","lemma":"","partOfSpeech":"","meaningInContext":"","tense":"","pronunciation":""}],"vocabulary":[{"word":"","partOfSpeech":"","meanings":[{"meaning":"","context":""}],"phonetic":"","uk":"","us":"","collocations":[],"synonyms":[],"nearSynonyms":[],"antonyms":[],"confusables":[{"word":"","difference":""}],"root":{"text":"","reliable":false},"learningAssociation":"","example":"","exampleZh":""}]}, "article":{"summary":"","paragraphs":[{"mainIdea":"","keyInformation":[],"keyVocabulary":[],"keyPatterns":[]}],"importantVocabulary":[],"importantPatterns":[]}, "chinese":{"words":[],"idioms":[],"partOfSpeech":[],"paragraphMeaning":"","theme":"","rhetoric":[{"device":"","evidence":"","certainty":"confirmed|possible","explanation":""}],"classical":{"original":"","vernacular":"","words":[],"sentences":[],"people":[],"events":[],"theme":"","examPoints":[]}}, "handwriting":{"originalText":"","ocrText":"","organizedNotes":"","summary":"","possibleErrors":[{"text":"","possibilities":[],"needsConfirmation":true}]}}],\n  "recommendedActions":[]\n}. 空陣列代表沒有該類內容；不要為了完整而捏造資料。`,
          parts: [
            { kind: "text", text: `頁面脈絡：\n${pageContext.join("\n")}\n\n預檢結果：${JSON.stringify(preflight ?? {})}` },
            ...imageParts,
          ],
          maxOutputTokens: 14000,
          temperature: 0.15,
        },
        { documentSummary: "", contentTypes: [], uncertainties: [{ location: "", text: "未取得分析結果", alternatives: [] }], items: [], recommendedActions: [] },
      );
      await db.update(ocrDocuments).set({ aiResult: { ...(doc.aiResult ?? {}), visionAnalysis: data }, updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      await recordStudy({ userId: user.userId, kind: "camera_analysis", subject: doc.subject, minutes: 3, detail: { documentId: doc.id, itemCount: Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items.length : 0 } });
      return { stage: body.stage, analysis: data };
    },
  }),
  route({
    method: "POST",
    path: "/ocr/documents/:id/learning-action",
    auth: "user",
    rate: { limit: 80, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ action: z.enum(["vocabulary", "note", "question", "quiz"]), items: z.array(z.record(z.string(), z.unknown())).min(1).max(100) }));
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const pages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      const sourceObjectId = pages.find((p) => p.objectId)?.objectId ?? null;
      let saved = 0;
      let duplicates = 0;
      const quizQuestionIds: string[] = [];
      for (const item of body.items) {
        const sourcePageIds = Array.isArray(item.sourcePageIds) ? item.sourcePageIds.filter((x): x is string => typeof x === "string") : [];
        const sourcePage = pages.find((p) => sourcePageIds.includes(p.id));
        if (body.action === "vocabulary") {
          const word = String(item.word ?? item.rawText ?? "").trim().slice(0, 200);
          if (!word) continue;
          const language = (item.language && typeof item.language === "object" ? item.language : {}) as Record<string, unknown>;
          const meanings = Array.isArray(item.meanings) ? item.meanings : Array.isArray(language.meanings) ? language.meanings : [];
          const meaning = String(item.meaning ?? (meanings[0] && typeof meanings[0] === "object" ? (meanings[0] as Record<string, unknown>).meaning : "") ?? "").slice(0, 1000);
          const normalizedWord = word.toLocaleLowerCase("en-US");
          const inserted = await db.insert(userVocabularies).values({ userId: user.userId, word, normalizedWord, partOfSpeech: String(item.partOfSpeech ?? "").slice(0, 80), meaning, phonetic: String(item.phonetic ?? "").slice(0, 160), example: String(item.example ?? "").slice(0, 1000), exampleZh: String(item.exampleZh ?? "").slice(0, 1000), analysis: item, sourceDocumentId: doc.id, sourceObjectId: sourcePage?.objectId ?? sourceObjectId }).onConflictDoNothing().returning({ id: userVocabularies.id });
          if (inserted.length) saved += 1; else duplicates += 1;
        } else if (body.action === "note") {
          const title = String(item.label ?? item.title ?? `鏡頭分析 ${new Date().toLocaleDateString("zh-TW")}`).slice(0, 120);
          const bodyText = String(item.organizedNotes ?? item.summary ?? item.rawText ?? JSON.stringify(item)).slice(0, 30000);
          await db.insert(notes).values({ userId: user.userId, title, subject: String(item.subject ?? doc.subject).slice(0, 20), body: bodyText, source: "camera_analysis" });
          saved += 1;
        } else {
          const stem = String(item.rawText ?? item.prompt ?? "").trim().slice(0, 10000);
          if (!stem) continue;
          const answer = (item.answer && typeof item.answer === "object" ? item.answer : {}) as Record<string, unknown>;
          const elements = (item.elements && typeof item.elements === "object" ? item.elements : {}) as Record<string, unknown>;
          const options = Array.isArray(elements.options) ? elements.options.map((o) => typeof o === "object" && o ? String((o as Record<string, unknown>).text ?? "") : String(o)).filter(Boolean).slice(0, 12) : [];
          const rawAnswerValues = Array.isArray(answer.values) ? answer.values.map(String) : answer.value ? [String(answer.value)] : [];
          const answerValues = rawAnswerValues.flatMap((value) => value.split(/\s*\/\s*|\s*或\s*|、/).map((part) => part.trim()).filter(Boolean)).map((value) => value.slice(0, 500)).slice(0, 12);
          const inserted = await db.insert(questions).values({ ownerId: user.userId, origin: "user", subject: String(item.subject ?? doc.subject).slice(0, 20), topic: String(item.type ?? "鏡頭分析").slice(0, 120), level: "junior", difficulty: String(item.difficulty ?? "不確定").slice(0, 20), type: String(item.type ?? "short").slice(0, 30), stem, options, answer: answerValues, explanation: String(answer.finalReason ?? (Array.isArray(answer.steps) ? answer.steps.join("\n") : "")).slice(0, 20000), fingerprint: fingerprint(`${user.userId}:camera:${stem}`) }).onConflictDoNothing().returning({ id: questions.id });
          if (inserted.length) {
            saved += 1;
            quizQuestionIds.push(inserted[0].id);
          } else duplicates += 1;
        }
      }
      if (body.action === "quiz" && quizQuestionIds.length) {
        const quizRows = await db.insert(quizzes).values({ userId: user.userId, title: `鏡頭分析練習・${todayStr()}`, subject: doc.subject, source: "camera_analysis", questionIds: quizQuestionIds, visibility: "private" }).returning({ id: quizzes.id, title: quizzes.title });
        return { action: body.action, saved, duplicates, quiz: quizRows[0], sourceDocumentId: doc.id };
      }
      return { action: body.action, saved, duplicates, sourceDocumentId: doc.id };
    },
  }),
  route({
    method: "POST",
    path: "/ocr/documents/:id/transform",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          action: z.enum(["notes", "questions", "solve", "keypoints", "flashcards", "translate", "wrong", "plan"]),
        }),
      );
      const action = body.action;

      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      if (doc.combinedText.trim().length < 10) throw fail("AI_OCR_EMPTY", { message: "請先完成 OCR 或手動輸入文字" });
      await consumeFeature(user.userId, "ai_context");

      const prompts: Record<string, string> = {
        notes: '整理成結構化 markdown 筆記。JSON：{"title":"","body":"markdown"}',
        questions: '出 5 題練習題。JSON：{"questions":[{"type":"single","stem":"","options":[],"answer":[""],"explanation":""}]}',
        solve: '逐題解題並說明步驟。JSON：{"title":"","body":"markdown"}',
        keypoints: '抓出重點條列。JSON：{"title":"重點整理","body":"markdown"}',
        flashcards: '製作記憶卡。JSON：{"cards":[{"front":"","back":""}]}',
        translate: '翻譯成中英對照。JSON：{"title":"翻譯","body":"markdown"}',
        wrong: '找出可能的易錯點與陷阱。JSON：{"title":"易錯提醒","body":"markdown"}',
        plan: '建立 3 天複習計畫。JSON：{"title":"複習計畫","body":"markdown","tasks":["任務"]}',
      };

      const { data } = await runAiJson<Record<string, unknown>>(
        {
          feature: `ocr_${action}`,
          userId: user.userId,
          system: `你是台灣國高中學習助教。${prompts[action]}。只根據提供文字，不要杜撰。繁體中文。`,
          parts: [{ kind: "text", text: doc.combinedText.slice(0, 14000) }],
          maxOutputTokens: 2600,
        },
        {},
      );

      if ((action === "notes" || action === "keypoints" || action === "solve" || action === "translate" || action === "wrong") && data.body) {
        await db.insert(notes).values({
          userId: user.userId,
          title: String(data.title ?? doc.title).slice(0, 120),
          subject: doc.subject,
          body: String(data.body).slice(0, 20000),
          source: `ocr_${action}`,
        });
      }
      if (action === "plan" && Array.isArray(data.tasks)) {
        for (const t of (data.tasks as string[]).slice(0, 8)) {
          await db.insert(tasks).values({ userId: user.userId, title: String(t).slice(0, 120), source: "ocr_plan" });
        }
      }
      await db.update(ocrDocuments).set({ aiResult: { ...(doc.aiResult ?? {}), [action]: data }, updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      return { action, result: data };
    },
  }),

  /* ---------------------------------------------------- my vocabulary */
  route({
    method: "GET",
    path: "/my-vocabulary",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const q = (ctx.query.get("q") ?? "").trim().slice(0, 80);
      const rows = await db.select().from(userVocabularies).where(and(eq(userVocabularies.userId, user.userId), q ? sql`(${userVocabularies.word} ilike ${`%${q}%`} or ${userVocabularies.meaning} ilike ${`%${q}%`})` : sql`true`)).orderBy(desc(userVocabularies.updatedAt)).limit(300);
      return { items: rows, total: rows.length };
    },
  }),
  route({
    method: "PATCH",
    path: "/my-vocabulary/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ familiarity: z.number().int().min(0).max(100).optional(), review: z.boolean().optional() }));
      const current = (await db.select().from(userVocabularies).where(and(eq(userVocabularies.id, ctx.params.id), eq(userVocabularies.userId, user.userId))).limit(1))[0];
      if (!current) throw notFound("找不到我的單字");
      const familiarity = body.familiarity ?? (body.review ? Math.min(100, current.familiarity + 20) : current.familiarity);
      const rows = await db.update(userVocabularies).set({ familiarity, reviewCount: body.review ? current.reviewCount + 1 : current.reviewCount, lastReviewedAt: body.review ? new Date() : current.lastReviewedAt, updatedAt: new Date() }).where(eq(userVocabularies.id, current.id)).returning();
      return { item: rows[0] };
    },
  }),
  route({
    method: "DELETE",
    path: "/my-vocabulary/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db.delete(userVocabularies).where(and(eq(userVocabularies.id, ctx.params.id), eq(userVocabularies.userId, user.userId))).returning({ id: userVocabularies.id });
      if (!deleted[0]) throw notFound("找不到我的單字");
      return { deleted: true };
    },
  }),
  /* ---------------------------------------------------------- notes */
  route({
    method: "GET",
    path: "/notes",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(notes).where(eq(notes.userId, user.userId)).orderBy(desc(notes.updatedAt)).limit(100);
      return { notes: rows };
    },
  }),

  route({
    method: "POST",
    path: "/notes",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().min(1).max(120), subject: z.string().max(20).default("其他"), body: z.string().max(30000).default("") }));
      const rows = await db.insert(notes).values({ userId: user.userId, title: body.title, subject: body.subject, body: body.body }).returning();
      await progressDailyTask(user.userId, "material", 1);
      return { note: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/notes/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().min(1).max(120).optional(), body: z.string().max(30000).optional(), visibility: visibility.optional() }));
      const n = (await db.select().from(notes).where(eq(notes.id, ctx.params.id)).limit(1))[0];
      if (!n) throw notFound("找不到筆記");
      if (n.userId !== user.userId) throw forbidden();
      const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.visibility && body.visibility !== "private" && !n.shareSlug) patch.shareSlug = slugToken(14);
      const rows = await db.update(notes).set(patch).where(eq(notes.id, n.id)).returning();
      return { note: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/notes/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db.delete(notes).where(and(eq(notes.id, ctx.params.id), eq(notes.userId, user.userId))).returning({ id: notes.id });
      if (!deleted[0]) throw notFound("找不到筆記");
      return { deleted: true };
    },
  }),

  /* ---------------------------------------------------------- voice */
  route({
    method: "GET",
    path: "/voice",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(voiceRecords).where(eq(voiceRecords.userId, user.userId)).orderBy(desc(voiceRecords.createdAt)).limit(30);
      const out = [];
      for (const r of rows) {
        const t = (await db.select().from(voiceTranscripts).where(eq(voiceTranscripts.recordId, r.id)).limit(1))[0] ?? null;
        const a = (await db.select().from(voiceAnalysis).where(eq(voiceAnalysis.recordId, r.id)).limit(1))[0] ?? null;
        out.push({ ...r, audioUrl: r.objectId ? signObjectUrl(r.objectId, user.userId) : null, transcript: t, analysis: a });
      }
      return { records: out };
    },
  }),

  route({
    method: "POST",
    path: "/voice",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const form = await ctx.formData();
      const file = form.get("audio");
      const mode = String(form.get("mode") ?? "reading");
      const subject = String(form.get("subject") ?? "英文").slice(0, 20);
      const referenceText = sanitizeText(String(form.get("referenceText") ?? ""), 6000);
      const durationSec = Number(form.get("durationSec") ?? 0) || 0;
      if (!(file instanceof File)) throw fail("REQ_NO_FILE", { message: "請提供錄音檔" });
      if (!aiConfigured()) throw fail("AI_VOICE_REQUIRED");
      await consumeFeature(user.userId, "ai_speech");

      const buf = Buffer.from(await file.arrayBuffer());
      const stored = await putObject({ userId: user.userId, filename: file.name || "record.webm", mimeType: file.type || "audio/webm", data: buf, allow: ["audio"] });
      const rec = (
        await db
          .insert(voiceRecords)
          .values({ userId: user.userId, objectId: stored.id, mode, subject, referenceText, durationSec: Math.round(durationSec), status: "processing" })
          .returning()
      )[0];

      try {
        const { data } = await runAiJson<{
          transcript?: string;
          score?: number;
          fluency?: number;
          accuracy?: number;
          completeness?: number;
          pace?: number;
          missingWords?: string[];
          extraWords?: string[];
          advice?: string;
        }>(
          {
            feature: "voice_analysis",
            userId: user.userId,
            system:
              "你是語音評測引擎。先逐字轉錄音檔，再與參考文本比對。" +
              '回傳 JSON：{"transcript":"逐字稿","score":0-100,"fluency":0-100,"accuracy":0-100,"completeness":0-100,"pace":0-100,"missingWords":[],"extraWords":[],"advice":"具體改善建議"}。' +
              "沒有參考文本時，依內容完整度、流暢度與發音清晰度評分。建議使用繁體中文。",
            parts: [
              { kind: "text", text: `模式：${mode}\n科目：${subject}\n參考文本：${referenceText || "（無，請自由評估）"}` },
              { kind: "audio", mimeType: file.type || "audio/webm", base64: buf.toString("base64") },
            ],
            maxOutputTokens: 1600,
            temperature: 0.2,
          },
          {},
        );

        const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        await db.insert(voiceTranscripts).values({ recordId: rec.id, transcript: sanitizeText(String(data.transcript ?? "")), provider: "ai" });
        const analysis = (
          await db
            .insert(voiceAnalysis)
            .values({
              recordId: rec.id,
              score: clamp(data.score),
              fluency: clamp(data.fluency),
              accuracy: clamp(data.accuracy),
              completeness: clamp(data.completeness),
              pace: clamp(data.pace),
              missingWords: (data.missingWords ?? []).slice(0, 40).map(String),
              extraWords: (data.extraWords ?? []).slice(0, 40).map(String),
              advice: String(data.advice ?? "").slice(0, 2000),
            })
            .returning()
        )[0];
        await db.update(voiceRecords).set({ status: "completed" }).where(eq(voiceRecords.id, rec.id));
        await recordStudy({ userId: user.userId, kind: "voice", subject, minutes: Math.max(1, Math.round(durationSec / 60)) });
        await grantLearningReward({ userId: user.userId, nova: 8, xp: 15, reason: "完成錄音分析", idempotencyKey: `voice:${rec.id}` });
        return {
          record: { ...rec, status: "completed", audioUrl: signObjectUrl(stored.id, user.userId) },
          transcript: data.transcript ?? "",
          analysis,
        };
      } catch (err) {
        await db.update(voiceRecords).set({ status: "failed" }).where(eq(voiceRecords.id, rec.id));
        throw err;
      }
    },
  }),

  route({
    method: "DELETE",
    path: "/voice/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rec = (await db.select().from(voiceRecords).where(eq(voiceRecords.id, ctx.params.id)).limit(1))[0];
      if (!rec) throw notFound("找不到錄音");
      if (rec.userId !== user.userId) throw forbidden();
      if (rec.objectId) await deleteObject(rec.objectId, user.userId, false);
      await db.delete(voiceRecords).where(eq(voiceRecords.id, rec.id));
      return { deleted: true };
    },
  }),
];

export const routes: RouteDef[] = [...contentRoutes, ...quizRoutes];
