import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  weeklyExamWeeks,
  weeklyExamFiles,
  weeklyExamDrafts,
  weeklyExamQuestions,
  weeklyExamAnswers,
  weeklyExamWords,
  weeklyExamSentences,
  weeklyExamAttempts,
  weeklyExamResults,
  groupMembers,
  users,
  storageObjects,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, forbidden, isoWeekCode, notFound, sanitizeText } from "../core";
import { adminLog, grantLearningReward, grantNova, isProUser } from "../economy";
import { isWeekOpen } from "../queue";
import { putObject, readObject, deleteObject, signObjectUrl, createPresignedUpload, verifyPresignedUpload, objectOwner } from "../storage";
import { runAi, runAiJson, aiConfigured } from "../ai";
import { recordStudy } from "./learning-routes";
import { notify } from "../notify";

type WeekRow = typeof weeklyExamWeeks.$inferSelect;

async function assertAccess(week: WeekRow, userId: string, isPro: boolean) {
  if (!isWeekOpen(week)) throw fail("WEEK_NOT_OPEN");
  if (week.proOnly && !isPro) throw fail("WEEK_PRO_ONLY");
  if (week.allowedUserIds.length && !week.allowedUserIds.includes(userId)) {
    if (!week.allowedGroupIds.length) throw fail("WEEK_NOT_ALLOWED");
  }
  if (week.allowedGroupIds.length) {
    const rows = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), inArray(groupMembers.groupId, week.allowedGroupIds)));
    if (!rows.length && !week.allowedUserIds.includes(userId)) throw fail("WEEK_NOT_ALLOWED", { message: "你不在這個週次的開放班級中" });
  }
}

export const routes: RouteDef[] = [
  /* ================================================= STUDENT SIDE */
  route({
    method: "GET",
    path: "/weekly",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const weeks = await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.status, "published")).orderBy(desc(weeklyExamWeeks.weekCode)).limit(30);
      const results = await db.select().from(weeklyExamResults).where(eq(weeklyExamResults.userId, user.userId));
      return {
        weeks: weeks.map((w) => ({
          id: w.id,
          weekCode: w.weekCode,
          title: w.title,
          note: w.note,
          novaCost: w.novaCost,
          proOnly: w.proOnly,
          open: isWeekOpen(w),
          openDays: w.openDays,
          openTime: w.openTime,
          closeTime: w.closeTime,
          myResult: results.find((r) => r.weekId === w.id) ?? null,
        })),
      };
    },
  }),

  route({
    method: "GET",
    path: "/weekly/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week || week.status !== "published") throw fail("WEEK_NOT_FOUND");
      await assertAccess(week, user.userId, user.isPro);

      const words = await db.select().from(weeklyExamWords).where(and(eq(weeklyExamWords.weekId, week.id), eq(weeklyExamWords.published, true)));
      const sentences = await db.select().from(weeklyExamSentences).where(and(eq(weeklyExamSentences.weekId, week.id), eq(weeklyExamSentences.published, true)));
      const questions = await db
        .select({ id: weeklyExamQuestions.id, orderIndex: weeklyExamQuestions.orderIndex, stem: weeklyExamQuestions.stem, options: weeklyExamQuestions.options })
        .from(weeklyExamQuestions)
        .where(and(eq(weeklyExamQuestions.weekId, week.id), eq(weeklyExamQuestions.published, true)))
        .orderBy(asc(weeklyExamQuestions.orderIndex));
      const files = await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.weekId, week.id)).orderBy(asc(weeklyExamFiles.orderIndex));
      const attempt = (
        await db
          .select()
          .from(weeklyExamAttempts)
          .where(and(eq(weeklyExamAttempts.weekId, week.id), eq(weeklyExamAttempts.userId, user.userId), eq(weeklyExamAttempts.status, "in_progress")))
          .limit(1)
      )[0];
      const result = (await db.select().from(weeklyExamResults).where(and(eq(weeklyExamResults.weekId, week.id), eq(weeklyExamResults.userId, user.userId))).limit(1))[0];

      return {
        week: { id: week.id, weekCode: week.weekCode, title: week.title, note: week.note, highlightMap: week.highlightMap, novaCost: week.novaCost, open: true },
        words,
        sentences,
        questions,
        papers: files
          .filter((f) => f.fileKind === "paper" || f.fileKind === "extra" || (f.fileKind === "answer" && Boolean(result)))
          .map((f) => ({ id: f.id, kind: f.fileKind, order: f.orderIndex, url: f.objectId ? signObjectUrl(f.objectId, user.userId) : null })),
        attempt: attempt ?? null,
        result: result ?? null,
      };
    },
  }),

  route({
    method: "POST",
    path: "/weekly/:id/start",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week || week.status !== "published") throw fail("WEEK_NOT_FOUND");
      await assertAccess(week, user.userId, user.isPro);
      const done = (await db.select().from(weeklyExamResults).where(and(eq(weeklyExamResults.weekId, week.id), eq(weeklyExamResults.userId, user.userId))).limit(1))[0];
      if (done) throw fail("WEEK_ALREADY_DONE");
      const existing = (
        await db
          .select()
          .from(weeklyExamAttempts)
          .where(and(eq(weeklyExamAttempts.weekId, week.id), eq(weeklyExamAttempts.userId, user.userId), eq(weeklyExamAttempts.status, "in_progress")))
          .limit(1)
      )[0];
      if (existing) return { attempt: existing, resumed: true };
      if (week.novaCost > 0) {
        await grantNova({
          userId: user.userId,
          amount: -week.novaCost,
          reason: `參加每週小考：${week.title}`,
          source: "weekly_exam",
          idempotencyKey: `weekentry:${week.id}:${user.userId}`,
        });
      }
      const rows = await db.insert(weeklyExamAttempts).values({ weekId: week.id, userId: user.userId }).returning();
      return { attempt: rows[0], resumed: false };
    },
  }),

  route({
    method: "POST",
    path: "/weekly/attempts/:id/save",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ questionId: z.string().uuid(), response: z.array(z.string().max(400)).max(6) }));
      const attempt = (await db.select().from(weeklyExamAttempts).where(eq(weeklyExamAttempts.id, ctx.params.id)).limit(1))[0];
      if (!attempt) throw notFound("找不到作答紀錄");
      if (attempt.userId !== user.userId) throw forbidden();
      if (attempt.status !== "in_progress") throw fail("WEEK_ALREADY_SUBMITTED");
      const responses = { ...attempt.responses, [body.questionId]: body.response };
      await db.update(weeklyExamAttempts).set({ responses }).where(eq(weeklyExamAttempts.id, attempt.id));
      return { saved: true };
    },
  }),

  route({
    method: "POST",
    path: "/weekly/attempts/:id/submit",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const attempt = (await db.select().from(weeklyExamAttempts).where(eq(weeklyExamAttempts.id, ctx.params.id)).limit(1))[0];
      if (!attempt) throw notFound("找不到作答紀錄");
      if (attempt.userId !== user.userId) throw forbidden();
      if (attempt.status === "submitted") throw fail("WEEK_ALREADY_SUBMITTED");
      const questions = await db
        .select()
        .from(weeklyExamQuestions)
        .where(and(eq(weeklyExamQuestions.weekId, attempt.weekId), eq(weeklyExamQuestions.published, true)))
        .orderBy(asc(weeklyExamQuestions.orderIndex));

      let correct = 0;
      const review = questions.map((q) => {
        const got = attempt.responses[q.id] ?? [];
        const ok = q.answer.length > 0 && got[0] !== undefined && q.answer.some((a) => a.trim().toLowerCase() === String(got[0]).trim().toLowerCase());
        if (ok) correct += 1;
        return { id: q.id, stem: q.stem, options: q.options, answer: q.answer, explanation: q.explanation, response: got, isCorrect: ok };
      });
      const total = questions.length || 1;
      const score = Math.round((correct / total) * 1000) / 10;

      const updated = await db
        .update(weeklyExamAttempts)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(and(eq(weeklyExamAttempts.id, attempt.id), eq(weeklyExamAttempts.status, "in_progress")))
        .returning();
      if (!updated[0]) throw fail("WEEK_ALREADY_SUBMITTED");

      const result = await db
        .insert(weeklyExamResults)
        .values({ weekId: attempt.weekId, userId: user.userId, attemptId: attempt.id, score, total: questions.length, correctCount: correct })
        .onConflictDoUpdate({
          target: [weeklyExamResults.weekId, weeklyExamResults.userId],
          set: { score, total: questions.length, correctCount: correct, attemptId: attempt.id },
        })
        .returning();

      let reward = null;
      const claim = await db
        .update(weeklyExamResults)
        .set({ rewardGranted: true })
        .where(and(eq(weeklyExamResults.id, result[0].id), eq(weeklyExamResults.rewardGranted, false)))
        .returning({ id: weeklyExamResults.id });
      if (claim[0]) {
        reward = await grantLearningReward({
          userId: user.userId,
          nova: 20 + Math.round(score / 5),
          xp: 40 + correct * 5,
          reason: "完成每週小考",
          idempotencyKey: `weekexam:${attempt.weekId}:${user.userId}`,
        });
        await recordStudy({ userId: user.userId, kind: "weekly_exam", subject: "英文", minutes: 15, detail: { weekId: attempt.weekId, score } });
      }
      return { score, correct, total: questions.length, review, reward, result: result[0] };
    },
  }),

  route({
    method: "POST",
    path: "/weekly/:id/recite",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      const rows = await db
        .insert(weeklyExamResults)
        .values({ weekId: week.id, userId: user.userId, reciteCompleted: true })
        .onConflictDoUpdate({ target: [weeklyExamResults.weekId, weeklyExamResults.userId], set: { reciteCompleted: true } })
        .returning();
      await grantLearningReward({ userId: user.userId, nova: 10, xp: 20, reason: "完成本週快速背誦", idempotencyKey: `weekrecite:${week.id}:${user.userId}` });
      return { result: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/weekly/:id/stats",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const weekId = ctx.params.id;
      const rows = await db.select().from(weeklyExamResults).where(eq(weeklyExamResults.weekId, weekId));
      const scores = rows.map((r) => r.score).sort((a, b) => b - a);
      const mine = rows.find((r) => r.userId === user.userId) ?? null;
      const rank = mine ? scores.findIndex((s) => s === mine.score) + 1 : null;
      return {
        participants: rows.length,
        average: rows.length ? Math.round((scores.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10 : 0,
        highest: scores[0] ?? 0,
        lowest: scores[scores.length - 1] ?? 0,
        myScore: mine?.score ?? null,
        rank,
        reciteRate: rows.length ? Math.round((rows.filter((r) => r.reciteCompleted).length / rows.length) * 100) : 0,
      };
    },
  }),

  /* ================================================== ADMIN SIDE */
  route({
    method: "GET",
    path: "/admin/weekly",
    auth: "admin",
    handler: async () => {
      const weeks = await db.select().from(weeklyExamWeeks).orderBy(desc(weeklyExamWeeks.weekCode));
      const out = [];
      for (const w of weeks) {
        const [counts] = await db
          .select({
            questions: sql<number>`(select count(*) from weekly_exam_questions q where q.week_id = ${w.id})::int`,
            words: sql<number>`(select count(*) from weekly_exam_words x where x.week_id = ${w.id})::int`,
            sentences: sql<number>`(select count(*) from weekly_exam_sentences s where s.week_id = ${w.id})::int`,
            files: sql<number>`(select count(*) from weekly_exam_files f where f.week_id = ${w.id})::int`,
            results: sql<number>`(select count(*) from weekly_exam_results r where r.week_id = ${w.id})::int`,
          })
          .from(weeklyExamWeeks)
          .where(eq(weeklyExamWeeks.id, w.id));
        out.push({ ...w, open: isWeekOpen(w), counts });
      }
      return { weeks: out, currentWeekCode: isoWeekCode() };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          weekCode: z.string().regex(/^\d{4}-W\d{2}$/, "格式需為 2026-W35"),
          title: z.string().min(1).max(80),
          note: z.string().max(1000).optional(),
        }),
      );
      const rows = await db
        .insert(weeklyExamWeeks)
        .values({ weekCode: body.weekCode, title: body.title, note: body.note ?? "" })
        .onConflictDoNothing()
        .returning();
      if (!rows[0]) throw fail("WEEK_CODE_EXISTS");
      await adminLog({ actorId: admin.userId, action: "weekly.create", targetType: "week", targetId: rows[0].id, after: { weekCode: body.weekCode }, ip: ctx.ip });
      return { week: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/weekly/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw notFound("找不到每週小考");
      const rows = await db.update(weeklyExamWeeks).set({ status: "archived", updatedAt: new Date() }).where(eq(weeklyExamWeeks.id, week.id)).returning();
      await adminLog({ actorId: admin.userId, action: "weekly.archive", targetType: "week", targetId: week.id, before: { status: week.status }, after: { status: "archived" }, ip: ctx.ip });
      return { week: rows[0], preservedHistory: true };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/weekly/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(80).optional(),
          note: z.string().max(1000).optional(),
          status: z.enum(["draft", "published", "archived"]).optional(),
          openMode: z.enum(["schedule", "manual_open", "manual_close"]).optional(),
          openDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
          openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          openFrom: z.string().datetime().nullable().optional(),
          openUntil: z.string().datetime().nullable().optional(),
          novaCost: z.number().int().min(0).max(5000).optional(),
          proOnly: z.boolean().optional(),
          allowedUserIds: z.array(z.string().uuid()).max(500).optional(),
          allowedGroupIds: z.array(z.string().uuid()).max(50).optional(),
          highlightMap: z.record(z.string(), z.string()).optional(),
        }),
      );
      const before = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!before) throw fail("WEEK_NOT_FOUND");
      const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.openFrom !== undefined) patch.openFrom = body.openFrom ? new Date(body.openFrom) : null;
      if (body.openUntil !== undefined) patch.openUntil = body.openUntil ? new Date(body.openUntil) : null;
      const rows = await db.update(weeklyExamWeeks).set(patch).where(eq(weeklyExamWeeks.id, ctx.params.id)).returning();
      await adminLog({ actorId: admin.userId, action: "weekly.update", targetType: "week", targetId: ctx.params.id, before, after: rows[0], ip: ctx.ip });
      if (body.status === "published") {
        const students = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
        for (const s of students) {
          await notify({ userId: s.userId, kind: "weekly_exam", title: `📚 ${rows[0].title} 已發布`, body: "本週補習小考內容已上線", link: "/weekly", dedupeKey: `weekpub:${rows[0].id}:${s.userId}` });
        }
      }
      return { week: { ...rows[0], open: isWeekOpen(rows[0]) } };
    },
  }),

  route({
    method: "GET",
    path: "/admin/weekly/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      const files = await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.weekId, week.id)).orderBy(asc(weeklyExamFiles.fileKind), asc(weeklyExamFiles.orderIndex));
      const drafts = await db.select().from(weeklyExamDrafts).where(eq(weeklyExamDrafts.weekId, week.id)).orderBy(desc(weeklyExamDrafts.createdAt));
      const questions = await db.select().from(weeklyExamQuestions).where(eq(weeklyExamQuestions.weekId, week.id)).orderBy(asc(weeklyExamQuestions.orderIndex));
      const answers = await db.select().from(weeklyExamAnswers).where(eq(weeklyExamAnswers.weekId, week.id)).orderBy(asc(weeklyExamAnswers.questionNumber));
      const words = await db.select().from(weeklyExamWords).where(eq(weeklyExamWords.weekId, week.id));
      const sentences = await db.select().from(weeklyExamSentences).where(eq(weeklyExamSentences.weekId, week.id));
      return {
        week: { ...week, open: isWeekOpen(week) },
        files: files.map((f) => ({
          id: f.id,
          fileKind: f.fileKind,
          orderIndex: f.orderIndex,
          ocrStatus: f.ocrStatus,
          ocrText: f.ocrText.slice(0, 500),
          hasHighlights: f.highlights.length > 0,
          url: f.objectId ? signObjectUrl(f.objectId, admin.userId) : null,
        })),
        drafts,
        questions,
        answers,
        words,
        sentences,
      };
    },
  }),

  route({
    method: "GET",
    path: "/admin/weekly/:id/files",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const week = (await db.select({ id: weeklyExamWeeks.id }).from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      const files = await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.weekId, week.id)).orderBy(asc(weeklyExamFiles.fileKind), asc(weeklyExamFiles.orderIndex));
      return {
        files: files.map((f) => ({
          id: f.id,
          fileKind: f.fileKind,
          orderIndex: f.orderIndex,
          ocrStatus: f.ocrStatus,
          ocrText: f.ocrText.slice(0, 500),
          hasHighlights: f.highlights.length > 0,
          url: f.objectId ? signObjectUrl(f.objectId, admin.userId) : null,
        })),
      };
    },
  }),
  route({
    method: "GET",
    path: "/admin/weekly/files/:fileId",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const file = (await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.id, ctx.params.fileId)).limit(1))[0];
      if (!file) throw notFound("找不到檔案");
      return { file: { ...file, url: file.objectId ? signObjectUrl(file.objectId, admin.userId) : null } };
    },
  }),
  route({
    method: "POST",
    path: "/admin/weekly/:id/files/upload-url",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ filename: z.string().min(1).max(180), contentType: z.string().min(1).max(120), size: z.number().int().positive().max(50 * 1024 * 1024), fileKind: z.enum(["paper", "answer", "magazine", "word_source", "sentence_source", "extra"]) }));
      const week = (await db.select({ id: weeklyExamWeeks.id }).from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      const upload = await createPresignedUpload({ userId: admin.userId, filename: body.filename, mimeType: body.contentType, sizeBytes: body.size });
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(weeklyExamFiles).where(and(eq(weeklyExamFiles.weekId, week.id), eq(weeklyExamFiles.fileKind, body.fileKind)));
      const rows = await db.insert(weeklyExamFiles).values({ weekId: week.id, objectId: upload.objectId, fileKind: body.fileKind, orderIndex: count, ocrStatus: "uploading" }).returning({ id: weeklyExamFiles.id });
      return { ...upload, fileId: rows[0].id };
    },
  }),
  route({
    method: "POST",
    path: "/admin/weekly/:id/files/:fileId/complete",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ objectId: z.string().uuid(), size: z.number().int().positive(), contentType: z.string().min(1).max(120) }));
      const file = (await db.select().from(weeklyExamFiles).where(and(eq(weeklyExamFiles.id, ctx.params.fileId), eq(weeklyExamFiles.weekId, ctx.params.id))).limit(1))[0];
      if (!file || !file.objectId || file.objectId !== body.objectId) throw notFound("找不到上傳檔案");
      const owner = await objectOwner(body.objectId);
      if (!owner || owner.userId !== admin.userId) throw forbidden();
      await verifyPresignedUpload(body.objectId, body.size, body.contentType);
      const updated = await db.update(weeklyExamFiles).set({ ocrStatus: "pending" }).where(eq(weeklyExamFiles.id, file.id)).returning();
      return { file: updated[0], uploaded: true };
    },
  }),
  route({
    method: "POST",
    path: "/admin/weekly/:id/files",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      const form = await ctx.formData();
      const kind = String(form.get("fileKind") ?? "paper");
      if (!["paper", "answer", "magazine", "word_source", "sentence_source", "extra"].includes(kind)) throw badRequest("檔案類型不正確");
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!files.length) throw fail("REQ_NO_FILE");
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(weeklyExamFiles)
        .where(and(eq(weeklyExamFiles.weekId, week.id), eq(weeklyExamFiles.fileKind, kind)));
      let order = count;
      const created = [];
      for (const file of files) {
        const buf = Buffer.from(await file.arrayBuffer());
        const stored = await putObject({ userId: admin.userId, filename: file.name, mimeType: file.type, data: buf, allow: ["image", "pdf"] });
        const rows = await db.insert(weeklyExamFiles).values({ weekId: week.id, objectId: stored.id, fileKind: kind, orderIndex: order }).returning();
        created.push({ ...rows[0], url: signObjectUrl(stored.id, admin.userId) });
        order += 1;
      }
      await adminLog({ actorId: admin.userId, action: "weekly.upload", targetType: "week", targetId: week.id, after: { kind, count: created.length }, ip: ctx.ip });
      return { files: created };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/weekly/files/:fileId",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          orderIndex: z.number().int().min(0).max(500).optional(),
          highlights: z
            .array(z.object({ color: z.string().max(20), x: z.number(), y: z.number(), w: z.number(), h: z.number(), note: z.string().max(200).optional() }))
            .max(80)
            .optional(),
          ocrText: z.string().max(40000).optional(),
        }),
      );
      const rows = await db.update(weeklyExamFiles).set(body).where(eq(weeklyExamFiles.id, ctx.params.fileId)).returning();
      if (!rows[0]) throw notFound("找不到檔案");
      return { file: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/weekly/files/:fileId",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const file = (await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.id, ctx.params.fileId)).limit(1))[0];
      if (!file) throw notFound("找不到檔案");
      if (file.objectId) await deleteObject(file.objectId, admin.userId, true);
      await db.delete(weeklyExamFiles).where(eq(weeklyExamFiles.id, file.id));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly/:id/analyze",
    auth: "admin",
    rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ scope: z.enum(["all", "vocabulary", "sentences", "questions"]).default("all") }));
      const week = (await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, ctx.params.id)).limit(1))[0];
      if (!week) throw fail("WEEK_NOT_FOUND");
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const files = await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.weekId, week.id)).orderBy(asc(weeklyExamFiles.orderIndex));
      if (!files.length) throw fail("WEEK_NO_FILES");

      // 1) OCR each file
      for (const f of files) {
        if (!f.objectId || f.ocrStatus === "completed") continue;
        try {
          const obj = await readObject(f.objectId);
          if (!obj.mimeType.startsWith("image/") && obj.mimeType !== "application/pdf") continue;
          const highlightEnabled = Object.keys(week.highlightMap ?? {}).length > 0;
          const hl = highlightEnabled && f.highlights.length
            ? `螢光筆已開啟，請優先分析螢光筆標記區域（相對座標 0-1，顏色語意 ${JSON.stringify(week.highlightMap)}）：${JSON.stringify(f.highlights)}。`
            : highlightEnabled
              ? `螢光筆已開啟；若影像中有螢光筆，請優先分析被標記內容。顏色語意：${JSON.stringify(week.highlightMap)}。`
              : "螢光筆分析已關閉，請不要特別尋找或偏重顏色，直接依文字內容分析。";
          const res = await runAi({
            feature: "weekly_ocr",
            userId: admin.userId,
            system: "你是高精度 OCR 引擎，擅長辨識英文雜誌、考卷、答案卷。完整輸出文字，保留題號與選項，不要摘要。",
            parts: [
              { kind: "text", text: `檔案類型：${f.fileKind}。${hl}` },
              { kind: "image", mimeType: obj.mimeType, base64: obj.data.toString("base64") },
            ],
            temperature: 0.1,
            maxOutputTokens: 3500,
          });
          await db.update(weeklyExamFiles).set({ ocrText: sanitizeText(res.text), ocrStatus: "completed" }).where(eq(weeklyExamFiles.id, f.id));
        } catch {
          await db.update(weeklyExamFiles).set({ ocrStatus: "failed" }).where(eq(weeklyExamFiles.id, f.id));
        }
      }

      const fresh = await db.select().from(weeklyExamFiles).where(eq(weeklyExamFiles.weekId, week.id)).orderBy(asc(weeklyExamFiles.orderIndex));
      const paperText = fresh.filter((f) => ["paper", "answer", "extra"].includes(f.fileKind)).map((f) => `【${f.fileKind} #${f.orderIndex + 1}】\n${f.ocrText}`).join("\n\n");
      const vocabularyText = fresh.filter((f) => ["word_source", "magazine", "extra"].includes(f.fileKind)).map((f) => `【${f.fileKind} #${f.orderIndex + 1}】\n${f.ocrText}`).join("\n\n");
      const sentenceText = fresh.filter((f) => ["sentence_source", "magazine", "extra"].includes(f.fileKind)).map((f) => `【${f.fileKind} #${f.orderIndex + 1}】\n${f.ocrText}`).join("\n\n");
      const answerText = fresh.filter((f) => f.fileKind === "answer").map((f) => `【answer #${f.orderIndex + 1}】\n${f.ocrText}`).join("\n\n");
      const sourceText = body.scope === "vocabulary" ? vocabularyText : body.scope === "sentences" ? sentenceText : paperText;
      if (!sourceText.trim()) throw fail("AI_OCR_EMPTY", { message: body.scope === "vocabulary" ? "請先上傳單字來源或雜誌" : body.scope === "sentences" ? "請先上傳句子來源或雜誌" : "請先上傳考卷" });

      // 2) Structure into a draft (never auto-published)
      const { data } = await runAiJson<{
        questions?: Array<{ number?: number; stem?: string; options?: string[]; answer?: string[]; explanation?: string; confidence?: number }>;
        answers?: Array<{ number?: number; answer?: string; confidence?: number }>;
        words?: Array<{ word?: string; meaning?: string; example?: string; color?: string }>;
        sentences?: Array<{ en?: string; zh?: string; color?: string }>;
        summary?: string;
      }>(
        {
          feature: "weekly_structure",
          userId: admin.userId,
          system:
            `你是補習班教材數位化助理。這次只處理 ${body.scope === "vocabulary" ? "單字與片語" : body.scope === "sentences" ? "英文句子、中文翻譯與句型" : "考卷題目"}，不可把其他類型內容混入。` +
            (body.scope === "questions" || body.scope === "all" ? "請自己判斷題目；中文題幹或中文答案請補上自然英文翻譯，並保留原文。" : body.scope === "sentences" ? "只找完整句子、片語與句型，並提供自然中文翻譯、文法重點與英文原句。" : "只找值得學習的單字與片語，提供中文意思、詞性、例句與易混淆字；不要把整句文章當成單字。") +
            '回傳：{"questions":[{"number":1,"stem":"","options":[],"answer":[""],"explanation":"","confidence":0-1}],"answers":[{"number":1,"answer":"","confidence":0-1}],"words":[{"word":"","meaning":"","example":"","color":"pink"}],"sentences":[{"en":"","zh":"","color":"blue"}],"summary":""}' +
            "。答案卷可能已經寫入學生答案：請比較題目與答案的顏色／位置，只有與題目對應且確實寫上的答案才納入；紅色簽名、老師刪除線、批改姓名與非作答文字一律忽略。字跡潦草時，請依上下文找最接近的合理英文翻譯並標低 confidence。不同檔案重複出現的單字、句子或題目只建立一次。不確定的項目 confidence 給低分。不要杜撰不存在的題目。",
          parts: [
            { kind: "text", text: `螢光筆設定：${Object.keys(week.highlightMap ?? {}).length ? JSON.stringify(week.highlightMap) : "關閉；不要特別分析螢光筆"}` },
            { kind: "text", text: `題目來源 OCR：\n${paperText.slice(0, 12000)}` },
            { kind: "text", text: `單字來源 OCR：\n${vocabularyText.slice(0, 8000)}` },
            { kind: "text", text: `句子來源 OCR：\n${sentenceText.slice(0, 8000)}` },
            { kind: "text", text: `答案卷 OCR：\n${answerText.slice(0, 6000) || "（未提供）"}` },
          ],
          maxOutputTokens: 4000,
        },
        {},
      );

      const confidence =
        (data.questions ?? []).length > 0
          ? (data.questions ?? []).reduce((a, q) => a + (Number(q.confidence) || 0.5), 0) / (data.questions ?? []).length
          : 0.4;
      const draft = await db
        .insert(weeklyExamDrafts)
        .values({ weekId: week.id, payload: data as Record<string, unknown>, confidence })
        .returning();
      await adminLog({ actorId: admin.userId, action: "weekly.analyze", targetType: "week", targetId: week.id, after: { draftId: draft[0].id }, ip: ctx.ip });
      return { draft: draft[0] };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly/drafts/:draftId/confirm",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          questions: z
            .array(z.object({ orderIndex: z.number().int().min(0), stem: z.string().min(1).max(2000), options: z.array(z.string().max(400)).max(8), answer: z.array(z.string().max(400)).max(8), explanation: z.string().max(2000).default(""), confidence: z.number().min(0).max(1).default(0.5) }))
            .max(100)
            .default([]),
          words: z.array(z.object({ word: z.string().min(1).max(60), meaning: z.string().max(200).default(""), example: z.string().max(400).default(""), highlightColor: z.string().max(20).default("pink") })).max(200).default([]),
          sentences: z.array(z.object({ en: z.string().min(1).max(400), zh: z.string().max(400).default(""), highlightColor: z.string().max(20).default("blue") })).max(200).default([]),
          publish: z.boolean().default(true),
        }),
      );
      const draft = (await db.select().from(weeklyExamDrafts).where(eq(weeklyExamDrafts.id, ctx.params.draftId)).limit(1))[0];
      if (!draft) throw fail("WEEK_DRAFT_NOT_FOUND");
      if (draft.status !== "draft") throw fail("WEEK_DRAFT_HANDLED");

      await db.transaction(async (tx) => {
        for (const q of body.questions) {
          await tx.insert(weeklyExamQuestions).values({
            weekId: draft.weekId,
            orderIndex: q.orderIndex,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            explanation: q.explanation,
            aiConfidence: q.confidence,
            needsReview: q.confidence < 0.6,
            published: body.publish,
          });
        }
        for (const w of body.words) {
          await tx.insert(weeklyExamWords).values({ weekId: draft.weekId, word: w.word, meaning: w.meaning, example: w.example, highlightColor: w.highlightColor, published: body.publish });
        }
        for (const s of body.sentences) {
          await tx.insert(weeklyExamSentences).values({ weekId: draft.weekId, en: s.en, zh: s.zh, highlightColor: s.highlightColor, published: body.publish });
        }
        await tx.update(weeklyExamDrafts).set({ status: "confirmed" }).where(eq(weeklyExamDrafts.id, draft.id));
      });

      await adminLog({
        actorId: admin.userId,
        action: "weekly.draft.confirm",
        targetType: "week",
        targetId: draft.weekId,
        after: { questions: body.questions.length, words: body.words.length, sentences: body.sentences.length, publish: body.publish },
        ip: ctx.ip,
      });
      return { confirmed: true, counts: { questions: body.questions.length, words: body.words.length, sentences: body.sentences.length } };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly/drafts/:draftId/discard",
    auth: "admin",
    handler: async (ctx) => {
      await db.update(weeklyExamDrafts).set({ status: "discarded" }).where(eq(weeklyExamDrafts.id, ctx.params.draftId));
      return { discarded: true };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/weekly/questions/:qid",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          stem: z.string().min(1).max(2000).optional(),
          options: z.array(z.string().max(400)).max(8).optional(),
          answer: z.array(z.string().max(400)).max(8).optional(),
          explanation: z.string().max(2000).optional(),
          orderIndex: z.number().int().min(0).optional(),
          published: z.boolean().optional(),
          needsReview: z.boolean().optional(),
        }),
      );
      const rows = await db.update(weeklyExamQuestions).set(body).where(eq(weeklyExamQuestions.id, ctx.params.qid)).returning();
      if (!rows[0]) throw notFound("找不到題目");
      return { question: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/weekly/questions/:qid",
    auth: "admin",
    handler: async (ctx) => {
      await db.delete(weeklyExamQuestions).where(eq(weeklyExamQuestions.id, ctx.params.qid));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly/:id/items",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          kind: z.enum(["word", "sentence", "question", "answer"]),
          word: z.string().max(60).optional(),
          meaning: z.string().max(200).optional(),
          example: z.string().max(400).optional(),
          en: z.string().max(400).optional(),
          zh: z.string().max(400).optional(),
          stem: z.string().max(2000).optional(),
          options: z.array(z.string().max(400)).max(8).optional(),
          answer: z.array(z.string().max(400)).max(8).optional(),
          questionNumber: z.number().int().min(1).max(500).optional(),
          answerText: z.string().max(400).optional(),
          highlightColor: z.string().max(20).optional(),
        }),
      );
      const weekId = ctx.params.id;
      if (body.kind === "word") {
        if (!body.word) throw badRequest("請輸入單字");
        const rows = await db.insert(weeklyExamWords).values({ weekId, word: body.word, meaning: body.meaning ?? "", example: body.example ?? "", highlightColor: body.highlightColor ?? "pink", published: true }).returning();
        return { item: rows[0] };
      }
      if (body.kind === "sentence") {
        if (!body.en) throw badRequest("請輸入句子");
        const rows = await db.insert(weeklyExamSentences).values({ weekId, en: body.en, zh: body.zh ?? "", highlightColor: body.highlightColor ?? "blue", published: true }).returning();
        return { item: rows[0] };
      }
      if (body.kind === "question") {
        if (!body.stem) throw badRequest("請輸入題目");
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(weeklyExamQuestions).where(eq(weeklyExamQuestions.weekId, weekId));
        const rows = await db
          .insert(weeklyExamQuestions)
          .values({ weekId, orderIndex: count, stem: body.stem, options: body.options ?? [], answer: body.answer ?? [], published: true, aiConfidence: 1 })
          .returning();
        return { item: rows[0] };
      }
      if (!body.questionNumber || !body.answerText) throw badRequest("請輸入題號與答案");
      const rows = await db.insert(weeklyExamAnswers).values({ weekId, questionNumber: body.questionNumber, answerText: body.answerText, confidence: 1 }).returning();
      return { item: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/admin/weekly/items/:kind/:itemId",
    auth: "admin",
    handler: async (ctx) => {
      const { kind, itemId } = ctx.params;
      if (kind === "word") await db.delete(weeklyExamWords).where(eq(weeklyExamWords.id, itemId));
      else if (kind === "sentence") await db.delete(weeklyExamSentences).where(eq(weeklyExamSentences.id, itemId));
      else if (kind === "answer") await db.delete(weeklyExamAnswers).where(eq(weeklyExamAnswers.id, itemId));
      else throw badRequest("不支援的項目類型");
      return { deleted: true };
    },
  }),

  route({
    method: "GET",
    path: "/admin/weekly/:id/stats",
    auth: "admin",
    handler: async (ctx) => {
      const weekId = ctx.params.id;
      const results = await db
        .select({ userId: weeklyExamResults.userId, score: weeklyExamResults.score, correct: weeklyExamResults.correctCount, total: weeklyExamResults.total, recite: weeklyExamResults.reciteCompleted, displayName: users.displayName, novaId: users.novaId })
        .from(weeklyExamResults)
        .innerJoin(users, eq(users.userId, weeklyExamResults.userId))
        .where(eq(weeklyExamResults.weekId, weekId))
        .orderBy(desc(weeklyExamResults.score));
      const attempts = await db.select().from(weeklyExamAttempts).where(eq(weeklyExamAttempts.weekId, weekId));
      const questions = await db.select().from(weeklyExamQuestions).where(eq(weeklyExamQuestions.weekId, weekId)).orderBy(asc(weeklyExamQuestions.orderIndex));

      const wrongCounter = new Map<string, number>();
      for (const a of attempts) {
        for (const q of questions) {
          const got = a.responses[q.id];
          if (!got) continue;
          const ok = q.answer.some((x) => x.trim().toLowerCase() === String(got[0] ?? "").trim().toLowerCase());
          if (!ok) wrongCounter.set(q.id, (wrongCounter.get(q.id) ?? 0) + 1);
        }
      }
      const scores = results.map((r) => r.score);
      return {
        participants: results.length,
        completionRate: attempts.length ? Math.round((results.length / attempts.length) * 100) : 0,
        average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest: scores.length ? Math.min(...scores) : 0,
        reciteRate: results.length ? Math.round((results.filter((r) => r.recite).length / results.length) * 100) : 0,
        results,
        commonWrong: questions
          .map((q) => ({ id: q.id, order: q.orderIndex + 1, stem: q.stem.slice(0, 80), wrongCount: wrongCounter.get(q.id) ?? 0 }))
          .sort((a, b) => b.wrongCount - a.wrongCount)
          .slice(0, 10),
      };
    },
  }),

  route({
    method: "POST",
    path: "/admin/weekly/:id/reopen",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          openFrom: z.string().datetime(),
          openUntil: z.string().datetime(),
          novaCost: z.number().int().min(0).max(5000).default(0),
          proOnly: z.boolean().default(false),
          allowedUserIds: z.array(z.string().uuid()).max(500).default([]),
          allowedGroupIds: z.array(z.string().uuid()).max(50).default([]),
        }),
      );
      const rows = await db
        .update(weeklyExamWeeks)
        .set({
          status: "published",
          openMode: "manual_open",
          openFrom: new Date(body.openFrom),
          openUntil: new Date(body.openUntil),
          novaCost: body.novaCost,
          proOnly: body.proOnly,
          allowedUserIds: body.allowedUserIds,
          allowedGroupIds: body.allowedGroupIds,
          updatedAt: new Date(),
        })
        .where(eq(weeklyExamWeeks.id, ctx.params.id))
        .returning();
      if (!rows[0]) throw fail("WEEK_NOT_FOUND");
      await adminLog({ actorId: admin.userId, action: "weekly.reopen", targetType: "week", targetId: ctx.params.id, after: body, ip: ctx.ip });
      return { week: { ...rows[0], open: isWeekOpen(rows[0]) } };
    },
  }),

  route({
    method: "GET",
    path: "/admin/storage/objects",
    auth: "admin",
    handler: async () => {
      const rows = await db
        .select({ driver: storageObjects.driver, count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${storageObjects.sizeBytes}),0)::bigint` })
        .from(storageObjects)
        .groupBy(storageObjects.driver);
      return { usage: rows };
    },
  }),
];
