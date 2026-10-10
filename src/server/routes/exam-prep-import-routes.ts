import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { examPrepActivities, examPrepImportJobs, examPrepQuestionDrafts } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { putObject } from "../storage";
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
      const details = await listExamPrepImportDetails(ctx.params.id);
      if (!details) throw notFound("找不到段考考卷匯入工作");
      return details;
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
    method: "PATCH",
    path: "/admin/exam-prep/imports/:id/drafts/:draftId",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ stem: z.string().min(1).max(20000).optional(), options: z.array(z.string().max(5000)).max(20).optional(), answer: z.array(z.string().max(5000)).max(20).optional(), explanation: z.string().max(20000).optional(), subject: z.string().max(60).optional(), adminNote: z.string().max(2000).optional(), status: z.enum(["needs_review", "rejected"]).optional() }));
      const draft = (await db.select({ id: examPrepQuestionDrafts.id }).from(examPrepQuestionDrafts).where(and(eq(examPrepQuestionDrafts.id, ctx.params.draftId), eq(examPrepQuestionDrafts.jobId, ctx.params.id))).limit(1))[0];
      if (!draft) throw notFound("找不到題目草稿");
      const row = (await db.update(examPrepQuestionDrafts).set({ ...body, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id)).returning())[0];
      return { draft: row };
    },
  }),
];
