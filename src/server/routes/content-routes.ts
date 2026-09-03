import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  studyMaterials,
  studyMaterialPages,
  ocrDocuments,
  ocrPages,
  notes,
  voiceRecords,
  voiceTranscripts,
  voiceAnalysis,
  tasks,
  questions,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, sanitizeText, slugToken, todayStr, fingerprint } from "../core";
import { putObject, readObject, deleteObject, signObjectUrl } from "../storage";
import { consumeFeature, grantLearningReward, progressDailyTask, bumpAchievement } from "../economy";
import { runAi, runAiJson, aiConfigured } from "../ai";
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
      const created = [];
      for (const file of files) {
        const buf = Buffer.from(await file.arrayBuffer());
        const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: file.type, data: buf, allow: ["image"] });
        const rows = await db.insert(ocrPages).values({ documentId: doc.id, objectId: stored.id, orderIndex: order }).returning();
        created.push({ ...rows[0], imageUrl: signObjectUrl(stored.id, user.userId) });
        order += 1;
      }
      return { pages: created };
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
      const doc = (await db.select().from(ocrDocuments).where(eq(ocrDocuments.id, ctx.params.id)).limit(1))[0];
      if (!doc) throw notFound("找不到辨識文件");
      if (doc.userId !== user.userId) throw forbidden();
      const pages = await db.select().from(ocrPages).where(eq(ocrPages.documentId, doc.id)).orderBy(asc(ocrPages.orderIndex));
      if (!pages.length) throw fail("REQ_NO_FILE", { message: "請先上傳圖片再執行 OCR" });
      if (pages.length > 1) await consumeFeature(user.userId, "multi_image_ocr");
      await consumeFeature(user.userId, "image_ocr", pages.length);

      await db.update(ocrDocuments).set({ status: "processing", updatedAt: new Date() }).where(eq(ocrDocuments.id, doc.id));
      const results: Array<{ pageId: string; ok: boolean; error?: string }> = [];
      for (const page of pages) {
        if (!page.objectId) continue;
        try {
          await db.update(ocrPages).set({ status: "processing" }).where(eq(ocrPages.id, page.id));
          const obj = await readObject(page.objectId);
          const hints = page.highlights.length
            ? `圖片上的螢光筆標記區域（相對座標 0-1）：${JSON.stringify(page.highlights)}。請特別標示這些區域內的文字，於輸出時以 [顏色] 前綴標註。`
            : "";
          const res = await runAi({
            feature: "ocr",
            userId: user.userId,
            system:
              "你是高精度 OCR 引擎，擅長辨識中文課本、講義、考卷、手寫筆記、黑板、雜誌、表格與數學公式。" +
              "完整輸出所有可見文字，保留題號與排版，公式用 LaTeX。只輸出文字內容。",
            parts: [
              { kind: "text", text: `請辨識這張圖片的所有文字。${hints}` },
              { kind: "image", mimeType: obj.mimeType, base64: obj.data.toString("base64") },
            ],
            temperature: 0.1,
            maxOutputTokens: 3000,
          });
          await db.update(ocrPages).set({ text: sanitizeText(res.text), status: "completed", confidence: 0.9 }).where(eq(ocrPages.id, page.id));
          results.push({ pageId: page.id, ok: true });
        } catch (err) {
          await db.update(ocrPages).set({ status: "failed" }).where(eq(ocrPages.id, page.id));
          results.push({ pageId: page.id, ok: false, error: err instanceof Error ? err.message : "辨識失敗" });
        }
      }
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
