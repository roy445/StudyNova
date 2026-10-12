import fs from "node:fs";
import path from "node:path";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { examVocabularyImportJobs, examVocabularyItems, examVocabularySets, examVocabularyUnits, jobQueue } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { deleteObject, putObject, readObject } from "../storage";
import { embedCjkFont, embedMathFont, sanitizeTextForCjkPdf } from "../cjk-font";
import { writeAudit } from "../audit";
import { queue } from "../queue";

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
async function createPdf(set: typeof examVocabularySets.$inferSelect, units: Array<typeof examVocabularyUnits.$inferSelect>, items: Array<typeof examVocabularyItems.$inferSelect>) {
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await embedCjkFont(pdf);
  const mathFont = await embedMathFont(pdf);
  const logoPath = path.join(process.cwd(), "public", "brand", "studynova-logo-square-192.png");
  const logo = fs.existsSync(logoPath) ? await pdf.embedPng(fs.readFileSync(logoPath)) : null;
  const unitNames = new Map(units.map((unit) => [unit.id, unit.title]));
  const safe = (value: string) => sanitizeTextForCjkPdf(value).text;
  const pageWidth = 842;
  const pageHeight = 595;
  const left = 30;
  const tableTop = 438;
  const columns = [
    { key: "no", label: "#", width: 32 },
    { key: "word", label: "單字／片語", width: 125 },
    { key: "meaning", label: "中文意思", width: 155 },
    { key: "phrase", label: "片語與片語意思", width: 165 },
    { key: "example", label: "例句／例句翻譯", width: 335 },
  ] as const;
  const fontSize = 8.5;
  const lineHeight = 11;
  const cellPadding = 6;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const wrapText = (value: string, width: number, maxLines = 5) => {
    const text = safe(value || "—").replace(/\r/g, "");
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      let lineWidth = 0;
      for (const char of paragraph || " ") {
        const charWidth = /[\x00-\xff]/.test(char) ? fontSize * 0.52 : fontSize;
        if (line && lineWidth + charWidth > width) {
          lines.push(line);
          line = "";
          lineWidth = 0;
        }
        line += char;
        lineWidth += charWidth;
      }
      if (line) lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, lines[maxLines - 1].length - 1))}…`;
    }
    return lines.length ? lines : ["—"];
  };
  let pageNumber = 0;
  let page = pdf.addPage([pageWidth, pageHeight]);
  const drawHeader = () => {
    pageNumber += 1;
    if (logo) page.drawImage(logo, { x: left, y: 535, width: 28, height: 28 });
    page.drawText(safe("StudyNova AI"), { x: left + 38, y: 547, size: 14, font, color: rgb(0.08, 0.2, 0.42) });
    page.drawText(safe(`${set.examLabel}｜${set.title}`), { x: left, y: 505, size: 18, font, color: rgb(0.08, 0.12, 0.22) });
    page.drawText(safe(`英文段考單字總覽・共 ${items.length} 字・表格版`), { x: left, y: 486, size: 9, font, color: rgb(0.35, 0.4, 0.5) });
    page.drawText("STUDYNOVA", { x: 300, y: 250, size: 48, font: mathFont, color: rgb(0.3, 0.55, 0.8), rotate: degrees(25), opacity: 0.08 });
    page.drawText(safe(`第 ${pageNumber} 頁`), { x: pageWidth - 70, y: 24, size: 8, font, color: rgb(0.4, 0.45, 0.55) });
  };
  drawHeader();
  let y = tableTop;
  const drawTableHeader = () => {
    let x = left;
    page.drawRectangle({ x: left, y: y - 25, width: tableWidth, height: 25, color: rgb(0.08, 0.25, 0.42), borderColor: rgb(0.2, 0.55, 0.75), borderWidth: 0.8 });
    for (const column of columns) {
      page.drawText(safe(column.label), { x: x + cellPadding, y: y - 17, size: 8.5, font, color: rgb(0.92, 0.98, 1) });
      x += column.width;
      page.drawLine({ start: { x, y: y - 25 }, end: { x, y }, thickness: 0.6, color: rgb(0.2, 0.55, 0.75) });
    }
    y -= 25;
  };
  drawTableHeader();
  for (const [index, item] of items.entries()) {
    const cells = [
      String(index + 1),
      `${item.word}${item.phonetic ? `\n${item.phonetic}` : ""}${item.partOfSpeech ? `\n${item.partOfSpeech}` : ""}`,
      item.meaning,
      item.phrase ? `${item.phrase}${item.phraseMeaning ? `\n${item.phraseMeaning}` : ""}` : "—",
      item.example ? `${item.example}${item.exampleZh ? `\n${item.exampleZh}` : ""}` : "—",
    ];
    const wrapped = cells.map((value, cellIndex) => wrapText(value, columns[cellIndex].width - cellPadding * 2));
    const rowHeight = Math.max(34, ...wrapped.map((lines) => lines.length * lineHeight + cellPadding * 2));
    if (y - rowHeight < 38) {
      page = pdf.addPage([pageWidth, pageHeight]);
      drawHeader();
      y = tableTop;
      drawTableHeader();
    }
    const unit = unitNames.get(item.unitId) ?? "未分類單元";
    let x = left;
    page.drawRectangle({ x: left, y: y - rowHeight, width: tableWidth, height: rowHeight, color: index % 2 === 0 ? rgb(0.97, 0.985, 1) : rgb(0.91, 0.95, 0.98), borderColor: rgb(0.68, 0.78, 0.86), borderWidth: 0.5 });
    wrapped.forEach((lines, cellIndex) => {
      lines.forEach((line, lineIndex) => page.drawText(line, { x: x + cellPadding, y: y - cellPadding - lineIndex * lineHeight - fontSize, size: fontSize, font, color: cellIndex === 0 ? rgb(0.18, 0.32, 0.46) : rgb(0.08, 0.12, 0.2) }));
      x += columns[cellIndex].width;
      page.drawLine({ start: { x, y: y - rowHeight }, end: { x, y }, thickness: 0.45, color: rgb(0.68, 0.78, 0.86) });
    });
    page.drawText(safe(`單元：${unit}`), { x: left + columns[0].width + cellPadding, y: y - rowHeight + 5, size: 6.5, font, color: rgb(0.35, 0.45, 0.55) });
    y -= rowHeight;
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
    // Consume a few pending OCR jobs on page load/manual refresh so old queued jobs cannot remain stuck forever.
    await queue().drain(20);
    const sets = await db.select().from(examVocabularySets).orderBy(asc(examVocabularySets.sortOrder), asc(examVocabularySets.createdAt));
    const result = [];
    for (const set of sets) {
      const units = await db.select().from(examVocabularyUnits).where(eq(examVocabularyUnits.setId, set.id)).orderBy(asc(examVocabularyUnits.sortOrder));
      const items = await db.select({ sourceFile: examVocabularyItems.sourceFile, metadata: examVocabularyItems.metadata }).from(examVocabularyItems).where(eq(examVocabularyItems.setId, set.id));
      const jobs = await db.select({ id: examVocabularyImportJobs.id, filename: examVocabularyImportJobs.filename, status: examVocabularyImportJobs.status, progress: examVocabularyImportJobs.progress, accepted: examVocabularyImportJobs.accepted, skipped: examVocabularyImportJobs.skipped, errorMessage: examVocabularyImportJobs.errorMessage, objectId: examVocabularyImportJobs.objectId }).from(examVocabularyImportJobs).where(eq(examVocabularyImportJobs.setId, set.id)).orderBy(desc(examVocabularyImportJobs.createdAt));
      const sourceMap = new Map<string, { filename: string; jobId: string; itemCount: number; objectIds: string[]; status: string; progress: number; accepted: number; skipped: number; errorMessage: string }>();
      for (const item of items) {
        const filename = item.sourceFile || "未命名來源";
        const current = sourceMap.get(filename) ?? { filename, jobId: "", itemCount: 0, objectIds: [], status: "completed", progress: 100, accepted: 0, skipped: 0, errorMessage: "" };
        current.itemCount += 1;
        const objectId = typeof item.metadata?.objectId === "string" ? item.metadata.objectId : "";
        if (objectId && !current.objectIds.includes(objectId)) current.objectIds.push(objectId);
        sourceMap.set(filename, current);
      }
      for (const job of jobs) {
        const current = sourceMap.get(job.filename) ?? { filename: job.filename, jobId: job.id, itemCount: 0, objectIds: [], status: job.status, progress: job.progress, accepted: 0, skipped: 0, errorMessage: job.errorMessage };
        current.jobId = job.id; current.status = job.status; current.progress = Math.max(current.progress, job.progress); current.accepted += job.accepted; current.skipped += job.skipped; current.errorMessage = job.errorMessage || current.errorMessage;
        if (!current.objectIds.includes(job.objectId)) current.objectIds.push(job.objectId);
        sourceMap.set(job.filename, current);
      }
      result.push({ ...set, units, itemCount: items.length, sources: Array.from(sourceMap.values()) });
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
  route({ method: "DELETE", path: "/admin/exam-vocabulary/:id/sources", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const set = await getSet(ctx.params.id);
    const body = await ctx.json(z.object({ sourceFiles: z.array(z.string().min(1).max(500)).min(1).max(100) }));
    const rows = await db.delete(examVocabularyItems).where(and(eq(examVocabularyItems.setId, set.id), inArray(examVocabularyItems.sourceFile, body.sourceFiles))).returning({ id: examVocabularyItems.id });
    const jobs = await db.delete(examVocabularyImportJobs).where(and(eq(examVocabularyImportJobs.setId, set.id), inArray(examVocabularyImportJobs.filename, body.sourceFiles))).returning({ objectId: examVocabularyImportJobs.objectId });
    for (const job of jobs) await deleteObject(job.objectId, admin.userId, true).catch(() => undefined);
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "exam_vocabulary", action: "items.sources.delete", resourceId: set.id, ip: ctx.ip, metadata: { sourceFiles: JSON.stringify(body.sourceFiles), deleted: rows.length } });
    return { deleted: rows.length, jobsDeleted: jobs.length, sourceFiles: body.sourceFiles };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary/:id/import-jobs/:jobId/retry", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const set = await getSet(ctx.params.id);
    const job = (await db.select().from(examVocabularyImportJobs).where(and(eq(examVocabularyImportJobs.id, ctx.params.jobId), eq(examVocabularyImportJobs.setId, set.id))).limit(1))[0];
    if (!job) throw notFound("找不到這筆 OCR 工作");
    if (job.status !== "failed") throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "只有失敗的 OCR 工作可以重試。" });
    await db.update(examVocabularyImportJobs).set({ status: "queued", progress: 0, accepted: 0, skipped: 0, errorMessage: "", updatedAt: new Date() }).where(eq(examVocabularyImportJobs.id, job.id));
    const uniqueKey = `exam-vocabulary-import:${job.id}`;
    const existingQueue = (await db.update(jobQueue).set({ status: "pending", payload: { jobId: job.id }, runAt: new Date(), attempts: 0, lastError: "", startedAt: null, finishedAt: null }).where(eq(jobQueue.uniqueKey, uniqueKey)).returning({ id: jobQueue.id }))[0];
    if (!existingQueue) await queue().enqueue({ name: "exam_vocabulary_import", payload: { jobId: job.id }, uniqueKey });
    const drained = await queue().drain(1);
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "exam_vocabulary", action: "items.retry", resourceId: set.id, ip: ctx.ip, metadata: { jobId: job.id, filename: job.filename, drained: drained.processed, drainFailed: drained.failed } });
    return { jobId: job.id, filename: job.filename, status: "queued", drained: drained.processed, drainFailed: drained.failed };
  }}),
  route({ method: "POST", path: "/admin/exam-vocabulary/:id/upload", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const set = await getSet(ctx.params.id);
    const form = await ctx.formData();
    const unitTitle = String(form.get("unitTitle") ?? "未分類單元").trim().slice(0, 160) || "未分類單元";
    // Multiple client requests can upload files for the same unit. Reuse the existing
    // unit by set + title instead of creating one unit per image.
    const existingUnit = (await db.select().from(examVocabularyUnits).where(and(eq(examVocabularyUnits.setId, set.id), eq(examVocabularyUnits.title, unitTitle))).orderBy(asc(examVocabularyUnits.sortOrder), asc(examVocabularyUnits.createdAt)).limit(1))[0];
    const unit = existingUnit ?? (await db.insert(examVocabularyUnits).values({ setId: set.id, title: unitTitle, sortOrder: Number(form.get("unitSortOrder") ?? 0) || 0 }).returning())[0];
    const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File).slice(0, 30);
    if (!files.length) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "請至少選擇一張單字或片語圖片。" });
    let queued = 0; let failed = 0; const errors: string[] = [];
    for (const file of files) {
      try {
        const stored = await putObject({ userId: admin.userId, filename: file.name, mimeType: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()), allow: ["image", "pdf"] });
        const job = (await db.insert(examVocabularyImportJobs).values({ setId: set.id, unitId: unit.id, uploadedBy: admin.userId, objectId: stored.id, filename: file.name.slice(0, 500), status: "queued", progress: 0 }).returning({ id: examVocabularyImportJobs.id }))[0];
        await queue().enqueue({ name: "exam_vocabulary_import", payload: { jobId: job.id }, uniqueKey: `exam-vocabulary-import:${job.id}` });
        queued += 1;
      } catch (error) {
        failed += 1;
        errors.push(`${file.name}: ${error instanceof Error ? error.message.slice(0, 160) : "上傳失敗"}`);
      }
    }
    const drained = queued > 0 ? await queue().drain(Math.min(queued, 20)) : { processed: 0, failed: 0, results: [] };
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "exam_vocabulary", action: "items.upload", resourceId: set.id, ip: ctx.ip, metadata: { unitId: unit.id, files: files.length, queued, failed, drained: drained.processed, drainFailed: drained.failed, errors: JSON.stringify(errors) } });
    return { setId: set.id, unit, processedFiles: files.length, queued, failed, drained: drained.processed, drainFailed: drained.failed, errors };
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
