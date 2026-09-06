import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { compressionJobs, platformSettings } from "@/db/schema";
import { fail, notFound } from "../core";
import { route } from "../router";
import { putObject, signObjectUrl } from "../storage";
import { queue } from "../queue";

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
      const stored = await putObject({ userId: user.userId, filename, mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), data, allow: [isPdf ? "pdf" : "image"] });
      const rows = await db.insert(compressionJobs).values({ userId: user.userId, sourceObjectId: stored.id, originalFilename: filename, mimeType: isPdf ? "application/pdf" : (IMAGE_MIMES.has(mime) ? mime : "image/jpeg"), originalSize: data.length, targetSize, mode }).returning();
      const job = rows[0];
      await queue().enqueue({ name: "compression_process", payload: { jobId: job.id, settings: config }, uniqueKey: `compression:${job.id}` });
      void queue().drain(1);
      return { job: { ...job, progress: 0 } };
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
