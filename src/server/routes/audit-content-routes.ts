import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, educationGrades, educationSchools, educationStages, educationSubjects, fileContexts, textbookContents, textbookEditions, textbookLessons, userSettings, users } from "@/db/schema";
import { route, type Ctx, type RouteDef } from "../router";
import { fail, notFound, safeErrorMessage } from "../core";
import { writeAudit } from "../audit";
import { putObject } from "../storage";
import { createFileContext } from "../unified-ai-engine";
import { classifyTextbookDatabaseError } from "../textbook-diagnostics";

const idSchema = z.string().uuid();
const stageScope = z.object({ stageId: idSchema.optional(), schoolId: idSchema.optional(), gradeId: idSchema.optional(), subjectId: idSchema.optional() });
const formFlag = (form: FormData, key: string, fallback: boolean) => form.get(key) === null ? fallback : form.get(key) === "true";
function logTextbookDatabaseFailure(ctx: Ctx, error: unknown, operation: string, validation: string) {
  const requestId = ctx.req.headers.get("x-request-id") ?? "unavailable";
  const raw = error instanceof Error ? error : new Error(String(error));
  console.error("[StudyNova][textbook] database failure", {
    requestId,
    route: "/admin/textbooks",
    method: ctx.req.method,
    userId: ctx.user?.userId ?? "anonymous",
    adminRole: ctx.user?.role ?? "unknown",
    errorCode: classifyTextbookDatabaseError(error),
    errorName: raw.name,
    errorMessage: safeErrorMessage(error),
    stack: raw.stack,
    databaseOperation: operation,
    validation,
    timestamp: new Date().toISOString(),
  });
}
// Avoid selecting additive 0041 columns on production databases before migration.
const publicEditionColumns = {
  id: textbookEditions.id,
  stageId: textbookEditions.stageId,
  schoolId: textbookEditions.schoolId,
  gradeId: textbookEditions.gradeId,
  subjectId: textbookEditions.subjectId,
  publisher: textbookEditions.publisher,
  version: textbookEditions.version,
  volume: textbookEditions.volume,
  coverObjectId: textbookEditions.coverObjectId,
  coverUrl: textbookEditions.coverUrl,
  enabled: textbookEditions.enabled,
  sortOrder: textbookEditions.sortOrder,
  createdAt: textbookEditions.createdAt,
  updatedAt: textbookEditions.updatedAt,
};

type OcrImportSettings = { includeQuestion: boolean; includeVocabulary: boolean; includeSentence: boolean; includeHandwriting: boolean; includeNote: boolean; highlightPriority: boolean; confidenceThreshold: number };

async function importConfirmedOcr(params: { editionId: string; contexts: Array<typeof fileContexts.$inferSelect>; settings: OcrImportSettings }) {
  const lesson = (await db.insert(textbookLessons).values({ editionId: params.editionId, title: `OCR 匯入 ${new Date().toLocaleDateString("zh-TW")}`, description: "由 StudyNova OCR 分析匯入，可再由管理員編輯。", sortOrder: 999 }).returning())[0];
  let imported = 0;
  await db.transaction(async (tx) => {
    for (const context of params.contexts) {
      const segments = (context.detected as Array<{ kind?: string; text?: string; confidence?: number }>).filter((segment) => {
        const kind = segment.kind ?? "UNKNOWN";
        const enabled = kind === "QUESTION" ? params.settings.includeQuestion : ["VOCABULARY", "PHRASE"].includes(kind) ? params.settings.includeVocabulary : ["SENTENCE", "ARTICLE"].includes(kind) ? params.settings.includeSentence : kind === "HANDWRITING" ? params.settings.includeHandwriting : ["NOTE", "HIGHLIGHT"].includes(kind) ? params.settings.includeNote : true;
        return enabled && Number(segment.confidence ?? 0) >= params.settings.confidenceThreshold;
      });
      for (const segment of segments) {
        if (!segment.text?.trim()) continue;
        await tx.insert(textbookContents).values({ lessonId: lesson.id, type: segment.kind?.toLowerCase() || "note", title: `${segment.kind || "OCR"} ${imported + 1}`, body: segment.text, metadata: { confidence: segment.confidence ?? 0, source: context.originalName, ocr: true, settings: JSON.stringify(params.settings), contextId: context.id } });
        imported += 1;
      }
    }
  });
  return { lesson, imported };
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/admin/audit-logs", auth: "admin", handler: async (ctx) => {
    const page = Math.max(1, Number(ctx.query.get("page") ?? 1) || 1); const pageSize = Math.min(100, Math.max(10, Number(ctx.query.get("pageSize") ?? 30) || 30));
    const userId = ctx.query.get("userId"); const eventType = ctx.query.get("eventType"); const moduleFilter = ctx.query.get("module"); const outcome = ctx.query.get("outcome"); const resourceId = ctx.query.get("resourceId"); const keyword = ctx.query.get("q")?.trim(); const from = ctx.query.get("from"); const to = ctx.query.get("to");
    const filters = [userId ? eq(auditLogs.userId, userId) : undefined, eventType ? eq(auditLogs.eventType, eventType) : undefined, moduleFilter ? eq(auditLogs.module, moduleFilter) : undefined, outcome ? eq(auditLogs.outcome, outcome) : undefined, resourceId ? eq(auditLogs.resourceId, resourceId) : undefined, from ? gte(auditLogs.occurredAt, new Date(from)) : undefined, to ? lte(auditLogs.occurredAt, new Date(to)) : undefined, keyword ? or(ilike(auditLogs.action, `%${keyword}%`), ilike(auditLogs.resourceId, `%${keyword}%`), ilike(auditLogs.errorCategory, `%${keyword}%`)) : undefined].filter(Boolean);
    const rows = await db.select({ id: auditLogs.id, userId: auditLogs.userId, userName: users.displayName, userNovaId: users.novaId, occurredAt: auditLogs.occurredAt, eventType: auditLogs.eventType, module: auditLogs.module, action: auditLogs.action, resourceId: auditLogs.resourceId, outcome: auditLogs.outcome, errorCategory: auditLogs.errorCategory, correlationId: auditLogs.correlationId, ip: auditLogs.ip, metadata: auditLogs.metadata }).from(auditLogs).leftJoin(users, eq(users.userId, auditLogs.userId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditLogs.occurredAt)).limit(pageSize).offset((page - 1) * pageSize);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(filters.length ? and(...filters) : undefined);
    await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "audit", action: "audit_logs.view", resourceId: userId ?? "all", ip: ctx.ip, metadata: { status: 200, route: "/admin/audit-logs", method: "GET", targetCount: rows.length } });
    return { logs: rows, page, pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / pageSize) };
  }}),
  route({ method: "GET", path: "/admin/audit-summary", auth: "admin", handler: async (ctx) => {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [totals] = await db.select({ total: sql<number>`count(*)::int`, success: sql<number>`coalesce(sum(case when ${auditLogs.outcome} = 'success' then 1 else 0 end), 0)::int`, failure: sql<number>`coalesce(sum(case when ${auditLogs.outcome} = 'failure' then 1 else 0 end), 0)::int` }).from(auditLogs).where(gte(auditLogs.occurredAt, since));
    const byAction = await db.select({ action: auditLogs.action, count: sql<number>`count(*)::int` }).from(auditLogs).where(gte(auditLogs.occurredAt, since)).groupBy(auditLogs.action).orderBy(desc(sql`count(*)`)).limit(50);
    const byUser = await db.select({ userId: auditLogs.userId, userName: users.displayName, userNovaId: users.novaId, count: sql<number>`count(*)::int`, lastActiveAt: sql<Date>`max(${auditLogs.occurredAt})` }).from(auditLogs).leftJoin(users, eq(users.userId, auditLogs.userId)).where(gte(auditLogs.occurredAt, since)).groupBy(auditLogs.userId, users.displayName, users.novaId).orderBy(desc(sql`count(*)`)).limit(50);
    return { date: since.toISOString().slice(0, 10), totals: totals ?? { total: 0, success: 0, failure: 0 }, byAction, byUser };
  }}),
  route({ method: "GET", path: "/admin/audit-logs/:userId/timeline", auth: "admin", handler: async (ctx) => {
    const rows = await db.select({ id: auditLogs.id, userId: auditLogs.userId, userName: users.displayName, userNovaId: users.novaId, occurredAt: auditLogs.occurredAt, eventType: auditLogs.eventType, module: auditLogs.module, action: auditLogs.action, resourceId: auditLogs.resourceId, outcome: auditLogs.outcome, errorCategory: auditLogs.errorCategory, correlationId: auditLogs.correlationId, ip: auditLogs.ip, metadata: auditLogs.metadata }).from(auditLogs).leftJoin(users, eq(users.userId, auditLogs.userId)).where(eq(auditLogs.userId, ctx.params.userId)).orderBy(desc(auditLogs.occurredAt)).limit(200);
    await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "audit", action: "audit_timeline.view", resourceId: ctx.params.userId, ip: ctx.ip, metadata: { status: 200, route: "/admin/audit-logs/:userId/timeline", method: "GET", targetCount: rows.length } });
    return { logs: rows };
  }}),
  route({ method: "GET", path: "/education/options", auth: "user", handler: async () => ({ stages: await db.select().from(educationStages).where(eq(educationStages.enabled, true)).orderBy(asc(educationStages.sortOrder)), schools: await db.select().from(educationSchools).where(eq(educationSchools.enabled, true)).orderBy(asc(educationSchools.sortOrder)), grades: await db.select().from(educationGrades).where(eq(educationGrades.enabled, true)).orderBy(asc(educationGrades.sortOrder)), subjects: await db.select().from(educationSubjects).where(eq(educationSubjects.enabled, true)).orderBy(asc(educationSubjects.sortOrder)) }) }),
  route({ method: "GET", path: "/textbooks", auth: "user", handler: async (ctx) => {
    const q = ctx.query.get("q")?.trim(); const scope = stageScope.safeParse(Object.fromEntries(["stageId", "schoolId", "gradeId", "subjectId"].map(k => [k, ctx.query.get(k) || undefined]))).data ?? {};
    const filters = [eq(textbookEditions.enabled, true), scope.stageId ? eq(textbookEditions.stageId, scope.stageId) : undefined, scope.schoolId ? eq(textbookEditions.schoolId, scope.schoolId) : undefined, scope.gradeId ? eq(textbookEditions.gradeId, scope.gradeId) : undefined, scope.subjectId ? eq(textbookEditions.subjectId, scope.subjectId) : undefined, q ? or(ilike(textbookEditions.publisher, `%${q}%`), ilike(textbookEditions.version, `%${q}%`), ilike(textbookEditions.volume, `%${q}%`)) : undefined].filter(Boolean);
    const rows = await db.select({ edition: publicEditionColumns }).from(textbookEditions).innerJoin(educationStages, eq(educationStages.id, textbookEditions.stageId)).innerJoin(userSettings, eq(userSettings.schoolLevel, educationStages.key)).where(and(...filters, eq(userSettings.userId, ctx.user!.userId))).orderBy(asc(textbookEditions.sortOrder), desc(textbookEditions.createdAt));
    return { editions: rows.map((row) => row.edition) };
  }}),
  route({ method: "GET", path: "/textbooks/:id", auth: "user", handler: async (ctx) => { const edition = (await db.select({ edition: publicEditionColumns }).from(textbookEditions).innerJoin(educationStages, eq(educationStages.id, textbookEditions.stageId)).innerJoin(userSettings, eq(userSettings.schoolLevel, educationStages.key)).where(and(eq(textbookEditions.id, ctx.params.id), eq(textbookEditions.enabled, true), eq(userSettings.userId, ctx.user!.userId))).limit(1))[0]?.edition; if (!edition) throw notFound("找不到符合目前教育階段的教材版本"); const lessons = await db.select().from(textbookLessons).where(and(eq(textbookLessons.editionId, edition.id), eq(textbookLessons.enabled, true))).orderBy(asc(textbookLessons.sortOrder)); const contents = lessons.length ? await db.select().from(textbookContents).where(and(inArray(textbookContents.lessonId, lessons.map(l => l.id)), eq(textbookContents.enabled, true))).orderBy(asc(textbookContents.sortOrder)) : []; return { edition, lessons: lessons.map(l => ({ ...l, contents: contents.filter(c => c.lessonId === l.id) })) }; } }),
  route({ method: "GET", path: "/admin/textbooks", auth: "admin", handler: async () => {
    try {
      return { editions: await db.select().from(textbookEditions).orderBy(asc(textbookEditions.sortOrder), desc(textbookEditions.createdAt)) };
    } catch {
      // Keep the admin page usable while an older production database is still
      // waiting for the additive textbook-detail migration.
      const editions = await db.select({
        id: textbookEditions.id,
        stageId: textbookEditions.stageId,
        schoolId: textbookEditions.schoolId,
        gradeId: textbookEditions.gradeId,
        subjectId: textbookEditions.subjectId,
        publisher: textbookEditions.publisher,
        version: textbookEditions.version,
        volume: textbookEditions.volume,
        coverObjectId: textbookEditions.coverObjectId,
        coverUrl: textbookEditions.coverUrl,
        enabled: textbookEditions.enabled,
        sortOrder: textbookEditions.sortOrder,
        createdAt: textbookEditions.createdAt,
        updatedAt: textbookEditions.updatedAt,
      }).from(textbookEditions).orderBy(asc(textbookEditions.sortOrder), desc(textbookEditions.createdAt));
      return { editions: editions.map((edition) => ({ ...edition, description: "", isbn: "", metadata: {}, ocrStatus: "not_started" })) };
    }
  } }),
  route({ method: "POST", path: "/admin/textbooks", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ ...stageScope.shape, subjectId: idSchema, publisher: z.string().min(1).max(120), version: z.string().max(120).default(""), volume: z.string().max(80).default(""), coverUrl: z.string().url().or(z.literal("/brand/studynova-logo-square.png")).default("/brand/studynova-logo-square.png"), description: z.string().max(2000).default(""), isbn: z.string().max(80).default(""), sortOrder: z.number().int().default(0) }));
    try {
      const row = (await db.insert(textbookEditions).values(body).returning())[0];
      if (!row) throw new Error("textbook_editions insert returned no row");
      await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "edition.create", resourceId: row.id, ip: ctx.ip });
      return { edition: row };
    } catch (error) {
      logTextbookDatabaseFailure(ctx, error, "textbook_editions.insert", "passed");
      throw fail("ADMIN_TEXTBOOK_DB_ERROR");
    }
  } }),
  route({ method: "PATCH", path: "/admin/textbooks/:id", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ subjectId: idSchema.optional(), publisher: z.string().min(1).max(120).optional(), version: z.string().max(120).optional(), volume: z.string().max(80).optional(), coverUrl: z.string().max(500).optional(), description: z.string().max(2000).optional(), isbn: z.string().max(80).optional(), metadata: z.record(z.string(), z.unknown()).optional(), ocrStatus: z.string().max(40).optional(), enabled: z.boolean().optional(), sortOrder: z.number().int().optional() })); const rows = await db.update(textbookEditions).set({ ...body, updatedAt: new Date() }).where(eq(textbookEditions.id, ctx.params.id)).returning(); if (!rows[0]) throw notFound("找不到教材版本"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "edition.update", resourceId: ctx.params.id, ip: ctx.ip }); return { edition: rows[0] }; } }),
  route({ method: "POST", path: "/admin/textbooks/:id/cover", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const edition = (await db.select().from(textbookEditions).where(eq(textbookEditions.id, ctx.params.id)).limit(1))[0]; if (!edition) throw notFound("找不到教材版本"); if (!edition.subjectId) throw new Error("教材尚未設定科目"); const subjectRow = (await db.select({ name: educationSubjects.name }).from(educationSubjects).where(eq(educationSubjects.id, edition.subjectId)).limit(1))[0]; const subject = subjectRow?.name || "其他"; const form = await ctx.formData(); const file = form.get("file"); if (!(typeof File !== "undefined" && file instanceof File)) throw new Error("請選擇封面圖片"); const stored = await putObject({ userId: admin.userId, filename: file.name, mimeType: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()), allow: ["image"] }); const coverUrl = `/api/textbook-covers/${stored.id}`; const row = (await db.update(textbookEditions).set({ coverObjectId: stored.id, coverUrl, updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id)).returning())[0]; await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "textbooks", action: "edition.cover_upload", resourceId: edition.id, ip: ctx.ip, metadata: { objectId: stored.id, filename: file.name } }); return { edition: row, coverUrl }; } }),
  route({
    method: "POST",
    path: "/admin/textbooks/:id/ocr",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const requestId = ctx.req.headers.get("x-request-id") ?? "unavailable";
      const edition = (await db.select().from(textbookEditions).where(eq(textbookEditions.id, ctx.params.id)).limit(1))[0];
      if (!edition) throw notFound("找不到教材版本");
      if (!edition.subjectId) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "教材尚未設定科目，無法開始 OCR。", details: { requestId, stage: "validate_edition", editionId: edition.id } });
      const subjectRow = (await db.select({ name: educationSubjects.name }).from(educationSubjects).where(eq(educationSubjects.id, edition.subjectId)).limit(1))[0];
      const subject = subjectRow?.name || "其他";
      const form = await ctx.formData();
      const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File);
      if (!files.length) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "請上傳教材圖片或 PDF。", details: { requestId, stage: "validate_files" } });
      const invalidFiles = files.filter((file) => !file.type.startsWith("image/") && file.type !== "application/pdf");
      if (invalidFiles.length) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "OCR 目前只接受圖片或 PDF。", details: { requestId, stage: "validate_file_types", invalidFiles: invalidFiles.map((file) => file.name).slice(0, 8) } });
      const threshold = Math.max(0, Math.min(1, Number(form.get("confidenceThreshold") ?? 0.35) || 0.35));
      const settings = { includeQuestion: formFlag(form, "includeQuestion", true), includeVocabulary: formFlag(form, "includeVocabulary", true), includeSentence: formFlag(form, "includeSentence", true), includeHandwriting: formFlag(form, "includeHandwriting", true), includeNote: formFlag(form, "includeNote", true), highlightPriority: formFlag(form, "highlightPriority", true), confidenceThreshold: threshold };
      await db.update(textbookEditions).set({ ocrStatus: "analyzing", metadata: sql`jsonb_set(coalesce(${textbookEditions.metadata}, '{}'::jsonb), '{ocrSettings}', ${JSON.stringify(settings)}::jsonb, true)`, updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id));
      const failedFiles: string[] = [];
      try {
        const results = [];
        for (const file of files.slice(0, 8)) {
          try {
            const stored = await putObject({ userId: admin.userId, filename: file.name, mimeType: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()), allow: ["image", "pdf"] });
            results.push(await createFileContext({ userId: admin.userId, objectId: stored.id, originalName: file.name, batch: Math.floor(Date.now() / 1000), scope: settings, subject }));
          } catch (error) {
            failedFiles.push(file.name);
            console.error("[StudyNova][textbook] OCR file failed", { requestId, fileName: file.name, error: safeErrorMessage(error), stack: error instanceof Error ? error.stack : undefined });
            throw error;
          }
        }
        await db.update(textbookEditions).set({ ocrStatus: "preview_ready", updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id));
        await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "textbooks", action: "edition.ocr_preview", resourceId: edition.id, ip: ctx.ip, metadata: { requestId, files: files.length, settings: JSON.stringify(settings) } });
        return { imported: 0, previewOnly: true, settings, files: results.map((result) => result.context), diagnostics: { requestId, processedFiles: results.length, failedFiles } };
      } catch (error) {
        await db.update(textbookEditions).set({ ocrStatus: "failed", updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id));
        const cause = safeErrorMessage(error).slice(0, 500);
        console.error("[StudyNova][textbook] OCR processing failed", { requestId, editionId: edition.id, subject, fileCount: files.length, failedFiles, errorCode: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "UNKNOWN", cause, stack: error instanceof Error ? error.stack : undefined });
        await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "textbooks", action: "edition.ocr_failed", resourceId: edition.id, ip: ctx.ip, outcome: "failure", errorCategory: "ocr_processing", metadata: { requestId, fileCount: files.length, failedFiles: JSON.stringify(failedFiles), subject, cause } });
        throw fail("ADMIN_TEXTBOOK_PROCESSING_ERROR", { message: "教材 OCR 處理失敗，教材狀態已標記為失敗。", hint: "請確認檔案清晰、格式正確後重試；若仍失敗，請提供錯誤代碼與追蹤編號。", details: { requestId, stage: failedFiles.length ? "file_analysis" : "content_import", failedFiles, cause } });
      }
    },
  }),
  route({
    method: "POST",
    path: "/admin/textbooks/:id/ocr/confirm",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const requestId = ctx.req.headers.get("x-request-id") ?? "unavailable";
      const body = await ctx.json(z.object({ contextIds: z.array(idSchema).min(1).max(8), includeQuestion: z.boolean().default(true), includeVocabulary: z.boolean().default(true), includeSentence: z.boolean().default(true), includeHandwriting: z.boolean().default(true), includeNote: z.boolean().default(true), highlightPriority: z.boolean().default(true), confidenceThreshold: z.number().min(0).max(1).default(0.35) }));
      const edition = (await db.select().from(textbookEditions).where(eq(textbookEditions.id, ctx.params.id)).limit(1))[0];
      if (!edition) throw notFound("找不到教材版本");
      const contexts = await db.select().from(fileContexts).where(and(eq(fileContexts.userId, admin.userId), inArray(fileContexts.id, body.contextIds)));
      if (contexts.length !== body.contextIds.length || contexts.some((context) => context.status !== "ready")) throw fail("ADMIN_TEXTBOOK_REQUEST_INVALID", { message: "部分 OCR 結果不存在或尚未完成，請重新分析。", details: { requestId, stage: "validate_preview", contextCount: contexts.length } });
      try {
        const settings = { includeQuestion: body.includeQuestion, includeVocabulary: body.includeVocabulary, includeSentence: body.includeSentence, includeHandwriting: body.includeHandwriting, includeNote: body.includeNote, highlightPriority: body.highlightPriority, confidenceThreshold: body.confidenceThreshold };
        const result = await importConfirmedOcr({ editionId: edition.id, contexts, settings });
        await db.update(textbookEditions).set({ ocrStatus: "ready", updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id));
        await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "textbooks", action: "edition.ocr_import", resourceId: edition.id, ip: ctx.ip, metadata: { requestId, contextCount: contexts.length, imported: result.imported, settings: JSON.stringify(settings) } });
        return { ...result, confirmed: true, requestId };
      } catch (error) {
        await db.update(textbookEditions).set({ ocrStatus: "failed", updatedAt: new Date() }).where(eq(textbookEditions.id, edition.id));
        throw fail("ADMIN_TEXTBOOK_PROCESSING_ERROR", { message: "OCR 結果匯入失敗，尚未完成匯入。", details: { requestId, stage: "confirmed_import", cause: safeErrorMessage(error) } });
      }
    },
  }),
  route({ method: "DELETE", path: "/admin/textbooks/:id", auth: "admin", handler: async (ctx) => { const rows = await db.update(textbookEditions).set({ enabled: false, updatedAt: new Date() }).where(eq(textbookEditions.id, ctx.params.id)).returning({ id: textbookEditions.id }); if (!rows[0]) throw notFound("找不到教材版本"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "edition.disable", resourceId: ctx.params.id, ip: ctx.ip }); return { disabled: true }; } }),
  route({ method: "POST", path: "/admin/textbooks/:id/lessons", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ title: z.string().min(1).max(160), description: z.string().max(1000).default(""), sortOrder: z.number().int().default(0) })); const row = (await db.insert(textbookLessons).values({ ...body, editionId: ctx.params.id }).returning())[0]; await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "lesson.create", resourceId: row.id, ip: ctx.ip }); return { lesson: row }; } }),
  route({ method: "POST", path: "/admin/textbook-lessons/:id/contents", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ type: z.string().min(1).max(80), title: z.string().min(1).max(160), body: z.string().max(20000), metadata: z.record(z.string(), z.unknown()).default({}), sortOrder: z.number().int().default(0) })); const row = (await db.insert(textbookContents).values({ ...body, lessonId: ctx.params.id }).returning())[0]; await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "content.create", resourceId: row.id, ip: ctx.ip }); return { content: row }; } }),
  route({ method: "PATCH", path: "/admin/textbook-lessons/:id", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ title: z.string().min(1).max(160).optional(), description: z.string().max(1000).optional(), sortOrder: z.number().int().optional(), enabled: z.boolean().optional() })); const rows = await db.update(textbookLessons).set({ ...body, updatedAt: new Date() }).where(eq(textbookLessons.id, ctx.params.id)).returning(); if (!rows[0]) throw notFound("找不到課次"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "lesson.update", resourceId: ctx.params.id, ip: ctx.ip }); return { lesson: rows[0] }; } }),
  route({ method: "DELETE", path: "/admin/textbook-lessons/:id", auth: "admin", handler: async (ctx) => { const rows = await db.update(textbookLessons).set({ enabled: false, updatedAt: new Date() }).where(eq(textbookLessons.id, ctx.params.id)).returning({ id: textbookLessons.id }); if (!rows[0]) throw notFound("找不到課次"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "lesson.disable", resourceId: ctx.params.id, ip: ctx.ip }); return { disabled: true }; } }),
  route({ method: "PATCH", path: "/admin/textbook-contents/:id", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ type: z.string().min(1).max(80).optional(), title: z.string().min(1).max(160).optional(), body: z.string().max(20000).optional(), metadata: z.record(z.string(), z.unknown()).optional(), sortOrder: z.number().int().optional(), enabled: z.boolean().optional() })); const rows = await db.update(textbookContents).set({ ...body, updatedAt: new Date() }).where(eq(textbookContents.id, ctx.params.id)).returning(); if (!rows[0]) throw notFound("找不到教材內容"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "content.update", resourceId: ctx.params.id, ip: ctx.ip }); return { content: rows[0] }; } }),
  route({ method: "DELETE", path: "/admin/textbook-contents/:id", auth: "admin", handler: async (ctx) => { const rows = await db.update(textbookContents).set({ enabled: false, updatedAt: new Date() }).where(eq(textbookContents.id, ctx.params.id)).returning({ id: textbookContents.id }); if (!rows[0]) throw notFound("找不到教材內容"); await writeAudit({ userId: ctx.user?.userId, eventType: "admin_operation", module: "textbooks", action: "content.disable", resourceId: ctx.params.id, ip: ctx.ip }); return { disabled: true }; } }),
];
