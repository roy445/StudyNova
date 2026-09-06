import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Document, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { db } from "@/db";
import { aiConversations, aiMessages, dailyTasks, focusSessions, notes, novaTransactions, studyMaterials, studyPlans, studyRecords, tasks, userAchievements, userVocabularies, wrongQuestions, xpTransactions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { grantNova } from "../economy";

const DATASETS = {
  notes: { label: "我的專屬筆記", table: notes },
  vocabulary: { label: "我的單字", table: userVocabularies },
  wrong: { label: "錯題本", table: wrongQuestions },
  studyMaterials: { label: "學習資料與 AI 摘要", table: studyMaterials },
  plans: { label: "個人學習計畫", table: studyPlans },
  studyRecords: { label: "每日學習紀錄", table: studyRecords },
  focus: { label: "專注計時紀錄", table: focusSessions },
  tasks: { label: "任務完成紀錄", table: tasks },
  dailyTasks: { label: "每日任務", table: dailyTasks },
  achievements: { label: "成就與徽章", table: userAchievements },
  nova: { label: "Nova 交易紀錄", table: novaTransactions },
  xp: { label: "XP 紀錄", table: xpTransactions },
} as const;
type Kind = keyof typeof DATASETS;
type Format = "json" | "csv" | "txt" | "md" | "pdf" | "docx" | "xlsx" | "zip";
const KINDS = Object.keys(DATASETS) as Kind[];
const FORMATS = ["json", "csv", "txt", "md", "pdf", "docx", "xlsx", "zip"] as Format[];
const EXPORT_COST: Record<Format, number> = { json: 100, csv: 200, txt: 100, md: 100, pdf: 800, docx: 600, xlsx: 500, zip: 1000 };
function safeKind(value: string): Kind[] { return value === "all" ? KINDS : value.split(",").filter((item): item is Kind => KINDS.includes(item as Kind)); }
function jsonSafe(value: unknown): unknown { if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map(jsonSafe); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)])); return value; }
function rowsToCsv(rows: Array<Record<string, unknown>>) { const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))); const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`; return `\uFEFF${keys.map(quote).join(",")}\n${rows.map((row) => keys.map((key) => quote(JSON.stringify(jsonSafe(row[key])) ?? "")).join(",")).join("\n")}`; }
function rowsToText(rows: Array<Record<string, unknown>>, markdown = false) { return rows.map((row, index) => `${markdown ? `## ${index + 1}\n` : `[#${index + 1}]\n`}${Object.entries(row).map(([key, value]) => `${markdown ? `- **${key}**` : key}: ${typeof value === "object" ? JSON.stringify(jsonSafe(value)) : String(value ?? "")}`).join("\n")}`).join("\n\n"); }
async function loadRows(kind: Kind, userId: string, from?: string, to?: string) {
  const table = DATASETS[kind].table as typeof notes;
  const conditions = [eq(table.userId, userId)];
  if (from && "createdAt" in table) conditions.push(gte(table.createdAt, new Date(from)) as never);
  if (to && "createdAt" in table) conditions.push(lte(table.createdAt, new Date(to)) as never);
  return (await db.select().from(table).where(and(...conditions)).orderBy(desc(table.createdAt)).limit(10000)).map((row) => jsonSafe(row) as Record<string, unknown>);
}
async function renderBinary(rows: Array<Record<string, unknown>>, format: Exclude<Format, "json" | "csv" | "txt" | "md" | "zip">, title: string) {
  const text = rowsToText(rows, false);
  if (format === "pdf") { const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); let page = pdf.addPage([595, 842]); let y = 810; for (const line of text.split("\n").flatMap((line) => line.match(/.{1,95}/g) ?? [""])) { if (y < 40) { page = pdf.addPage([595, 842]); y = 810; } page.drawText(line.replace(/[^\x20-\x7E]/g, " "), { x: 36, y, size: 9, font, color: rgb(0.1, 0.1, 0.15) }); y -= 14; } return Buffer.from(await pdf.save()); }
  if (format === "docx") return Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }), ...text.split("\n").map((line) => new Paragraph(line))] }] }));
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(title.slice(0, 28)); const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))); sheet.addRow(keys); rows.forEach((row) => sheet.addRow(keys.map((key) => typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key]))); return Buffer.from(await workbook.xlsx.writeBuffer());
}
function attachment(data: string | Buffer, filename: string, type: string) { return new Response(typeof data === "string" ? data : (new Uint8Array(data) as unknown as BodyInit), { headers: { "content-type": `${type}; charset=utf-8`, "content-disposition": `attachment; filename="${filename}"` } }); }
export const routes: RouteDef[] = [
  route({ method: "GET", path: "/exports/preview", auth: "user", handler: async (ctx) => { const user = ctx.requireUser(); const kinds = safeKind(ctx.query.get("kind") ?? "all"); const format = (ctx.query.get("format") ?? "json") as Format; if (!kinds.length) return { datasets: [], total: 0, estimatedBytes: 0, cost: 0, sample: [] }; const rows = await Promise.all(kinds.map((kind) => loadRows(kind, user.userId, ctx.query.get("from") ?? undefined, ctx.query.get("to") ?? undefined))); return { datasets: kinds.map((kind, index) => ({ kind, label: DATASETS[kind].label, count: rows[index].length })), total: rows.reduce((sum, item) => sum + item.length, 0), estimatedBytes: rows.reduce((sum, item) => sum + JSON.stringify(item).length, 0), sample: rows.flatMap((items, index) => items.slice(0, 2).map((row) => ({ dataset: DATASETS[kinds[index]].label, ...row }))).slice(0, 6), cost: EXPORT_COST[format] ?? 0, noCharge: true }; } }),
  route({ method: "GET", path: "/exports/preview-file", auth: "user", handler: async (ctx) => { const user = ctx.requireUser(); const kinds = safeKind(ctx.query.get("kind") ?? "all"); const format = (ctx.query.get("format") ?? "pdf") as Format; if (!kinds.length || !FORMATS.includes(format)) throw new Error("預覽格式無效"); const from = ctx.query.get("from") ?? undefined; const to = ctx.query.get("to") ?? undefined; const loaded = await Promise.all(kinds.map(async (kind) => ({ kind, label: DATASETS[kind].label, rows: await loadRows(kind, user.userId, from, to) }))); const rows = loaded.flatMap((item) => item.rows.map((row) => ({ dataset: item.kind, datasetLabel: item.label, ...row }))); if (format === "json") return new Response(JSON.stringify({ version: 1, datasets: loaded }, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "inline" } }); if (format === "csv") return new Response(rowsToCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "inline" } }); if (format === "txt" || format === "md") return new Response(rowsToText(rows, format === "md"), { headers: { "content-type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8", "content-disposition": "inline" } }); const data = await renderBinary(rows, format === "pdf" || format === "docx" || format === "xlsx" ? format : "pdf", "StudyNova Learning Export"); const type = format === "pdf" ? "application/pdf" : format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; return new Response(new Uint8Array(data) as unknown as BodyInit, { headers: { "content-type": type, "content-disposition": "inline" } }); } }),
  route({ method: "GET", path: "/exports/download", auth: "user", rate: { limit: 10, windowSec: 3600 }, handler: async (ctx) => { const user = ctx.requireUser(); const kinds = safeKind(ctx.query.get("kind") ?? "all"); const format = (ctx.query.get("format") ?? "json") as Format; if (!kinds.length || !FORMATS.includes(format)) throw new Error("匯出資料類型或格式無效"); if (ctx.query.get("confirmed") !== "1") throw new Error("請先完成兩次匯出確認"); await grantNova({ userId: user.userId, amount: -EXPORT_COST[format], reason: `資料匯出：${format.toUpperCase()}`, source: "export", idempotencyKey: `export:${user.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` }); const from = ctx.query.get("from") ?? undefined; const to = ctx.query.get("to") ?? undefined; const loaded = await Promise.all(kinds.map(async (kind) => ({ kind, label: DATASETS[kind].label, rows: await loadRows(kind, user.userId, from, to) }))); const stamp = new Date().toISOString().slice(0, 10); if (format === "zip") { const zip = new JSZip(); zip.file("README.txt", `StudyNova 個人資料匯出\n匯出日期：${new Date().toISOString()}\n只包含目前登入使用者自己的資料。`); for (const item of loaded) zip.file(`${item.kind}.json`, JSON.stringify({ label: item.label, rows: item.rows }, null, 2)); return attachment(Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })), `StudyNova_Export_${stamp}.zip`, "application/zip"); } const rows = loaded.flatMap((item) => item.rows.map((row) => ({ dataset: item.kind, datasetLabel: item.label, ...row }))); if (format === "json") return attachment(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), datasets: loaded }, null, 2), `StudyNova_Export_${stamp}.json`, "application/json"); if (format === "csv") return attachment(rowsToCsv(rows), `StudyNova_Export_${stamp}.csv`, "text/csv"); if (format === "txt" || format === "md") return attachment(rowsToText(rows, format === "md"), `StudyNova_Export_${stamp}.${format}`, format === "md" ? "text/markdown" : "text/plain"); const data = await renderBinary(rows, format, "StudyNova Learning Export"); return new Response(new Uint8Array(data) as unknown as BodyInit, { headers: { "content-type": format === "pdf" ? "application/pdf" : format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="StudyNova_Export_${stamp}.${format}"` } }); } }),
];
