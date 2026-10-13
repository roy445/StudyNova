import { and, asc, desc, eq, gt, inArray, isNull, lte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { answers, examPrepActivities, examPrepSubjects, questions, quizAttempts, quizzes, userSettings, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";

const statusValues = ["draft", "analyzing", "pending_review", "scheduled", "open", "closed", "archived"] as const;
type ActivityStatus = (typeof statusValues)[number];

const subjectInput = z.object({
  subject: z.string().trim().min(1).max(60),
  chapters: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  units: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  questionTypes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  difficulty: z.string().trim().min(1).max(30).default("normal"),
  questionBankId: z.string().uuid().nullable().optional(),
});

const activityInput = z.object({
  slug: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  educationLevel: z.enum(["junior", "senior"]),
  grade: z.number().int().min(1).max(12),
  semester: z.string().max(40).default(""),
  examName: z.string().trim().min(1).max(120),
  scope: z.string().max(2000).default(""),
  openMode: z.enum(["manual", "scheduled"]).default("manual"),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  questionBankId: z.string().uuid().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  subjects: z.array(subjectInput).max(30).default([]),
});

const patchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  semester: z.string().max(40).optional(),
  examName: z.string().trim().min(1).max(120).optional(),
  scope: z.string().max(2000).optional(),
  openMode: z.enum(["manual", "scheduled"]).optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  questionBankId: z.string().uuid().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(statusValues).optional(),
});

function slugify(value: string) {
  const base = value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "exam-prep";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function dateOrNull(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function effectiveStatus(activity: typeof examPrepActivities.$inferSelect, now = new Date()): ActivityStatus {
  if (activity.status === "archived") return "archived";
  if (activity.closeAt && activity.closeAt <= now) return "closed";
  if (activity.status === "scheduled" && activity.openAt && activity.openAt > now) return "scheduled";
  if ((activity.status === "scheduled" || activity.status === "open") && (!activity.openAt || activity.openAt <= now)) return "open";
  return activity.status as ActivityStatus;
}

function canTransition(from: ActivityStatus, to: ActivityStatus) {
  if (from === to) return true;
  return ({
    draft: ["analyzing", "pending_review", "scheduled", "open", "closed"],
    analyzing: ["pending_review", "draft", "closed"],
    pending_review: ["draft", "scheduled", "open", "closed"],
    scheduled: ["open", "closed", "draft"],
    open: ["closed"],
    closed: ["archived", "open"],
    archived: [],
  } as Record<ActivityStatus, ActivityStatus[]>)[from].includes(to);
}

async function activityWithSubjects(id: string) {
  const activity = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, id)).limit(1))[0];
  if (!activity) throw notFound("找不到段考衝刺活動");
  const subjects = await db.select().from(examPrepSubjects).where(eq(examPrepSubjects.activityId, id)).orderBy(asc(examPrepSubjects.subject));
  return { activity: { ...activity, effectiveStatus: effectiveStatus(activity) }, subjects };
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/exam-prep/available",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const settings = (await db.select({ schoolLevel: userSettings.schoolLevel, grade: userSettings.grade }).from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      // 段考衝刺活動若未設定指定對象，所有登入學生都能看到；個人資料只作為回傳資訊，不阻擋入口。
      const rows = await db.select().from(examPrepActivities).where(or(eq(examPrepActivities.status, "scheduled"), eq(examPrepActivities.status, "open"))).orderBy(desc(examPrepActivities.openAt), desc(examPrepActivities.createdAt));
      const now = new Date();
      const subjects = rows.length ? await db.select().from(examPrepSubjects).where(or(...rows.map((row) => eq(examPrepSubjects.activityId, row.id)))).orderBy(asc(examPrepSubjects.subject)) : [];
      const subjectMap = new Map<string, typeof subjects>();
      for (const subject of subjects) subjectMap.set(subject.activityId, [...(subjectMap.get(subject.activityId) ?? []), subject]);
      return { timezone: "Asia/Taipei", profile: settings ?? null, activities: rows.map((activity) => ({ ...activity, effectiveStatus: effectiveStatus(activity, now), subjects: subjectMap.get(activity.id) ?? [] })) };
    },
  }),
  route({
    method: "GET",
    path: "/exam-prep/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const result = await activityWithSubjects(ctx.params.id);
      const status = result.activity.effectiveStatus;
      const latestQuiz = (await db.select({ id: quizzes.id }).from(quizzes).where(and(eq(quizzes.userId, user.userId), eq(quizzes.source, `exam_prep:${ctx.params.id}`))).orderBy(desc(quizzes.createdAt)).limit(1))[0];
      const latestAttempt = latestQuiz ? (await db.select({ id: quizAttempts.id, status: quizAttempts.status }).from(quizAttempts).where(and(eq(quizAttempts.quizId, latestQuiz.id), eq(quizAttempts.userId, user.userId))).orderBy(desc(quizAttempts.startedAt)).limit(1))[0] : null;
      return { ...result, resume: latestQuiz ? { quizId: latestQuiz.id, attemptId: latestAttempt?.id ?? null, status: latestAttempt?.status ?? null } : null, access: { canEnter: status === "open", reason: status === "scheduled" ? "活動尚未開放" : status === "closed" ? "活動已關閉，目前只能查看複習資源" : status === "archived" ? "活動已封存" : status === "open" ? "" : "活動尚未準備完成" } };
    },
  }),
  route({
    method: "GET",
    path: "/exam-prep/:id/quiz",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const result = await activityWithSubjects(ctx.params.id);
      if (result.activity.effectiveStatus !== "open") throw fail("REQ_VALIDATION", { message: "這個段考衝刺活動目前不在開放作答時間。" });
      if (!result.activity.questionBankId) throw fail("REQ_NOTHING_TO_REVIEW", { message: "這個活動目前還沒有正式題庫。" });
      const bankQuestions = await db.select({ id: questions.id, createdAt: questions.createdAt }).from(questions).where(eq(questions.bankId, result.activity.questionBankId)).orderBy(asc(questions.createdAt));
      if (!bankQuestions.length) throw fail("REQ_NOTHING_TO_REVIEW", { message: "這個活動目前沒有可作答題目。" });
      const existing = (await db.select().from(quizzes).where(and(eq(quizzes.userId, user.userId), eq(quizzes.source, `exam_prep:${ctx.params.id}`))).orderBy(desc(quizzes.createdAt)).limit(1))[0];
      const existingQuestionCount = existing?.questionIds.length ? Number((await db.select({ count: sql<number>`count(*)::int` }).from(questions).where(and(eq(questions.bankId, result.activity.questionBankId), inArray(questions.id, existing.questionIds))))[0]?.count ?? 0) : 0;
      // A previous quiz can outlive a question-bank refresh. Never return that
      // stale quiz: the client would resume successfully but receive no items.
      const reusable = existing && existingQuestionCount > 0 ? existing : null;
      const quiz = reusable ?? (await db.insert(quizzes).values({ userId: user.userId, title: result.activity.name, subject: result.subjects.map((subject) => subject.subject).join("、") || "綜合", difficulty: "exam", source: `exam_prep:${ctx.params.id}`, timeLimitSec: Math.max(600, bankQuestions.length * 90), questionIds: bankQuestions.map((question) => question.id), expiresAt: result.activity.closeAt ?? new Date(Date.now() + 30 * 86_400_000) }).returning())[0];
      return { quizId: quiz.id, questionCount: quiz.questionIds.length, title: quiz.title };
    },
  }),
  route({
    method: "GET",
    path: "/exam-prep/:id/leaderboard",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const activity = (await db.select({ id: examPrepActivities.id, name: examPrepActivities.name }).from(examPrepActivities).where(eq(examPrepActivities.id, ctx.params.id)).limit(1))[0];
      if (!activity) throw notFound("找不到段考衝刺活動");
      const rows = await db.select({
        userId: quizAttempts.userId,
        displayName: users.displayName,
        novaId: users.novaId,
        attempts: sql<number>`count(*)::int`,
        bestScore: sql<number>`max(${quizAttempts.score})::float`,
        bestCorrect: sql<number>`max(${quizAttempts.correctCount})::int`,
        bestTotal: sql<number>`max(${quizAttempts.total})::int`,
        latestSubmittedAt: sql<string | null>`max(${quizAttempts.submittedAt})`,
      }).from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId)).innerJoin(users, eq(users.userId, quizAttempts.userId)).where(and(eq(quizzes.source, `exam_prep:${ctx.params.id}`), eq(quizAttempts.status, "submitted"))).groupBy(quizAttempts.userId, users.displayName, users.novaId).orderBy(desc(sql`max(${quizAttempts.score})`), desc(sql`max(${quizAttempts.correctCount})`), asc(sql`min(${quizAttempts.submittedAt})`)).limit(100);
      const ranking = rows.map((row, index) => ({ rank: index + 1, ...row, isMe: row.userId === user.userId }));
      return { activity, ranking, me: ranking.find((row) => row.isMe) ?? null };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/activities",
    auth: "admin",
    handler: async () => {
      const activities = await db.select().from(examPrepActivities).orderBy(desc(examPrepActivities.createdAt));
      const subjects = activities.length ? await db.select().from(examPrepSubjects).where(or(...activities.map((row) => eq(examPrepSubjects.activityId, row.id)))) : [];
      return { timezone: "Asia/Taipei", activities: activities.map((activity) => ({ ...activity, effectiveStatus: effectiveStatus(activity), subjects: subjects.filter((subject) => subject.activityId === activity.id) })) };
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/analytics",
    auth: "admin",
    handler: async (ctx) => {
      const selectedId = ctx.query.get("activityId") || null;
      const activities = await db.select({ id: examPrepActivities.id, name: examPrepActivities.name, examName: examPrepActivities.examName, status: examPrepActivities.status, openAt: examPrepActivities.openAt, closeAt: examPrepActivities.closeAt }).from(examPrepActivities).orderBy(desc(examPrepActivities.createdAt));
      const scope = selectedId ? activities.filter((activity) => activity.id === selectedId) : activities;
      if (selectedId && !scope.length) throw notFound("找不到段考衝刺活動");
      const sourceFilter = selectedId ? eq(quizzes.source, `exam_prep:${selectedId}`) : like(quizzes.source, "exam_prep:%");
      const rows = await db
        .select({ activityId: examPrepActivities.id, activityName: examPrepActivities.name, quizId: quizzes.id, attemptId: quizAttempts.id, attemptStatus: quizAttempts.status, score: quizAttempts.score, userId: quizAttempts.userId, questionId: questions.id, subject: questions.subject, stem: questions.stem, options: questions.options, answer: questions.answer, response: answers.response, isCorrect: answers.isCorrect })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
        .innerJoin(examPrepActivities, eq(quizzes.source, sql`'exam_prep:' || ${examPrepActivities.id}`))
        .leftJoin(answers, eq(answers.attemptId, quizAttempts.id))
        .leftJoin(questions, eq(questions.id, answers.questionId))
        .where(and(sourceFilter, selectedId ? eq(examPrepActivities.id, selectedId) : undefined));

      const submitted = rows.filter((row) => row.attemptStatus === "submitted");
      const attemptMap = new Map<string, { userId: string; score: number }>();
      for (const row of rows) if (!attemptMap.has(row.attemptId)) attemptMap.set(row.attemptId, { userId: row.userId, score: Number(row.score ?? 0) });
      const submittedAttemptIds = new Set(submitted.map((row) => row.attemptId));
      const participantIds = new Set(rows.map((row) => row.userId));
      const subjectMap = new Map<string, { subject: string; answered: number; correct: number; questions: Set<string> }>();
      const questionMap = new Map<string, { questionId: string; subject: string; stem: string; options: string[]; answer: string[]; answered: number; correct: number; selections: Map<string, number> }>();
      for (const row of submitted) {
        if (!row.questionId) continue;
        const subject = row.subject || "其他";
        const stats = subjectMap.get(subject) ?? { subject, answered: 0, correct: 0, questions: new Set<string>() };
        stats.answered += 1;
        stats.correct += row.isCorrect ? 1 : 0;
        stats.questions.add(row.questionId);
        subjectMap.set(subject, stats);
        const q = questionMap.get(row.questionId) ?? { questionId: row.questionId, subject, stem: row.stem || "", options: row.options ?? [], answer: row.answer ?? [], answered: 0, correct: 0, selections: new Map<string, number>() };
        q.answered += 1;
        q.correct += row.isCorrect ? 1 : 0;
        for (const selected of row.response ?? []) q.selections.set(String(selected), (q.selections.get(String(selected)) ?? 0) + 1);
        questionMap.set(row.questionId, q);
      }
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[。.、，,：:；;（）()\s]+/g, "");
      const optionAnalysis = [...questionMap.values()].map((q) => ({
        questionId: q.questionId,
        subject: q.subject,
        stem: q.stem,
        answered: q.answered,
        accuracy: q.answered ? Math.round((q.correct / q.answered) * 1000) / 10 : 0,
        options: q.options.map((text, index) => {
          const direct = q.selections.get(String(text)) ?? 0;
          const letter = q.selections.get(String.fromCharCode(65 + index)) ?? 0;
          const ordinal = q.selections.get(String(index)) ?? q.selections.get(String(index + 1)) ?? 0;
          const selected = direct || letter || ordinal;
          return { label: String.fromCharCode(65 + index), text, selected, probability: q.answered ? Math.round((selected / q.answered) * 1000) / 10 : 0, correct: q.answer.some((answer) => normalize(answer) === normalize(text)) };
        }),
      })).sort((a, b) => a.accuracy - b.accuracy);
      const scores = [...attemptMap.entries()].filter(([attemptId]) => submittedAttemptIds.has(attemptId)).map(([, attempt]) => attempt);
      const totalCorrect = submitted.reduce((sum, row) => sum + (row.isCorrect ? 1 : 0), 0);
      const totalAnswered = submitted.length;
      const summary = { attempts: attemptMap.size, submittedAttempts: submittedAttemptIds.size, participants: participantIds.size, answerRecords: totalAnswered, correctAnswers: totalCorrect, accuracy: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 1000) / 10 : 0, averageScore: scores.length ? Math.round((scores.reduce((sum, item) => sum + item.score, 0) / scores.length) * 10) / 10 : 0, completionRate: attemptMap.size ? Math.round((submittedAttemptIds.size / attemptMap.size) * 1000) / 10 : 0 };
      return { activities, selectedActivityId: selectedId, selectedActivities: scope, summary, subjects: [...subjectMap.values()].map((row) => ({ subject: row.subject, questionCount: row.questions.size, answered: row.answered, correct: row.correct, accuracy: row.answered ? Math.round((row.correct / row.answered) * 1000) / 10 : 0 })).sort((a, b) => b.answered - a.answered), questions: optionAnalysis };
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/activities",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json<z.infer<typeof activityInput>>(activityInput);
      const openAt = dateOrNull(body.openAt);
      const closeAt = dateOrNull(body.closeAt);
      if (openAt && closeAt && closeAt <= openAt) throw fail("SYS_CONFLICT", { message: "關閉時間必須晚於開放時間" });
      if (body.openMode === "scheduled" && !openAt) throw fail("SYS_CONFLICT", { message: "預約開放必須設定開放時間" });
      const created = await db.transaction(async (tx) => {
        const activity = (await tx.insert(examPrepActivities).values({ slug: body.slug ? slugify(body.slug) : slugify(body.name), name: body.name, description: body.description, educationLevel: body.educationLevel, grade: body.grade, semester: body.semester, examName: body.examName, scope: body.scope, openMode: body.openMode, status: body.openMode === "scheduled" ? "scheduled" : "draft", openAt, closeAt, questionBankId: body.questionBankId ?? null, settings: body.settings, createdBy: admin.userId }).returning())[0];
        if (body.subjects.length) await tx.insert(examPrepSubjects).values(body.subjects.map((subject) => ({ ...subject, activityId: activity.id, questionBankId: subject.questionBankId ?? null })));
        return activity;
      });
      return await activityWithSubjects(created.id);
    },
  }),
  route({
    method: "GET",
    path: "/admin/exam-prep/activities/:id",
    auth: "admin",
    handler: async (ctx) => activityWithSubjects(ctx.params.id),
  }),
  route({
    method: "PATCH",
    path: "/admin/exam-prep/activities/:id",
    auth: "admin",
    handler: async (ctx) => {
      const current = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, ctx.params.id)).limit(1))[0];
      if (!current) throw notFound("找不到段考衝刺活動");
      const body = await ctx.json<z.infer<typeof patchInput>>(patchInput);
      const from = current.status as ActivityStatus;
      const to = body.status ?? from;
      if (!canTransition(from, to)) throw fail("SYS_CONFLICT", { message: `活動狀態不可由 ${from} 變更為 ${to}` });
      const openAt = body.openAt === undefined ? current.openAt : dateOrNull(body.openAt);
      const closeAt = body.closeAt === undefined ? current.closeAt : dateOrNull(body.closeAt);
      if (openAt && closeAt && closeAt <= openAt) throw fail("SYS_CONFLICT", { message: "關閉時間必須晚於開放時間" });
      if ((body.openMode ?? current.openMode) === "scheduled" && !openAt) throw fail("SYS_CONFLICT", { message: "預約開放必須設定開放時間" });
      const update = { ...body, openAt, closeAt, status: to, publishedAt: ["scheduled", "open"].includes(to) ? current.publishedAt ?? new Date() : current.publishedAt, archivedAt: to === "archived" ? new Date() : current.archivedAt, questionBankId: body.questionBankId === undefined ? current.questionBankId : body.questionBankId };
      await db.update(examPrepActivities).set(update).where(eq(examPrepActivities.id, current.id));
      return await activityWithSubjects(current.id);
    },
  }),
  route({
    method: "POST",
    path: "/admin/exam-prep/activities/:id/subjects",
    auth: "admin",
    handler: async (ctx) => {
      const activity = (await db.select({ id: examPrepActivities.id }).from(examPrepActivities).where(eq(examPrepActivities.id, ctx.params.id)).limit(1))[0];
      if (!activity) throw notFound("找不到段考衝刺活動");
      const body = await ctx.json<z.infer<typeof subjectInput>>(subjectInput);
      const subject = (await db.insert(examPrepSubjects).values({ ...body, activityId: activity.id, questionBankId: body.questionBankId ?? null }).onConflictDoUpdate({ target: [examPrepSubjects.activityId, examPrepSubjects.subject], set: { chapters: body.chapters, units: body.units, questionTypes: body.questionTypes, difficulty: body.difficulty, questionBankId: body.questionBankId ?? null, updatedAt: new Date() } }).returning())[0];
      return { subject };
    },
  }),
];
