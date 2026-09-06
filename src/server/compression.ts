import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { compressionJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { putObject, readObject } from "./storage";

export type CompressionMode = "precise" | "best" | "fast" | "custom";
export type CompressionSettings = {
  minImageQuality: number;
  maxIterations: number;
  maxImagePixels: number;
  maxPdfPages: number;
  maxProcessingSeconds: number;
};

const DEFAULTS: CompressionSettings = { minImageQuality: 35, maxIterations: 8, maxImagePixels: 144_000_000, maxPdfPages: 100, maxProcessingSeconds: 120 };

async function stage(jobId: string, value: string) {
  await db.update(compressionJobs).set({ stage: value, updatedAt: new Date() }).where(eq(compressionJobs.id, jobId));
}

function qualityLabel(original: number, compressed: number) {
  const ratio = compressed / Math.max(1, original);
  return ratio > 0.7 ? "極佳" : ratio > 0.45 ? "良好" : ratio > 0.25 ? "可接受" : "可能影響細節";
}

async function compressImage(input: Buffer, mime: string, target: number, settings: CompressionSettings, jobId: string) {
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width * height > settings.maxImagePixels) throw new Error("IMAGE_PROCESSING_FAILED:圖片解析度超過管理員限制");
  await stage(jobId, "ANALYZING");
  const outputMime = mime === "image/png" ? "image/webp" : mime === "image/avif" ? "image/avif" : "image/jpeg";
  let scale = 1;
  let best = input;
  let iterations = 0;
  for (let pass = 0; pass < settings.maxIterations; pass += 1) {
    iterations = pass + 1;
    await stage(jobId, "COMPRESSING");
    const q = Math.max(settings.minImageQuality, Math.min(92, 92 - pass * 7));
    const candidate = sharp(input).rotate().resize({ width: Math.max(800, Math.round(width * scale)), withoutEnlargement: true });
    const encoded = outputMime === "image/webp" ? candidate.webp({ quality: q }) : outputMime === "image/avif" ? candidate.avif({ quality: q }) : candidate.jpeg({ quality: q, mozjpeg: true });
    const data = await encoded.toBuffer();
    best = data;
    if (data.length <= target) break;
    scale *= 0.82;
  }
  await stage(jobId, "VERIFYING");
  return { data: best, mimeType: outputMime, filename: `${input.length ? "compressed" : "file"}.${outputMime === "image/webp" ? "webp" : outputMime === "image/avif" ? "avif" : "jpg"}`, iterations, width, height };
}

async function compressPdf(input: Buffer, target: number, settings: CompressionSettings, jobId: string) {
  await stage(jobId, "ANALYZING");
  const source = await PDFDocument.load(input, { ignoreEncryption: false });
  if (source.getPageCount() > settings.maxPdfPages) throw new Error("PDF_PROCESSING_FAILED:PDF 頁數超過管理員限制");
  await stage(jobId, "COMPRESSING");
  source.setTitle(""); source.setAuthor(""); source.setSubject(""); source.setKeywords([]); source.setProducer("StudyNova Smart Compressor");
  const data = Buffer.from(await source.save({ useObjectStreams: true, addDefaultPage: false }));
  await stage(jobId, "VERIFYING");
  return { data, mimeType: "application/pdf", filename: "compressed.pdf", iterations: 1, pages: source.getPageCount(), targetReached: data.length <= target };
}

export async function processCompressionJob(jobId: string, settings: Partial<CompressionSettings> = {}) {
  const limits = { ...DEFAULTS, ...settings };
  const job = (await db.select().from(compressionJobs).where(eq(compressionJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("COMPRESSION_JOB_NOT_FOUND");
  const started = Date.now();
  try {
    await db.update(compressionJobs).set({ status: "processing", stage: "ANALYZING", updatedAt: new Date() }).where(eq(compressionJobs.id, jobId));
    const source = await readObject(job.sourceObjectId);
    if (Date.now() - started > limits.maxProcessingSeconds * 1000) throw new Error("COMPRESSION_TIMEOUT");
    const result = source.mimeType === "application/pdf" ? await compressPdf(source.data, job.targetSize, limits, jobId) : await compressImage(source.data, source.mimeType, job.targetSize, limits, jobId);
    const stored = await putObject({ userId: job.userId, filename: result.filename, mimeType: result.mimeType, data: result.data, allow: [result.mimeType === "application/pdf" ? "pdf" : "image"] });
    const ratio = Math.max(0, (1 - stored.sizeBytes / Math.max(1, job.originalSize)) * 100);
    const reached = stored.sizeBytes <= job.targetSize;
    await db.update(compressionJobs).set({ status: reached ? "completed" : "completed_with_warning", stage: "COMPLETED", resultObjectId: stored.id, compressedSize: stored.sizeBytes, compressionRatio: ratio, qualityScore: qualityLabel(job.originalSize, stored.sizeBytes), iterations: result.iterations, preview: { pages: "pages" in result ? result.pages : undefined, targetReached: reached, targetWarning: reached ? "" : `無法在目前品質限制下壓縮至 ${(job.targetSize / 1024 / 1024).toFixed(2)} MB。` }, updatedAt: new Date(), completedAt: new Date() }).where(eq(compressionJobs.id, jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const [code, ...rest] = message.split(":");
    await db.update(compressionJobs).set({ status: "failed", stage: "FAILED", errorCode: code, errorMessage: rest.join(":") || "壓縮失敗，請確認檔案完整且格式受支援。", updatedAt: new Date(), completedAt: new Date() }).where(eq(compressionJobs.id, jobId));
  }
}
