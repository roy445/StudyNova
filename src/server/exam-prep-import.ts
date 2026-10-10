import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { examPrepActivities, examPrepImportAssets, examPrepImportJobs, examPrepImportPages, examPrepQuestionDrafts } from "@/db/schema";
import { extractText } from "./routes/content-routes";
import { extractPdfQuestionChunks, parseNumberedChoiceQuestionText, renderPdfImagePages } from "./pdf-question-extract";
import { putObject, readObject } from "./storage";

export function checksum(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

async function updateJob(jobId: string, values: Partial<typeof examPrepImportJobs.$inferInsert>) {
  await db.update(examPrepImportJobs).set({ ...values, updatedAt: new Date() }).where(eq(examPrepImportJobs.id, jobId));
}

function subjectFromName(name: string) {
  if (/數學|數學科|math/i.test(name)) return "數學";
  if (/化學|chem/i.test(name)) return "化學";
  if (/物理|phys/i.test(name)) return "物理";
  if (/英文|英語|english/i.test(name)) return "英文";
  if (/國文|語文|chinese/i.test(name)) return "國文";
  return "其他";
}

export async function processExamPrepImport(jobId: string) {
  const job = (await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("找不到段考考卷匯入工作");
  if (["pending_review", "completed", "cancelled"].includes(job.status)) return { status: job.status, draftCount: job.draftCount };
  const startedAt = new Date();
  await updateJob(jobId, { status: "processing", stage: "pages", progress: 5, startedAt, errorMessage: "" });
  try {
    const original = await readObject(job.objectId!);
    const activity = (await db.select({ name: examPrepActivities.name }).from(examPrepActivities).where(eq(examPrepActivities.id, job.activityId)).limit(1))[0] ?? null;
    const subject = subjectFromName(activity?.name ?? job.filename);
    let chunks: Array<{ pageStart: number; pageEnd: number; text: string }> = [];
    let pageImages: Array<{ page: number; base64: string }> = [];
    let text = "";
    if (original.mimeType === "application/pdf") {
      try { chunks = await extractPdfQuestionChunks(original.data, 12_000); text = chunks.map((chunk) => chunk.text).join("\n\n").trim(); } catch { chunks = []; }
      pageImages = await renderPdfImagePages(original.data, 1.25);
    } else if (original.mimeType.startsWith("image/")) {
      pageImages = [{ page: 1, base64: original.data.toString("base64") }];
      try { text = await extractText(original.mimeType, original.data, job.uploadedBy, subject); } catch { text = ""; }
    } else {
      text = original.data.toString("utf8");
      chunks = [{ pageStart: 1, pageEnd: 1, text }];
    }
    const pageCount = Math.max(pageImages.length, chunks.at(-1)?.pageEnd ?? 1);
    await updateJob(jobId, { stage: "ocr", progress: 25, pageCount });
    const pageRows: Array<{ id: string; pageNumber: number; pageEnd: number; extractedText: string }> = [];
    for (const image of pageImages) {
      const existingChunk = chunks.find((chunk) => image.page >= chunk.pageStart && image.page <= chunk.pageEnd);
      const pageData = Buffer.from(image.base64, "base64");
      let pageText = existingChunk?.text ?? "";
      if (!pageText) {
        try { pageText = (await extractText("image/png", pageData, job.uploadedBy, subject)).trim(); } catch { pageText = ""; }
      }
      const pageObject = await putObject({ userId: job.uploadedBy, filename: `exam-prep-${job.id}-page-${image.page}.png`, mimeType: "image/png", data: pageData, allow: ["image"] });
      const page = (await db.insert(examPrepImportPages).values({ jobId, pageNumber: image.page, pageEnd: existingChunk?.pageEnd ?? image.page, objectId: pageObject.id, extractedText: pageText, status: pageText ? "ready" : "needs_ocr" }).returning({ id: examPrepImportPages.id, pageNumber: examPrepImportPages.pageNumber, pageEnd: examPrepImportPages.pageEnd, extractedText: examPrepImportPages.extractedText }))[0];
      await db.insert(examPrepImportAssets).values({ jobId, pageId: page.id, assetType: "image", objectId: pageObject.id, pageNumber: image.page, label: `原卷第 ${image.page} 頁`, metadata: { source: "pdf-render" } });
      pageRows.push(page);
    }
    if (!pageRows.length) {
      const page = (await db.insert(examPrepImportPages).values({ jobId, pageNumber: 1, pageEnd: 1, extractedText: text, status: text ? "ready" : "needs_ocr" }).returning({ id: examPrepImportPages.id, pageNumber: examPrepImportPages.pageNumber, pageEnd: examPrepImportPages.pageEnd, extractedText: examPrepImportPages.extractedText }))[0];
      pageRows.push(page);
    }
    if (!chunks.length) {
      const ocrChunks = pageRows.filter((page) => page.extractedText.trim()).map((page) => ({ pageStart: page.pageNumber, pageEnd: page.pageEnd || page.pageNumber, text: page.extractedText }));
      chunks = ocrChunks.length ? ocrChunks : text ? [{ pageStart: 1, pageEnd: pageCount, text }] : [];
    }
    await updateJob(jobId, { stage: "question_split", progress: 60 });
    const drafts = chunks.flatMap((chunk) => parseNumberedChoiceQuestionText(chunk.text).map((question) => ({ jobId, activityId: job.activityId, questionNumber: question.questionNumber, pageStart: question.sourcePage ?? chunk.pageStart, pageEnd: chunk.pageEnd, type: question.type, subject, stem: question.stem, options: question.options, answer: question.answer, explanation: question.explanation, confidence: question.confidence, sourceMetadata: { filename: job.filename, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, answerSource: question.answerSource, parser: "deterministic-numbered-choice" }, status: "needs_review" as const })));
    if (drafts.length) await db.insert(examPrepQuestionDrafts).values(drafts);
    await updateJob(jobId, { status: "pending_review", stage: "ready", progress: 100, draftCount: drafts.length, completedAt: new Date() });
    return { status: "pending_review", draftCount: drafts.length, pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "考卷解析失敗";
    await updateJob(jobId, { status: "failed", stage: "failed", errorMessage: message, completedAt: new Date() });
    throw error;
  }
}

export async function listExamPrepImportDetails(jobId: string) {
  const [job] = await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, jobId)).limit(1);
  if (!job) return null;
  const pages = await db.select().from(examPrepImportPages).where(eq(examPrepImportPages.jobId, jobId)).orderBy(asc(examPrepImportPages.pageNumber));
  const assets = await db.select().from(examPrepImportAssets).where(eq(examPrepImportAssets.jobId, jobId)).orderBy(asc(examPrepImportAssets.pageNumber));
  const drafts = await db.select().from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.jobId, jobId)).orderBy(asc(examPrepQuestionDrafts.questionNumber));
  return { job, pages, assets, drafts };
}
