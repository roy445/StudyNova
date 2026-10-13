import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { examPrepImportAssets, examPrepImportJobs, examPrepImportPages, examPrepQuestionDrafts } from "@/db/schema";
import { putObject, readObject } from "./storage";

export type CropRegion = {
  pageNumber: number;
  role?: "question" | "figure" | "map" | "chart" | "table" | "diagram" | "shared";
  bbox: { x: number; y: number; width: number; height: number };
  coordinateSpace?: "normalized" | "pixels";
  confidence?: number;
  sharedGroupId?: string;
};

type PageInfo = { id: string; pageNumber: number; objectId: string | null; width: number | null; height: number | null };

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function validNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

export function clampCropBox(raw: CropRegion["bbox"], pageWidth: number, pageHeight: number, paddingRatio = 0.025) {
  const x = validNumber(raw.x) ? raw.x : 0;
  const y = validNumber(raw.y) ? raw.y : 0;
  const width = validNumber(raw.width) ? raw.width : 0;
  const height = validNumber(raw.height) ? raw.height : 0;
  if (width <= 0 || height <= 0 || pageWidth <= 1 || pageHeight <= 1) return null;
  const padX = Math.round(width * paddingRatio);
  const padY = Math.round(height * paddingRatio);
  const left = clamp(Math.floor(x - padX), 0, pageWidth - 1);
  const top = clamp(Math.floor(y - padY), 0, pageHeight - 1);
  const right = clamp(Math.ceil(x + width + padX), left + 1, pageWidth);
  const bottom = clamp(Math.ceil(y + height + padY), top + 1, pageHeight);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normaliseRegion(region: CropRegion, pageWidth: number, pageHeight: number) {
  const bbox = region.coordinateSpace === "pixels" || Math.max(Math.abs(region.bbox.x), Math.abs(region.bbox.y), Math.abs(region.bbox.width), Math.abs(region.bbox.height)) > 1.5
    ? region.bbox
    : { x: region.bbox.x * pageWidth, y: region.bbox.y * pageHeight, width: region.bbox.width * pageWidth, height: region.bbox.height * pageHeight };
  return clampCropBox(bbox, pageWidth, pageHeight);
}

function unionBoxes(boxes: Array<NonNullable<ReturnType<typeof clampCropBox>>>) {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function safeRegion(value: unknown): CropRegion | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const bbox = item.bbox && typeof item.bbox === "object" ? item.bbox as Record<string, unknown> : null;
  const pageNumber = Number(item.pageNumber);
  if (!bbox || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const box = { x: Number(bbox.x), y: Number(bbox.y), width: Number(bbox.width), height: Number(bbox.height) };
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
  const role = String(item.role ?? "question") as CropRegion["role"];
  return { pageNumber, bbox: box, role, coordinateSpace: item.coordinateSpace === "pixels" ? "pixels" : "normalized", confidence: Number(item.confidence ?? 0), sharedGroupId: String(item.sharedGroupId ?? "") || undefined };
}

export async function cropExamPrepDraftAssets(draftId: string, userId: string) {
  const draft = (await db.select().from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.id, draftId)).limit(1))[0];
  if (!draft) throw new Error("找不到段考題目草稿");
  const job = (await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, draft.jobId)).limit(1))[0];
  if (!job) throw new Error("找不到段考匯入工作");
  const analysis = draft.analysis && typeof draft.analysis === "object" ? draft.analysis as Record<string, unknown> : {};
  const rawRegions = Array.isArray(analysis.imageRegions) ? analysis.imageRegions.map(safeRegion).filter((item): item is CropRegion => Boolean(item)) : [];
  const pages = await db.select({ id: examPrepImportPages.id, pageNumber: examPrepImportPages.pageNumber, objectId: examPrepImportPages.objectId, width: examPrepImportPages.width, height: examPrepImportPages.height }).from(examPrepImportPages).where(eq(examPrepImportPages.jobId, draft.jobId));
  const pageMap = new Map(pages.map((page) => [page.pageNumber, page]));
  const existingMetadata = draft.sourceMetadata && typeof draft.sourceMetadata === "object" ? draft.sourceMetadata as Record<string, unknown> : {};
  const existingIds = Array.isArray(existingMetadata.assetObjectIds) ? existingMetadata.assetObjectIds.filter((id): id is string => typeof id === "string") : [];
  if (existingMetadata.cropStatus === "ready" && existingIds.length) return { status: "ready" as const, assetObjectIds: existingIds, regions: existingMetadata.cropRegions ?? [] };

  const questionRegions = rawRegions.filter((region) => region.role === "question" || !region.role);
  const figureRegions = rawRegions.filter((region) => region.role && region.role !== "question");
  const byPage = new Map<number, CropRegion[]>();
  for (const region of questionRegions) byPage.set(region.pageNumber, [...(byPage.get(region.pageNumber) ?? []), region]);
  const questionBoxes: Array<{ page: PageInfo; box: NonNullable<ReturnType<typeof clampCropBox>> }> = [];
  for (const [pageNumber, regions] of byPage) {
    const page = pageMap.get(pageNumber);
    if (!page?.objectId) continue;
    const source = await readObject(page.objectId);
    const dimensions = await sharp(source.data).metadata();
    const pageWidth = page.width ?? dimensions.width ?? 0;
    const pageHeight = page.height ?? dimensions.height ?? 0;
    const boxes = regions.map((region) => normaliseRegion(region, pageWidth, pageHeight)).filter((box): box is NonNullable<ReturnType<typeof clampCropBox>> => Boolean(box));
    if (boxes.length) questionBoxes.push({ page, box: unionBoxes(boxes) });
  }
  if (!questionBoxes.length || rawRegions.some((region) => (region.confidence ?? 0) > 0 && (region.confidence ?? 0) < 0.45)) {
    await db.update(examPrepQuestionDrafts).set({ sourceMetadata: { ...existingMetadata, cropStatus: "manual_review", cropError: "AI 未能可靠辨識完整題目範圍，保留原始頁面供管理員確認，但不直接展示整頁。", cropRegions: rawRegions, assetObjectIds: [] }, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    return { status: "manual_review" as const, assetObjectIds: [], regions: rawRegions };
  }

  const assetObjectIds: string[] = [];
  const cropRegions: Array<Record<string, unknown>> = [];
  for (const { page, box } of questionBoxes) {
    const source = await readObject(page.objectId!);
    const cropData = await sharp(source.data).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).png({ compressionLevel: 9 }).toBuffer();
    const stored = await putObject({ userId, filename: `exam-prep-${job.id}-question-${draft.questionNumber ?? draft.id}-page-${page.pageNumber}.png`, mimeType: "image/png", data: cropData, allow: ["image"] });
    assetObjectIds.push(stored.id);
    cropRegions.push({ pageNumber: page.pageNumber, role: "question", bbox: box, coordinateSpace: "pixels", sourcePageObjectId: page.objectId });
    await db.insert(examPrepImportAssets).values({ jobId: job.id, pageId: page.id, assetType: "question_crop", objectId: stored.id, pageNumber: page.pageNumber, bbox: box, label: `第 ${draft.questionNumber ?? "?"} 題裁切`, metadata: { questionDraftId: draft.id, questionNumber: draft.questionNumber, cropStatus: "ready", source: "ai-bbox-sharp" } });
  }

  const shared = new Map<string, string>();
  for (const region of figureRegions) {
    const page = pageMap.get(region.pageNumber);
    if (!page?.objectId) continue;
    const source = await readObject(page.objectId);
    const dimensions = await sharp(source.data).metadata();
    const box = normaliseRegion(region, page.width ?? dimensions.width ?? 0, page.height ?? dimensions.height ?? 0);
    if (!box) continue;
    const key = `${region.sharedGroupId ?? ""}:${page.pageNumber}:${box.x}:${box.y}:${box.width}:${box.height}`;
    let objectId = shared.get(key);
    if (!objectId) {
      const cropData = await sharp(source.data).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).png({ compressionLevel: 9 }).toBuffer();
      const stored = await putObject({ userId, filename: `exam-prep-${job.id}-shared-figure-${page.pageNumber}-${box.x}-${box.y}.png`, mimeType: "image/png", data: cropData, allow: ["image"] });
      objectId = stored.id;
      shared.set(key, objectId);
      await db.insert(examPrepImportAssets).values({ jobId: job.id, pageId: page.id, assetType: region.role === "table" ? "table" : "figure", objectId, pageNumber: page.pageNumber, bbox: box, label: `第 ${draft.questionNumber ?? "?"} 題共用圖表`, metadata: { questionDraftId: draft.id, sharedGroupId: region.sharedGroupId ?? null, cropStatus: "ready", source: "ai-bbox-sharp" } });
    }
    assetObjectIds.push(objectId);
    cropRegions.push({ pageNumber: page.pageNumber, role: region.role, bbox: box, coordinateSpace: "pixels", sharedGroupId: region.sharedGroupId ?? null, objectId });
  }

  await db.update(examPrepQuestionDrafts).set({ sourceMetadata: { ...existingMetadata, cropStatus: "ready", cropRegions, assetObjectIds, sourcePageObjectIds: pages.map((page) => page.objectId).filter((id): id is string => Boolean(id)) }, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
  return { status: "ready" as const, assetObjectIds, regions: cropRegions };
}
