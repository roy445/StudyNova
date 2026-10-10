import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { examPrepActivities, examPrepImportJobs, examPrepQuestionDrafts, questionBankMemberships, questionBanks, questionSources, questionVersions, questions } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { putObject, signObjectUrl } from "../storage";
import { queue } from "../queue";
import { checksum, listExamPrepImportDetails } from "../exam-prep-import";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowedMime = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "text/plain", "text/markdown", "application/json"]);

function normalizeMime(file: File) {
  if (file.type) return file.type.split(";")[0].toLowerCase();
  if (/\.pdf$/i.test(file.name)) return "application/pdf";
  if (/\.(png)$/i.test(file.name)) return "image/png";
  if (/\.(jpe?g)$/i.test(file.name)) return "image/jpeg";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  if (/\.md$/i.test(file.name)) return "text/markdown";
  if (/\.json$/i.test(file.name)) return "application/json";
  return "text/plain";
}

function questionFingerprint(activityId: string, draft: { subject: string; type: string; stem: string }) {
  return createHash("sha256").update(`${activityId}\n${draft.subject}\n${draft.type}\n${draft.stem}`.trim().toLocaleLowerCase()).digest("hex");
}

const draftPatch = z.object({
  stem: z.string().min(1).max(20000).optional(),
  options: z.array(z.string().max(5000)).max(20).optional(),
  answer: z.array(z.string().max(5000)).max(20).optional(),
  explanation: z.string().max(20000).optional(),
  subject: z.string().max(60).optional(),
  adminNote: z.string().max(2000).optional(),
  status: z.enum(["needs_review", "approved", "rejected"]).optional(),
});

async function activity(id: string) {
  const row = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, id)).limit(1))[0];
  if (!row) throw notFound("找不到段考衝刺活動");
  if (row.status === "archived") throw fail("SYS_CONFLICT", { message: "封存活動不可新增考卷匯入" });
  return row;
}

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/admin/exam-prep/activities/:id/imports",
    auth: "admin",
    rate: { limit: 20, windowSec: 3600, key: "exam-prep-import" },
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const target = await activity(ctx.params.id);
      const form = await ctx.formData();
      const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File);
      if (!files.length) throw fail("REQ_NO_FILE", { message: "請至少選擇一份 PDF、圖片或文字檔。" });
      if (files.length > MAX_FILES) throw fail("REQ_VALIDATION", { message: `單次最多上傳 ${MAX_FILES} 份檔案。` });
      const imports: Array<{ id: string; filename: string; status: string }> = [];
      for (const file of files) {
        if (!file.size || file.size > MAX_FILE_BYTES) throw fail("FILE_TOO_LARGE", { message: `${file.name} 超過 50MB 或檔案為空。` });
        const mimeType = normalizeMime(file);
        if (!allowedMime.has(mimeType)) throw fail("FILE_MIME_UNSUPPORTED", { message: `不支援的考卷檔案格式：${mimeType}` });
        const data = Buffer.from(await file.arrayBuffer());
        const fileChecksum = checksum(data);
        const existing = (await db.select().from(examPrepImportJobs).where(and(eq(examPrepImportJobs.activityId, target.id), eq(examPrepImportJobs.checksum, fileChecksum), inArray(examPrepImportJobs.status, ["uploaded", "processing", "pending_review"]))).limit(1))[0];
        if (existing) { imports.push({ id: existing.id, filename: existing.filename, status: existing.status }); continue; }
        const stored = await putObject({ userId: admin.userId, filename: `exam-prep-${target.id}-${file.name}`, mimeType, data, allow: mimeType === "application/pdf" ? ["pdf"] : mimeType.startsWith("image/") ? ["image"] : ["text"] });
        const job = (await db.insert(examPrepImportJobs).values({ activityId: target.id, uploadedBy: admin.userId, filename: file.name.slice(0, 180), mimeType, objectId: stored.id, checksum: fileChecksum, status: "uploaded", stage: "uploaded", progress: 0 }).returning())[0];
        await queue().enqueue({ name: "exam_prep_import", payload: { jobId: job.id }, uniqueKey: `exam-prep-import:${job.id}` });
        void queue().drain(1);
        imports.push({ id: job.id, filename: job.filename, status: job.status });
      }
      return { activityId: target.id, imports };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/activities/:id/imports",
    auth: "admin",
    handler: async (ctx) => {
      await activity(ctx.params.id);
      const jobs = await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.activityId, ctx.params.id)).orderBy(desc(examPrepImportJobs.createdAt)).limit(100);
      return { imports: jobs };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/imports/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const details = await listExamPrepImportDetails(ctx.params.id);
      if (!details) throw notFound("找不到段考考卷匯入工作");
      return { ...details, pages: details.pages.map((page) => ({ ...page, previewUrl: page.objectId ? signObjectUrl(page.objectId, admin.userId) : null })), assets: details.assets.map((asset) => ({ ...asset, previewUrl: signObjectUrl(asset.objectId, admin.userId) })) };
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/imports/:id/retry",
    auth: "admin",
    handler: async (ctx) => {
      const job = (await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, ctx.params.id)).limit(1))[0];
      if (!job) throw notFound("找不到段考考卷匯入工作");
      await db.update(examPrepImportJobs).set({ status: "uploaded", stage: "uploaded", progress: 0, errorMessage: "", updatedAt: new Date() }).where(eq(examPrepImportJobs.id, job.id));
      await queue().enqueue({ name: "exam_prep_import", payload: { jobId: job.id }, uniqueKey: `exam-prep-import:${job.id}:retry:${Date.now()}` });
      void queue().drain(1);
      return { queued: true, jobId: job.id };
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/imports/:id/analyze",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const job = (await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, ctx.params.id)).limit(1))[0];
      if (!job) throw notFound("找不到段考考卷匯入工作");
      const drafts = await db.select({ id: examPrepQuestionDrafts.id }).from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.jobId, job.id));
      if (!drafts.length) throw fail("SYS_CONFLICT", { message: "目前沒有可分析的題目草稿。" });
      await db.update(examPrepQuestionDrafts).set({ analysisStatus: "queued", analysisError: "", updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.jobId, job.id));
      for (const draft of drafts) await queue().enqueue({ name: "exam_prep_draft_analysis", payload: { draftId: draft.id, userId: admin.userId }, uniqueKey: `exam-prep-draft-analysis:${draft.id}:${Date.now()}` });
      void queue().drain(1);
      return { queued: drafts.length, jobId: job.id };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/exam-prep/imports/:id/drafts/:draftId",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json<z.infer<typeof draftPatch>>(draftPatch);
      const draft = (await db.select().from(examPrepQuestionDrafts).where(and(eq(examPrepQuestionDrafts.id, ctx.params.draftId), eq(examPrepQuestionDrafts.jobId, ctx.params.id))).limit(1))[0];
      if (!draft) throw notFound("找不到題目草稿");
      if (body.status === "approved" && (!(draft.quality as { passed?: boolean }).passed || (draft.quality as { answerConflict?: boolean }).answerConflict || draft.analysisStatus !== "completed")) throw fail("SYS_CONFLICT", { message: "題目尚未通過 AI 品質檢查或存在答案衝突，不能確認。" });
      const row = (await db.update(examPrepQuestionDrafts).set({ ...body, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id)).returning())[0];
      return { draft: row };
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/imports/:id/confirm",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ draftIds: z.array(z.string().uuid()).min(1).max(500) }));
      const job = (await db.select().from(examPrepImportJobs).where(eq(examPrepImportJobs.id, ctx.params.id)).limit(1))[0];
      if (!job) throw notFound("找不到段考考卷匯入工作");
      const target = await activity(job.activityId);
      const drafts = await db.select().from(examPrepQuestionDrafts).where(and(eq(examPrepQuestionDrafts.jobId, job.id), inArray(examPrepQuestionDrafts.id, body.draftIds)));
      const invalid = drafts.filter((draft) => draft.status !== "approved" || draft.analysisStatus !== "completed" || !(draft.quality as { passed?: boolean }).passed || (draft.quality as { answerConflict?: boolean }).answerConflict || !draft.stem.trim());
      if (drafts.length !== body.draftIds.length || invalid.length) throw fail("SYS_CONFLICT", { message: "仍有題目未通過 AI 品質檢查、尚未審核或存在答案衝突。", details: { invalidDraftIds: invalid.map((draft) => draft.id) } });
      let bankId = target.questionBankId;
      await db.transaction(async (tx) => {
        if (!bankId) {
          const bank = (await tx.insert(questionBanks).values({ name: `${target.name} 正式題庫`, description: "管理員確認後發布的段考題庫", subject: drafts[0]?.subject ?? "其他", grade: String(target.grade), educationLevel: target.educationLevel, scope: `exam-prep:${target.id}`, bankKind: "exam", scopeMetadata: { examPrepActivityId: target.id }, visibility: "private", status: "published", createdBy: admin.userId }).returning())[0];
          bankId = bank.id;
          await tx.update(examPrepActivities).set({ questionBankId: bank.id, updatedAt: new Date() }).where(eq(examPrepActivities.id, target.id));
        }
        for (const draft of drafts) {
          const fingerprint = questionFingerprint(target.id, draft);
          const existing = (await tx.select().from(questions).where(eq(questions.fingerprint, fingerprint)).limit(1))[0];
          const question = existing ?? (await tx.insert(questions).values({ bankId, origin: "admin", targetBank: "exam", bankCategory: "exam", sourceLabel: `段考考卷 ${job.filename}`, subject: draft.subject, topic: "", chapter: "", unit: "", sourceType: "uploaded_exam_paper", status: "published", level: target.educationLevel, difficulty: "normal", type: draft.type, stem: draft.stem, options: draft.options, answer: draft.answer, explanation: draft.explanation, metadata: { aiAnalysis: draft.analysis, quality: draft.quality, importJobId: job.id, importDraftId: draft.id }, fingerprint }).returning())[0];
          await tx.insert(questionBankMemberships).values({ bankId, questionId: question.id, relation: existing ? "referenced" : "included", sourceMetadata: { importJobId: job.id, importDraftId: draft.id }, addedBy: admin.userId }).onConflictDoNothing();
          await tx.insert(questionSources).values({ questionId: question.id, sourceType: "uploaded_exam_paper", sourceId: null, sourceLabel: `段考 ${target.name}｜${job.filename}`, metadata: { importJobId: job.id, importDraftId: draft.id, pageStart: draft.pageStart, pageEnd: draft.pageEnd }, createdBy: admin.userId });
          if (!existing) await tx.insert(questionVersions).values({ questionId: question.id, version: 1, snapshot: question as unknown as Record<string, unknown>, changeReason: "段考考卷人工審核確認", createdBy: admin.userId });
          await tx.update(examPrepQuestionDrafts).set({ questionId: question.id, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
        }
      });
      await db.update(examPrepImportJobs).set({ status: "completed", stage: "ready", progress: 100, updatedAt: new Date(), completedAt: new Date() }).where(eq(examPrepImportJobs.id, job.id));
      return { confirmed: drafts.length, bankId, activityId: target.id };
    },
  }),
];
