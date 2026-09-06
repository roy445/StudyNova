import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { compressionJobs, platformSettings } from "@/db/schema";
import { fail, notFound } from "../core";
import { route } from "../router";
import { putObject, signObjectUrl } from "../storage";
import { queue } from "../queue";
import { randomUUID } from "node:crypto";

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const PDF_EXTS = new Set(["pdf"]);
const DEFAULT_SETTINGS = { enabled: true, maxOriginalBytes: 100 * 1024 * 1024, maxBatchFiles: 20, maxProcessingSeconds: 120, maxPdfPages: 100, maxImagePixels: 144_000_000, minImageQuality: 35, maxIterations: 8, allowPdf: true, allowImages: true, allowBatch: true, proOnly: false, dailyFree: 10, dailyPro: 100 };

function ext(filename: string) { return filename.toLowerCase().split(".").pop() ?? ""; }
async function settings() {
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "compression_settings")).limit(1))[0];
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}
function safeTarget(value: string, unit: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) throw fail("REQ_VALIDATION", { message: "目標大小必須是有效的正數" });
  if (!["KB", "MB"].includes(unit)) throw fail("REQ_VALIDATION", { message: "目標大小單位不正確" });
  const bytes = Math.round(n * (unit === "MB" ? 1024 * 1024 : 1024));
  if (bytes < 500 * 1024 || bytes > 100 * 1024 * 1024) throw fail("REQ_VALIDATION", { message: "目標大小必須介於 500 KB 與 100 MB" });
  return bytes;
}

export const routes = [
  route({
    method: "POST", path: "/compress/jobs", auth: "user", rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await settings();
      if (!config.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: "智慧壓縮功能目前未開放" });
      if (config.proOnly && !user.isPro) throw fail("QUOTA_PRO_REQUIRED", { message: "智慧壓縮目前為 Nova Pro 專屬功能" });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(compressionJobs).where(and(eq(compressionJobs.userId, user.userId), gte(compressionJobs.createdAt, today)));
      const dailyLimit = user.isPro ? Number(config.dailyPro) : Number(config.dailyFree);
      if ((count ?? 0) >= dailyLimit) throw fail("QUOTA_EXHAUSTED", { message: `今日智慧壓縮次數已達上限（${dailyLimit} 次）` });
      const form = await ctx.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw fail("REQ_NO_FILE", { message: "請選擇要壓縮的檔案" });
      const filename = file.name.slice(0, 180);
      const extension = ext(filename);
      const mime = (file.type || "").split(";")[0].toLowerCase();
      const isPdf = mime === "application/pdf" || PDF_EXTS.has(extension);
      const isImage = IMAGE_MIMES.has(mime) || IMAGE_EXTS.has(extension);
      if ((!isPdf && !isImage) || (isPdf && !config.allowPdf) || (isImage && !config.allowImages)) throw fail("FILE_MIME_UNSUPPORTED", { message: "目前不支援此檔案格式的智慧壓縮。" });
      const data = Buffer.from(await file.arrayBuffer());
      if (!data.length) throw fail("FILE_EMPTY", { message: "檔案內容為空" });
      if (data.length > Number(config.maxOriginalBytes)) throw fail("FILE_TOO_LARGE", { message: `原始檔案不可超過 ${(Number(config.maxOriginalBytes) / 1024 / 1024).toFixed(0)} MB` });
      const targetSize = safeTarget(String(form.get("targetSize") ?? "5"), String(form.get("targetUnit") ?? "MB"));
      const mode = z.enum(["precise", "best", "fast", "custom"]).parse(String(form.get("mode") ?? "precise"));
      const outputFormat = z.enum(["original", "webp", "jpeg", "avif", "pdf"]).parse(String(form.get("outputFormat") ?? "original"));
      if (outputFormat === "pdf" && !isPdf) throw fail("REQ_VALIDATION", { message: "只有 PDF 檔案可以輸出為 PDF" });
      const stored = await putObject({ userId: user.userId, filename, mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), data, allow: [isPdf ? "pdf" : "image"] });
      const rows = await db.insert(compressionJobs).values({ userId: user.userId, sourceObjectId: stored.id, originalFilename: filename, mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), originalSize: data.length, targetSize, mode, outputFormat }).returning();
      const job = rows[0];
      await queue().enqueue({ name: "compression_process", payload: { jobId: job.id, settings: config }, uniqueKey: `compression:${job.id}` });
      void queue().drain(1);
      return { job: { ...job, progress: 0 } };
    },
  }),
  route({
    method: "POST", path: "/compress/batches", auth: "user", rate: { limit: 10, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await settings();
      if (!config.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: "智慧壓縮功能目前未開放" });
      if (config.proOnly && !user.isPro) throw fail("QUOTA_PRO_REQUIRED", { message: "智慧壓縮目前為 Nova Pro 專屬功能" });
      const form = await ctx.formData();
      const files = form.getAll("files").filter((item): item is File => item instanceof File);
      if (!files.length) throw fail("REQ_NO_FILE", { message: "請至少選擇一個檔案" });
      if (!config.allowBatch || files.length > Number(config.maxBatchFiles)) throw fail("REQ_VALIDATION", { message: `批次最多可選擇 ${config.maxBatchFiles} 個檔案` });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(compressionJobs).where(and(eq(compressionJobs.userId, user.userId), gte(compressionJobs.createdAt, today)));
      const dailyLimit = user.isPro ? Number(config.dailyPro) : Number(config.dailyFree);
      if ((count ?? 0) + files.length > dailyLimit) throw fail("QUOTA_EXHAUSTED", { message: `本批次會超過今日額度（剩餘 ${Math.max(0, dailyLimit - (count ?? 0))} 次）` });
      const targetSize = safeTarget(String(form.get("targetSize") ?? "5"), String(form.get("targetUnit") ?? "MB"));
      const mode = z.enum(["precise", "best", "fast", "custom"]).parse(String(form.get("mode") ?? "precise"));
      const outputFormat = z.enum(["original", "webp", "jpeg", "avif", "pdf"]).parse(String(form.get("outputFormat") ?? "original"));
      const batchId = randomUUID(); const batchName = String(form.get("batchName") ?? `批次壓縮 ${new Date().toLocaleDateString("zh-TW")}`).slice(0, 120); const jobs = [];
      for (const file of files) {
        const extension = ext(file.name); const mime = (file.type || "").split(";")[0].toLowerCase(); const isPdf = mime === "application/pdf" || PDF_EXTS.has(extension); const isImage = IMAGE_MIMES.has(mime) || IMAGE_EXTS.has(extension);
        if ((!isPdf && !isImage) || (isPdf && !config.allowPdf) || (isImage && !config.allowImages)) throw fail("FILE_MIME_UNSUPPORTED", { message: `不支援的檔案格式：${file.name}` });
        if (outputFormat === "pdf" && !isPdf) throw fail("REQ_VALIDATION", { message: "只有 PDF 檔案可以輸出為 PDF" });
        const data = Buffer.from(await file.arrayBuffer());
        if (!data.length) throw fail("FILE_EMPTY", { message: `檔案內容為空：${file.name}` });
        if (data.length > Number(config.maxOriginalBytes)) throw fail("FILE_TOO_LARGE", { message: `檔案過大：${file.name}` });
        const stored = await putObject({ userId: user.userId, filename: file.name.slice(0, 180), mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), data, allow: [isPdf ? "pdf" : "image"] });
        const [job] = await db.insert(compressionJobs).values({ userId: user.userId, sourceObjectId: stored.id, batchId, batchName, originalFilename: file.name.slice(0, 180), mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), originalSize: data.length, targetSize, mode, outputFormat }).returning(); jobs.push(job);
      }
      await queue().enqueue({ name: "compression_batch", payload: { batchId, settings: config }, uniqueKey: `compression-batch:${batchId}` });
      void queue().drain(1);
      return { batchId, batchName, total: jobs.length, completed: 0, failed: 0, progress: 0, zipUrl: null, jobs, status: "queued" };
    },
  }),
  route({
    method: "GET", path: "/compress/batches/:id", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      void queue().drain(1);
      const jobs = await db.select().from(compressionJobs).where(and(eq(compressionJobs.batchId, ctx.params.id), eq(compressionJobs.userId, user.userId))).orderBy(compressionJobs.createdAt);
      if (!jobs.length) throw notFound("找不到批次壓縮工作");
      const done = jobs.filter((job) => ["completed", "completed_with_warning"].includes(job.status)).length;
      const zipObjectId = jobs.find((job) => job.zipObjectId)?.zipObjectId;
      return { batchId: ctx.params.id, batchName: jobs[0].batchName, total: jobs.length, completed: done, failed: jobs.filter((job) => job.status === "failed").length, progress: Math.round((done / jobs.length) * 100), jobs, zipUrl: zipObjectId ? signObjectUrl(zipObjectId, user.userId) : null };
    },
  }),
  route({
    method: "GET", path: "/compress/stats", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser(); const days = Math.min(365, Math.max(7, Number(ctx.query.get("days") ?? 30) || 30)); const from = new Date(Date.now() - days * 86_400_000);
      const rows = await db.select().from(compressionJobs).where(and(eq(compressionJobs.userId, user.userId), gte(compressionJobs.createdAt, from))).orderBy(compressionJobs.createdAt);
      const daily = new Map<string, { count: number; saved: number }>();
      for (const row of rows) { const key = row.createdAt.toISOString().slice(5, 10); const item = daily.get(key) ?? { count: 0, saved: 0 }; item.count += 1; item.saved += row.compressionRatio ?? 0; daily.set(key, item); }
      return { days, totalJobs: rows.length, completedJobs: rows.filter((r) => r.status.includes("completed")).length, totalOriginalBytes: rows.reduce((n, r) => n + r.originalSize, 0), totalCompressedBytes: rows.reduce((n, r) => n + (r.compressedSize ?? 0), 0), averageSavedPercent: rows.length ? rows.reduce((n, r) => n + (r.compressionRatio ?? 0), 0) / rows.length : 0, daily: [...daily.entries()].map(([label, value]) => ({ label, value: value.count, saved: value.saved })).slice(-days) };
    },
  }),
  route({
    method: "GET", path: "/compress/jobs", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(compressionJobs).where(eq(compressionJobs.userId, user.userId)).orderBy(desc(compressionJobs.createdAt)).limit(50);
      return { jobs: rows.map((job) => ({ ...job, progress: job.status === "completed" || job.status === "completed_with_warning" ? 100 : job.stage === "QUEUED" ? 5 : job.stage === "ANALYZING" ? 25 : job.stage === "COMPRESSING" ? 65 : job.stage === "VERIFYING" ? 90 : 0, resultUrl: job.resultObjectId ? signObjectUrl(job.resultObjectId, user.userId) : null })) };
    },
  }),
  route({
    method: "GET", path: "/compress/jobs/:id", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      void queue().drain(2);
      const job = (await db.select().from(compressionJobs).where(and(eq(compressionJobs.id, ctx.params.id), eq(compressionJobs.userId, user.userId))).limit(1))[0];
      if (!job) throw notFound("找不到壓縮工作");
      return { ...job, progress: job.status === "completed" || job.status === "completed_with_warning" ? 100 : job.stage === "QUEUED" ? 5 : job.stage === "ANALYZING" ? 25 : job.stage === "COMPRESSING" ? 65 : job.stage === "VERIFYING" ? 90 : 0, resultUrl: job.resultObjectId ? signObjectUrl(job.resultObjectId, user.userId) : null };
    },
  }),
];
