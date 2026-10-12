import fs from "node:fs";
import path from "node:path";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { examVocabularyItems, examVocabularySets, examVocabularyUnits } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { putObject, readObject } from "../storage";
import { runAiJson } from "../ai";
import { embedCjkFont, embedMathFont, sanitizeTextForCjkPdf } from "../cjk-font";
import { writeAudit } from "../audit";

const setId = z.string().uuid();
const unitId = z.string().uuid();
type ExtractedWord = { word?: string; meaning?: string; partOfSpeech?: string; phonetic?: string; phrase?: string; phraseMeaning?: string; example?: string; exampleZh?: string };

function normalizeWord(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}
function publicSet(row: typeof examVocabularySets.$inferSelect, unitCount: number, itemCount: number) {
  return { id: row.id, title: row.title, description: row.description, examLabel: row.examLabel, enabled: row.enabled, published: row.published, unitCount, itemCount };
}
async function getSet(id: string, publicOnly = false) {
  const row = (await db.select().from(examVocabularySets).where(and(eq(examVocabularySets.id, id), publicOnly ? and(eq(examVocabularySets.enabled, true), eq(examVocabularySets.published, true)) : undefined)).limit(1))[0];
  if (!row) throw notFound("找不到段考單字總範圍");
  return row;
}
async function extractWords(userId: string, file: File) {
  const stored = await putObject({ userId, filename: file.name, mimeType: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()), allow: ["image", "pdf"] });
  const object = await readObject(stored.id);
  const { data } = await runAiJson<{ words?: ExtractedWord[]; readable?: boolean; message?: string }>({
    feature: "learning_vocabulary_ocr",
    userId,
    system: "你是高中英文段考單字 OCR 專家。請辨識圖片或 PDF 中所有單字與片語，不能只取幾個。只回傳 JSON：{words:[{word,meaning,partOfSpeech,phonetic,phrase,phraseMeaning,example,exampleZh}],readable:true}。word 必須是英文單字或片語的核心形式；中文意義保留繁體中文；看不清楚的項目不要猜。若圖片不是單字資料，words 回傳空陣列。",
    parts: [{ kind: "image", mimeType: object.mimeType, base64: object.data.toString("base64") }],
    maxOutputTokens: 6000,
  }, { words: [], readable: true });
  return { sourceFile: file.name, objectId: stored.id, words: data.words ?? [], readable: data.readable !== false, message: data.message ?? "" };
}

async function createPdf(set: typeof examVocabularySets.$inferSelect, units: Array<typeof examVocabularyUnits.$inferSelect>, items: Array<typeof examVocabularyItems.$inferSelect>) {
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await embedCjkFont(pdf);
  const mathFont = await embedMathFont(pdf);
  const logoPath = path.join(process.cwd(), "public", "brand", "studynova-logo-square-192.png");
  const logo = fs.existsSync(logoPath) ? await pdf.embedPng(fs.readFileSync(logoPath)) : null;
  const unitNames = new Map(units.map((unit) => [unit.id, unit.title]));
  const safe = (value: string) => sanitizeTextForCjkPdf(value).text;
  let page = pdf.addPage([595, 842]);
  const drawHeader = () => {
    if (logo) page.drawImage(logo, { x: 42, y: 775, width: 32, height: 32 });
    page.drawText(safe("StudyNova AI"), { x: 82, y: 790, size: 15, font, color: rgb(0.08, 0.2, 0.42) });
    page.drawText(safe(`${set.examLabel}｜${set.title}`), { x: 42, y: 750, size: 18, font, color: rgb(0.08, 0.12, 0.22) });
    page.drawText(safe(`單字總覽・共 ${items.length} 字`), { x: 42, y: 730, size: 10, font, color: rgb(0.35, 0.4, 0.5) });
    page.drawText("STUDYNOVA", { x: 205, y: 360, size: 42, font: mathFont, color: rgb(0.3, 0.55, 0.8), rotate: degrees(32), opacity: 0.1 });
  };
  drawHeader();
  let y = 700;
  for (const [index, item] of items.entries()) {
    if (y < 54) { page = pdf.addPage([595, 842]); drawHeader(); y = 700; }
    const unit = unitNames.get(item.unitId) ?? "未分類單元";
    const line = `${index + 1}. ${item.word}  ${item.meaning}${item.partOfSpeech ? `（${item.partOfSpeech}）` : ""}`;
    page.drawText(safe(line).slice(0, 95), { x: 42, y, size: 10.5, font, color: rgb(0.08, 0.12, 0.22) });
    page.drawText(safe(`${unit}${item.phonetic ? `・${item.phonetic}` : ""}`), { x: 60, y: y - 14, size: 8, font, color: rgb(0.34, 0.42, 0.55) });
    if (item.phrase) page.drawText(safe(`片語：${item.phrase}${item.phraseMeaning ? `｜${item.phraseMeaning}` : ""}`).slice(0, 92), { x: 60, y: y - 27, size: 8, font, color: rgb(0.15, 0.42, 0.55) });
    y -= item.phrase ? 48 : 36;
  }
  return Buffer.from(await pdf.save());
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/exam-vocabulary/catalog", auth: "user", handler: async () => {
    const sets = await db.select().from(examVocabularySets).where(and(eq(examVocabularySets.enabled, true), eq(examVocabularySets.published, true))).orderBy(asc(examVocabularySets.sortOrder), asc(examVocabularySets.createdAt));
    const result = [];
    for (const set of sets) {
      const [{ unitCount }] = await db.select({ unitCount: count() }).from(examVocabularyUnits).where(and(eq(examVocabularyUnits.setId, set.id), eq(examVocabularyUnits.enabled, true)));
      const [{ itemCount }] = await db.select({ itemCount: count() }).from(examVocabularyItems).where(eq(examVocabularyItems.setId, set.id));
      result.push(publicSet(set, Number(unitCount ?? 0), Number(itemCount ?? 0)));
    }
    return { enabled: result.length > 0, sets: result, totalItems: result.reduce((sum, item) => sum + item.itemCount, 0) };
  }}),
  route({ method: "GET", path: "/exam-vocabulary/:id", auth: "user", handler: async (ctx) => {
    const set = await getSet(ctx.params.id, true);
    const units = await db.select().from(examVocabularyUnits).where(and(eq(examVocabularyUnits.setId, set.id), eq(examVocabularyUnits.enabled, true))).orderBy(asc(examVocabularyUnits.sortOrder));
    const items = await db.select().from(examVocabularyItems).where(eq(examVocabularyItems.setId, set.id)).orderBy(asc(examVocabularyItems.sortOrder), asc(examVocabularyItems.word));
    return { set, units, items };
  }}),
  route({ method: "GET", path: "/exam-vocabulary/:id/pdf", auth: "user", handler: async (ctx) => {
    const set = await getSet(ctx.params.id, true);
    const units = await db.select().from(examVocabularyUnits).where(eq(examVocabularyUnits.setId, set.id)).orderBy(asc(examVocabularyUnits.sortOrder));
    const items = await db.select().from(examVocabularyItems).where(eq(examVocabularyItems.setId, set.id)).orderBy(asc(examVocabularyItems.sortOrder), asc(examVocabularyItems.word));
    const pdf = await createPdf(set, units, items);
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="studynova-exam-vocabulary-${set.id}.pdf"` } });
  }}),
  route({ method: "GET", path: "/admin/exam-vocabulary", auth: "admin", handler: async () => {
    const sets = await db.select().from(examVocabularySets).orderBy(asc(examVocabularySets.sortOrder), asc(examVocabularySets.createdAt));
    const result = [];
    for (const set of sets) {
      const units = await db.select().from(examVocabularyUnits).where(eq(examVocabularyUnits.setId, set.id)).orderBy(asc(examVocabularyUnits.sortOrder));
      const [{ itemCount }] = await db.select({ itemCount: count() }).from(examVocabularyItems).where(eq(examVocabularyItems.setId, set.id));
      result.push({ ...set, units, itemCount: Number(itemCount ?? 0) });
    }
    return { sets: result };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ title: z.string().min(1).max(160), description: z.string().max(2000).default(""), examLabel: z.string().max(120).default("英文段考"), sortOrder: z.number().int().default(0) }));
    const row = (await db.insert(examVocabularySets).values({ ...body, createdBy: admin.userId }).returning())[0];
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "exam_vocabulary", action: "set.create", resourceId: row.id, ip: ctx.ip });
    return { set: row };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary/:id/units", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ title: z.string().min(1).max(160), description: z.string().max(1000).default(""), sortOrder: z.number().int().default(0) }));
    await getSet(ctx.params.id);
    const row = (await db.insert(examVocabularyUnits).values({ ...body, setId: ctx.params.id }).returning())[0];
    return { unit: row };
  }}),
  route({ method: "PATCH", path: "/admin/exam-vocabulary/:id", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ title: z.string().min(1).max(160).optional(), description: z.string().max(2000).optional(), examLabel: z.string().max(120).optional(), enabled: z.boolean().optional(), published: z.boolean().optional(), sortOrder: z.number().int().optional() }));
    const rows = await db.update(examVocabularySets).set({ ...body, updatedAt: new Date() }).where(eq(examVocabularySets.id, ctx.params.id)).returning();
    if (!rows[0]) throw notFound("找不到段考單字總範圍");
    return { set: rows[0] };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary/:id/upload", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const set = await getSet(ctx.params.id);
    const form = await ctx.formData();
    const unitTitle = String(form.get("unitTitle") ?? "未分類單元").trim().slice(0, 160) || "未分類單元";
    const unit = (await db.insert(examVocabularyUnits).values({ setId: set.id, title: unitTitle, sortOrder: Number(form.get("unitSortOrder") ?? 0) || 0 }).returning())[0];
    const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File).slice(0, 30);
    if (!files.length) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "請至少選擇一張單字或片語圖片。" });
    let accepted = 0; let skipped = 0; const errors: string[] = [];
    for (const file of files) {
      try {
        const result = await extractWords(admin.userId, file);
        const rows = result.words.map((item, index) => ({ setId: set.id, unitId: unit.id, word: String(item.word ?? "").trim().slice(0, 160), meaning: String(item.meaning ?? "").trim().slice(0, 500), partOfSpeech: String(item.partOfSpeech ?? "").trim().slice(0, 80), phonetic: String(item.phonetic ?? "").trim().slice(0, 100), phrase: String(item.phrase ?? "").trim().slice(0, 240), phraseMeaning: String(item.phraseMeaning ?? "").trim().slice(0, 300), example: String(item.example ?? "").trim().slice(0, 500), exampleZh: String(item.exampleZh ?? "").trim().slice(0, 500), sourceFile: result.sourceFile, metadata: { readable: result.readable, objectId: result.objectId }, sortOrder: index } as const)).filter((item) => normalizeWord(item.word));
        for (const row of rows) {
          const normalized = normalizeWord(row.word);
          const existing = (await db.select({ id: examVocabularyItems.id }).from(examVocabularyItems).where(and(eq(examVocabularyItems.setId, set.id), sql`lower(trim(${examVocabularyItems.word})) = ${normalized}`)).limit(1))[0];
          if (existing) { skipped += 1; continue; }
          await db.insert(examVocabularyItems).values(row);
          accepted += 1;
        }
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message.slice(0, 160) : "分析失敗"}`); }
    }
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "exam_vocabulary", action: "items.upload", resourceId: set.id, ip: ctx.ip, metadata: { unitId: unit.id, files: files.length, accepted, skipped, errors: JSON.stringify(errors) } });
    return { setId: set.id, unit, processedFiles: files.length, accepted, skipped, errors };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary/:id/pdf", auth: "admin", handler: async (ctx) => {
    const set = await getSet(ctx.params.id);
    const body = await ctx.json(z.object({ unitId: unitId.optional() }));
    const units = await db.select().from(examVocabularyUnits).where(eq(examVocabularyUnits.setId, set.id)).orderBy(asc(examVocabularyUnits.sortOrder));
    const items = await db.select().from(examVocabularyItems).where(and(eq(examVocabularyItems.setId, set.id), body.unitId ? eq(examVocabularyItems.unitId, body.unitId) : undefined)).orderBy(asc(examVocabularyItems.sortOrder), asc(examVocabularyItems.word));
    const pdf = await createPdf(set, units, items);
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="studynova-exam-vocabulary-${set.id}.pdf"` } });
  }}),
];
