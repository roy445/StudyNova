#!/usr/bin/env node
/**
 * Batch-convert previously uploaded PDFs/images/JSON files into the StudyNova
 * question-bank import format. This script is intentionally repeatable:
 * identical questions are deduplicated by the API fingerprint on import.
 *
 * Examples:
 *   node scripts/import-question-files.mjs --input /home/ubuntu/upload --out /tmp/studynova-questions.json
 *   node scripts/import-question-files.mjs --input ./materials --out ./question-import.json --max 5000
 *
 * Images use local tesseract when available. If tesseract is unavailable, set
 * OPENAI_API_KEY and optionally OPENAI_API_BASE/OPENAI_VISION_MODEL to enable
 * vision OCR. The script never invents an answer when OCR is unclear.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key.startsWith("--")) args.set(key.slice(2), process.argv[i + 1]?.startsWith("--") ? "true" : (process.argv[++i] ?? "true"));
}
const input = path.resolve(args.get("input") ?? "/home/ubuntu/upload");
const output = path.resolve(args.get("out") ?? path.join(process.cwd(), "question-import.json"));
const max = Number(args.get("max") ?? "5000");
const dryRun = args.get("dry-run") === "true";
const endpoint = args.get("endpoint") ?? process.env.STUDYNOVA_IMPORT_ENDPOINT;
const cookie = args.get("cookie") ?? process.env.STUDYNOVA_SESSION_COOKIE;
const extensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".json", ".jsonl"]);
if (args.get("include-text") === "true") [".txt", ".md"].forEach((extension) => extensions.add(extension));
const files = fs.statSync(input).isDirectory() ? walk(input).filter((file) => extensions.has(path.extname(file).toLowerCase())) : [input];
const all = [];
const report = [];

for (const file of files) {
  try {
    const ext = path.extname(file).toLowerCase();
    let items = [];
    if (ext === ".json" || ext === ".jsonl") items = parseJsonFile(file);
    else {
      const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
      const text = ext === ".pdf" ? extractPdf(file) : isImage ? await extractImage(file) : fs.readFileSync(file, "utf8");
      if (isImage && !text.trim()) throw new Error("OCR 沒有讀到文字；請確認圖片清晰，或設定 OPENAI_API_KEY 使用視覺 OCR");
      items = parseTextToQuestions(text, path.basename(file));
    }
    const before = all.length;
    for (const item of items) {
      if (all.length >= max) break;
      all.push(item);
    }
    report.push({ file, extracted: all.length - before, status: "ok" });
  } catch (error) {
    report.push({ file, extracted: 0, status: "error", error: String(error.message ?? error) });
  }
}

const unique = dedupe(all);
const payload = { generatedAt: new Date().toISOString(), sourceDirectory: input, count: unique.length, items: unique, report };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(unique, null, 2) + "\n");
console.log(JSON.stringify({ output, files: files.length, extracted: all.length, unique: unique.length, report }, null, 2));
if (!dryRun && endpoint) {
  if (!cookie) throw new Error("指定 --endpoint 時必須同時提供 --cookie 或 STUDYNOVA_SESSION_COOKIE");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ items: unique }) });
  const body = await response.text();
  if (!response.ok) throw new Error(`題庫 API 匯入失敗 HTTP ${response.status}: ${body}`);
  console.log(`\n已自動匯入 StudyNova：${body}`);
} else if (!dryRun) {
  console.log(`\n下一步：在後台題庫頁貼上 ${output} 內容；若要自動匯入，請加上 --endpoint 與 --cookie。`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function extractPdf(file) {
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
}
function parseJsonFile(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  const parsed = file.endsWith(".jsonl") ? raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [parsed];
  return list.map((item) => normalizeItem(item, path.basename(file))).filter(Boolean);
}
async function extractImage(file) {
  if (spawnSync("tesseract", ["--version"], { stdio: "ignore" }).status === 0) {
    return execFileSync("tesseract", [file, "stdout", "-l", process.env.TESSERACT_LANG ?? "eng+chi_tra"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("找不到 tesseract；圖片 OCR 請安裝 tesseract 或設定 OPENAI_API_KEY");
  const base64 = fs.readFileSync(file).toString("base64");
  const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const base = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";
  const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini", temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: "請逐行 OCR 這張題目圖片。只輸出看得清楚的原文，不要猜測，不要加解釋。" }, { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }] }] }) });
  if (!response.ok) throw new Error(`Vision OCR HTTP ${response.status}: ${await response.text()}`);
  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? "";
}
function parseTextToQuestions(text, filename) {
  const sourceLabel = filename.replace(/\.[^.]+$/, "");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 3);
  const result = [];
  for (const line of lines) {
    if (/^(page|第\s*\d+\s*頁|目錄|contents?)\b/i.test(line)) continue;
    const match = line.match(/^(.{2,120}?)(?:\s{2,}|\t+|\s+[—–-]\s+|\s*[:：]\s*)(.{1,300})$/);
    if (!match) continue;
    const left = clean(match[1]);
    const right = clean(match[2]);
    if (!left || !right || left.length > 160 || right.length > 400) continue;
    result.push({ subject: guessSubject(filename, left), topic: guessTopic(filename), bankCategory: guessCategory(filename), sourceLabel, level: /高中|senior|高一|高二|高三/i.test(filename) ? "senior" : "junior", difficulty: "normal", type: "short", stem: `請寫出「${left}」的意思或適當翻譯。`, options: [], answer: [right], explanation: `來源：${sourceLabel}` });
  }
  return result;
}
function normalizeItem(item, filename) {
  if (!item || typeof item !== "object" || !item.stem || !item.answer) return null;
  const answer = Array.isArray(item.answer) ? item.answer.map(String) : [String(item.answer)];
  return { subject: String(item.subject ?? guessSubject(filename, String(item.stem))), topic: String(item.topic ?? guessTopic(filename)), bankCategory: String(item.bankCategory ?? guessCategory(filename)), sourceLabel: String(item.sourceLabel ?? filename.replace(/\.[^.]+$/, "")), level: item.level === "senior" ? "senior" : "junior", difficulty: String(item.difficulty ?? "normal"), type: String(item.type ?? "short"), stem: String(item.stem), options: Array.isArray(item.options) ? item.options.map(String) : [], answer, explanation: String(item.explanation ?? "") };
}
function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => { const key = `${item.subject}|${item.stem.toLowerCase()}|${item.answer.join("|").toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function clean(value) { return value.replace(/^[-•●]+\s*/, "").replace(/\s+/g, " ").trim(); }
function guessCategory(filename) { if (/片語|phrase/i.test(filename)) return "英文片語"; if (/週考|weekly|小考/i.test(filename)) return "每週小考"; if (/高中|senior|高一|高二|高三/i.test(filename)) return "高中題庫"; return "匯入題庫"; }
function guessTopic(filename) { return /片語|phrase/i.test(filename) ? "片語" : "綜合閱讀"; }
function guessSubject(filename, text) { if (/math|數學/i.test(filename)) return "數學"; if (/自然|science|physics|chemistry/i.test(filename)) return "自然"; if (/社會|history|geography/i.test(filename)) return "社會"; if (/國文|中文/i.test(filename)) return "國文"; return /[一-龥]/.test(text) && !/[a-zA-Z]/.test(text) ? "國文" : "英文"; }
