import { z } from "zod";
import { and, asc, desc, eq, gte, sql, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  gradeRecords,
  grades,
  exams,
  examSubjects,
  studyPlans,
  studyRecords,
  focusSessions,
  tasks,
  assignments,
  dailyTasks,
  wrongQuestions,
  quizAttempts,
  userSettings,
  announcements,
  activities,
  activityParticipants,
  weeklyExamWeeks,
  novaAccounts,
  assistantProfiles,
  achievements,
  userAchievements,
  dailyWords,
  wordProgress,
  questions,
} from "@/db/schema";
import { route, zDate, type RouteDef } from "../router";
import { addDaysStr, badRequest, daysBetween, fail, notFound, round1, todayStr, trend } from "../core";
import {
  bumpAchievement,
  claimDailyTask,
  ensureDailyTasks,
  grantLearningReward,
  progressActivities,
  progressDailyTask,
} from "../economy";
import { isWeekOpen } from "../queue";
import { unreadCount } from "../notify";
import { runAiJson, aiConfigured } from "../ai";
import { ensureSeeded } from "../seed";

/* --------------------------------------------------------- analytics */

export type SubjectStat = {
  subject: string;
  count: number;
  average: number;
  best: number;
  worst: number;
  latest: number;
  first: number;
  trend: "up" | "down" | "flat" | "volatile";
  delta: number;
  series: Array<{ date: string; percentage: number; examName: string }>;
};

export async function subjectStats(userId: string): Promise<SubjectStat[]> {
  const rows = await db
    .select()
    .from(gradeRecords)
    .where(eq(gradeRecords.userId, userId))
    .orderBy(asc(gradeRecords.examDate));
  const bySubject = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySubject.get(r.subject) ?? [];
    list.push(r);
    bySubject.set(r.subject, list);
  }
  return [...bySubject.entries()].map(([subject, list]) => {
    const pcts = list.map((l) => l.percentage);
    return {
      subject,
      count: list.length,
      average: round1(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      best: round1(Math.max(...pcts)),
      worst: round1(Math.min(...pcts)),
      latest: round1(pcts[pcts.length - 1]),
      first: round1(pcts[0]),
      trend: trend(pcts),
      delta: round1(pcts[pcts.length - 1] - pcts[0]),
      series: list.map((l) => ({ date: l.examDate, percentage: round1(l.percentage), examName: l.examName })),
    };
  });
}

async function streakDays(userId: string): Promise<number> {
  const rows = await db
    .select({ d: studyRecords.recordDate })
    .from(studyRecords)
    .where(eq(studyRecords.userId, userId))
    .groupBy(studyRecords.recordDate)
    .orderBy(desc(studyRecords.recordDate))
    .limit(400);
  const days = new Set(rows.map((r) => r.d));
  let streak = 0;
  let cursor = todayStr();
  if (!days.has(cursor)) cursor = addDaysStr(cursor, -1);
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
}

export async function recordStudy(params: {
  userId: string;
  kind: string;
  subject: string;
  minutes: number;
  detail?: Record<string, unknown>;
}) {
  await db.insert(studyRecords).values({
    userId: params.userId,
    kind: params.kind,
    subject: params.subject,
    minutes: params.minutes,
    detail: params.detail ?? {},
    recordDate: todayStr(),
  });
  if (params.minutes > 0) {
    await progressDailyTask(params.userId, "focus_minutes", params.minutes);
    await progressActivities(params.userId, "minutes", params.minutes);
  }
  const total = await db
    .select({ minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
    .from(studyRecords)
    .where(eq(studyRecords.userId, params.userId));
  await bumpAchievement(params.userId, "total_minutes", total[0]?.minutes ?? 0);
  const streak = await streakDays(params.userId);
  await bumpAchievement(params.userId, "streak_days", streak);
  return { streak };
}

/* ------------------------------------------------------ plan builder */

type PlanBlock = { subject: string; minutes: number; focus: string; done: boolean };

export async function buildPlan(userId: string, date: string) {
  const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  const goal = settings?.dailyGoalMinutes ?? 45;
  const stats = await subjectStats(userId);
  const wrongs = await db
    .select({ subject: wrongQuestions.subject, count: sql<number>`count(*)::int` })
    .from(wrongQuestions)
    .where(and(eq(wrongQuestions.userId, userId), isNull(wrongQuestions.resolvedAt)))
    .groupBy(wrongQuestions.subject);
  const upcoming = await db
    .select()
    .from(exams)
    .where(and(eq(exams.userId, userId), gte(exams.examDate, date)))
    .orderBy(asc(exams.examDate))
    .limit(3);
  const upcomingSubjects = new Set<string>();
  for (const e of upcoming) {
    const subs = await db.select().from(examSubjects).where(eq(examSubjects.examId, e.id));
    subs.forEach((s) => upcomingSubjects.add(s.subject));
  }

  // Weight = weakness + wrong-question pressure + exam proximity + preference
  const weights = new Map<string, { weight: number; focus: string[] }>();
  const bump = (subject: string, w: number, reason: string) => {
    const cur = weights.get(subject) ?? { weight: 0, focus: [] };
    cur.weight += w;
    if (reason && !cur.focus.includes(reason)) cur.focus.push(reason);
    weights.set(subject, cur);
  };
  for (const s of stats) {
    bump(s.subject, Math.max(0, (85 - s.average) / 8), s.average < 70 ? "弱科補強" : "維持穩定");
    if (s.trend === "down") bump(s.subject, 2, "近期下降，需要止跌");
    if (s.trend === "volatile") bump(s.subject, 1.2, "分數波動大");
  }
  for (const w of wrongs) bump(w.subject, Math.min(4, w.count * 0.5), `${w.count} 題錯題待複習`);
  for (const s of upcomingSubjects) bump(s, 3, "考試將近");
  for (const s of settings?.favoriteSubjects ?? []) bump(s, 0.4, "偏好科目");
  if (!weights.size) {
    (settings?.favoriteSubjects?.length ? settings.favoriteSubjects : ["英文", "數學", "自然"]).forEach((s) => bump(s, 1, "建立學習節奏"));
  }

  const sorted = [...weights.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, 4);
  const totalWeight = sorted.reduce((acc, [, v]) => acc + v.weight, 0) || 1;
  const blocks: PlanBlock[] = sorted.map(([subject, v]) => ({
    subject,
    minutes: Math.max(8, Math.round((goal * (v.weight / totalWeight)) / 5) * 5),
    focus: v.focus.slice(0, 2).join("・") || "基礎複習",
    done: false,
  }));
  const totalMinutes = blocks.reduce((a, b) => a + b.minutes, 0);
  const rationale = `依據你的 ${stats.length} 個科目成績趨勢、${wrongs.reduce((a, b) => a + b.count, 0)} 題未解決錯題${upcoming[0] ? `，以及 ${upcoming[0].name}（還有 ${daysBetween(date, upcoming[0].examDate)} 天）` : ""} 計算出今天的分配。`;

  const rows = await db
    .insert(studyPlans)
    .values({ userId, planDate: date, totalMinutes, blocks, rationale, generatedBy: "engine" })
    .onConflictDoUpdate({
      target: [studyPlans.userId, studyPlans.planDate],
      set: { totalMinutes, blocks, rationale, generatedBy: "engine" },
    })
    .returning();
  return rows[0];
}

/* ------------------------------------------------------------ routes */

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/dashboard",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const today = todayStr();
      const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      await ensureDailyTasks(user.userId, today);

      const [todayMinutes] = await db
        .select({ minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
        .from(studyRecords)
        .where(and(eq(studyRecords.userId, user.userId), eq(studyRecords.recordDate, today)));
      const [focusToday] = await db
        .select({ minutes: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int` })
        .from(focusSessions)
        .where(and(eq(focusSessions.userId, user.userId), sql`${focusSessions.completedAt} >= current_date`));

      const tasksToday = await db
        .select()
        .from(dailyTasks)
        .where(and(eq(dailyTasks.userId, user.userId), eq(dailyTasks.taskDate, today)));

      const stats = await subjectStats(user.userId);
      const weakest = [...stats].sort((a, b) => a.average - b.average)[0] ?? null;
      const recentGrades = await db
        .select()
        .from(gradeRecords)
        .where(eq(gradeRecords.userId, user.userId))
        .orderBy(desc(gradeRecords.examDate))
        .limit(5);

      const upcomingExams = await db
        .select()
        .from(exams)
        .where(and(eq(exams.userId, user.userId), gte(exams.examDate, today)))
        .orderBy(asc(exams.examDate))
        .limit(3);

      const [dueWrong] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wrongQuestions)
        .where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt), lte(wrongQuestions.nextReviewAt, new Date())));

      const [wordsDue] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wordProgress)
        .where(and(eq(wordProgress.userId, user.userId), lte(wordProgress.nextReviewAt, new Date())));

      const plan =
        (await db.select().from(studyPlans).where(and(eq(studyPlans.userId, user.userId), eq(studyPlans.planDate, today))).limit(1))[0] ??
        (await buildPlan(user.userId, today));

      const nova = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0];
      const novi = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      const streak = await streakDays(user.userId);
      await bumpAchievement(user.userId, "streak_days", streak);

      const now = new Date();
      const liveActivities = await db
        .select()
        .from(activities)
        .where(and(eq(activities.published, true), lte(activities.startsAt, now), gte(activities.endsAt, now)))
        .orderBy(asc(activities.sortOrder))
        .limit(5);
      const myActivity = await db.select().from(activityParticipants).where(eq(activityParticipants.userId, user.userId));

      const anns = await db
        .select()
        .from(announcements)
        .where(and(lte(announcements.startsAt, now), sql`(${announcements.endsAt} is null or ${announcements.endsAt} >= now())`))
        .orderBy(desc(announcements.pinned), asc(announcements.sortOrder), desc(announcements.startsAt))
        .limit(8);

      const publishedWeeks = await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.status, "published")).orderBy(desc(weeklyExamWeeks.weekCode)).limit(6);
      const openWeek = publishedWeeks.find((w) => isWeekOpen(w)) ?? null;

      const goal = settings?.dailyGoalMinutes ?? 45;
      const minutes = todayMinutes?.minutes ?? 0;

      const advice = buildNoviAdvice({
        displayName: user.displayName,
        minutes,
        goal,
        streak,
        weakest,
        dueWrong: dueWrong?.count ?? 0,
        upcoming: upcomingExams[0] ? { name: upcomingExams[0].name, days: daysBetween(today, upcomingExams[0].examDate) } : null,
        stats,
      });

      return {
        today,
        greeting: advice,
        minutes,
        focusMinutes: focusToday?.minutes ?? 0,
        goal,
        streak,
        tasks: tasksToday,
        plan,
        stats,
        weakest,
        recentGrades,
        upcomingExams: upcomingExams.map((e) => ({ ...e, daysLeft: daysBetween(today, e.examDate) })),
        dueWrong: dueWrong?.count ?? 0,
        wordsDue: wordsDue?.count ?? 0,
        nova: nova?.balance ?? 0,
        novi,
        activities: liveActivities.map((a) => ({ ...a, progress: myActivity.find((p) => p.activityId === a.id)?.progress ?? 0 })),
        announcements: anns,
        marquee: anns.filter((a) => a.marquee),
        openWeek: openWeek ? { id: openWeek.id, weekCode: openWeek.weekCode, title: openWeek.title } : null,
        unread: await unreadCount(user.userId),
        isPro: user.isPro,
        aiEnabled: aiConfigured(),
      };
    },
  }),

  /* ------------------------------------------------------- grades */
  route({
    method: "GET",
    path: "/grades",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const records = await db.select().from(gradeRecords).where(eq(gradeRecords.userId, user.userId)).orderBy(desc(gradeRecords.examDate));
      const goals = await db.select().from(grades).where(eq(grades.userId, user.userId));
      return { records, goals, stats: await subjectStats(user.userId) };
    },
  }),

  route({
    method: "POST",
    path: "/grades",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          subject: z.string().min(1).max(20),
          examName: z.string().min(1).max(60),
          examType: z.enum(["midterm", "quiz", "mock", "homework", "daily"]),
          examDate: zDate,
          fullScore: z.number().min(1).max(1000),
          score: z.number().min(0).max(1000),
          scope: z.string().max(300).optional(),
          classAverage: z.number().min(0).max(1000).nullable().optional(),
          note: z.string().max(500).optional(),
        }),
      );
      if (body.score > body.fullScore) throw fail("REQ_SCORE_OVER_FULL");
      const percentage = round1((body.score / body.fullScore) * 100);
      const rows = await db
        .insert(gradeRecords)
        .values({
          userId: user.userId,
          subject: body.subject,
          examName: body.examName,
          examType: body.examType,
          examDate: body.examDate,
          fullScore: body.fullScore,
          score: body.score,
          percentage,
          scope: body.scope ?? "",
          classAverage: body.classAverage ?? null,
          note: body.note ?? "",
        })
        .returning();

      // Goal tracking
      const goal = (await db.select().from(grades).where(and(eq(grades.userId, user.userId), eq(grades.subject, body.subject))).limit(1))[0];
      let goalAchieved = false;
      if (goal?.targetScore && percentage >= goal.targetScore && !goal.achievedAt) {
        await db.update(grades).set({ achievedAt: new Date(), updatedAt: new Date() }).where(eq(grades.id, goal.id));
        await grantLearningReward({ userId: user.userId, nova: 60, xp: 120, reason: `達成 ${body.subject} 目標分數`, idempotencyKey: `goal:${goal.id}` });
        await bumpAchievement(user.userId, "goal_reached", 1);
        goalAchieved = true;
      }
      const count = await db.select({ c: sql<number>`count(*)::int` }).from(gradeRecords).where(eq(gradeRecords.userId, user.userId));
      await bumpAchievement(user.userId, "grades_logged", count[0]?.c ?? 1);
      return { record: rows[0], goalAchieved, stats: await subjectStats(user.userId) };
    },
  }),

  route({
    method: "DELETE",
    path: "/grades/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db
        .delete(gradeRecords)
        .where(and(eq(gradeRecords.id, ctx.params.id), eq(gradeRecords.userId, user.userId)))
        .returning({ id: gradeRecords.id });
      if (!deleted[0]) throw notFound("找不到這筆成績");
      return { deleted: true };
    },
  }),

  route({
    method: "PUT",
    path: "/grades/goals",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({ subject: z.string().min(1).max(20), targetScore: z.number().min(1).max(100), baselineScore: z.number().min(0).max(100).optional() }),
      );
      const rows = await db
        .insert(grades)
        .values({ userId: user.userId, subject: body.subject, targetScore: body.targetScore, baselineScore: body.baselineScore ?? null })
        .onConflictDoUpdate({
          target: [grades.userId, grades.subject],
          set: { targetScore: body.targetScore, baselineScore: body.baselineScore ?? null, achievedAt: null, updatedAt: new Date() },
        })
        .returning();
      return { goal: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/grades/analyze",
    auth: "user",
    rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const stats = await subjectStats(user.userId);
      if (!stats.length) throw fail("REQ_NO_GRADE_DATA");
      const deterministic = stats.map((s) => {
        const arrow = s.trend === "up" ? "上升" : s.trend === "down" ? "下降" : s.trend === "volatile" ? "波動" : "持平";
        return `${s.subject} ${s.series.map((x) => Math.round(x.percentage)).join(" → ")}，目前呈現${arrow}趨勢（平均 ${s.average}）。`;
      });
      let aiSummary = "";
      let priority = [...stats].sort((a, b) => a.average - b.average).slice(0, 3).map((s) => s.subject);
      if (aiConfigured()) {
        const { data } = await runAiJson<{ summary?: string; priority?: string[]; suggestions?: string[] }>(
          {
            feature: "grade_analysis",
            userId: user.userId,
            system: "你是台灣國高中學習教練 Novi。只根據提供的真實數據分析，不得杜撰數據。回傳 JSON：{summary, priority:[科目], suggestions:[3 條建議]}。使用繁體中文。",
            parts: [{ kind: "text", text: `學生成績統計：${JSON.stringify(stats)}` }],
            maxOutputTokens: 900,
          },
          {},
        );
        aiSummary = data.summary ?? "";
        if (Array.isArray(data.priority) && data.priority.length) priority = data.priority.slice(0, 3);
        return { facts: deterministic, summary: aiSummary, priority, suggestions: data.suggestions ?? [], aiUsed: true };
      }
      return {
        facts: deterministic,
        summary: `你目前有 ${stats.length} 個科目資料，平均最低的是 ${priority[0]}。`,
        priority,
        suggestions: priority.map((p) => `優先安排 ${p} 的複習與錯題重做。`),
        aiUsed: false,
      };
    },
  }),

  /* -------------------------------------------------------- exams */
  route({
    method: "GET",
    path: "/exams",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const list = await db.select().from(exams).where(eq(exams.userId, user.userId)).orderBy(asc(exams.examDate));
      const out = [];
      for (const e of list) {
        const subs = await db.select().from(examSubjects).where(eq(examSubjects.examId, e.id));
        out.push({ ...e, subjects: subs, daysLeft: daysBetween(todayStr(), e.examDate) });
      }
      return { exams: out };
    },
  }),

  route({
    method: "POST",
    path: "/exams",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          name: z.string().min(1).max(60),
          examDate: zDate,
          note: z.string().max(300).optional(),
          subjects: z
            .array(z.object({ subject: z.string().min(1).max(20), scope: z.string().max(300).optional(), targetScore: z.number().min(0).max(100).optional() }))
            .max(12)
            .optional(),
        }),
      );
      const rows = await db.insert(exams).values({ userId: user.userId, name: body.name, examDate: body.examDate, note: body.note ?? "" }).returning();
      for (const s of body.subjects ?? []) {
        await db.insert(examSubjects).values({ examId: rows[0].id, subject: s.subject, scope: s.scope ?? "", targetScore: s.targetScore ?? null });
      }
      await buildPlan(user.userId, todayStr());
      return { exam: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/exams/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db.delete(exams).where(and(eq(exams.id, ctx.params.id), eq(exams.userId, user.userId))).returning({ id: exams.id });
      if (!deleted[0]) throw notFound("找不到這場考試");
      return { deleted: true };
    },
  }),

  /* --------------------------------------------------------- plan */
  route({
    method: "GET",
    path: "/plan",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const date = ctx.query.get("date") ?? todayStr();
      const existing = (await db.select().from(studyPlans).where(and(eq(studyPlans.userId, user.userId), eq(studyPlans.planDate, date))).limit(1))[0];
      return { plan: existing ?? (await buildPlan(user.userId, date)) };
    },
  }),

  route({
    method: "POST",
    path: "/plan/regenerate",
    auth: "user",
    rate: { limit: 20, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const plan = await buildPlan(user.userId, todayStr());
      return { plan };
    },
  }),

  route({
    method: "POST",
    path: "/plan/block-done",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ index: z.number().int().min(0).max(20), done: z.boolean() }));
      const date = todayStr();
      const plan = (await db.select().from(studyPlans).where(and(eq(studyPlans.userId, user.userId), eq(studyPlans.planDate, date))).limit(1))[0];
      if (!plan) throw notFound("今天還沒有讀書計畫");
      const blocks = [...plan.blocks];
      if (!blocks[body.index]) throw badRequest("找不到這個學習區塊");
      blocks[body.index] = { ...blocks[body.index], done: body.done };
      const updated = await db.update(studyPlans).set({ blocks }).where(eq(studyPlans.id, plan.id)).returning();
      if (body.done) {
        await recordStudy({ userId: user.userId, kind: "plan_block", subject: blocks[body.index].subject, minutes: blocks[body.index].minutes });
        await grantLearningReward({
          userId: user.userId,
          nova: 5,
          xp: 10,
          reason: `完成今日計畫：${blocks[body.index].subject}`,
          idempotencyKey: `planblock:${plan.id}:${body.index}`,
        });
      }
      return { plan: updated[0] };
    },
  }),

  /* -------------------------------------------------------- focus */
  route({
    method: "POST",
    path: "/focus/complete",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          minutes: z.number().int().min(1).max(300),
          subject: z.string().min(1).max(20),
          reflection: z.string().max(500).optional(),
          roomId: z.string().uuid().nullable().optional(),
        }),
      );
      const rows = await db
        .insert(focusSessions)
        .values({ userId: user.userId, minutes: body.minutes, subject: body.subject, reflection: body.reflection ?? "", roomId: body.roomId ?? null })
        .returning();
      const { streak } = await recordStudy({ userId: user.userId, kind: "focus", subject: body.subject, minutes: body.minutes, detail: { sessionId: rows[0].id } });
      const reward = await grantLearningReward({
        userId: user.userId,
        nova: Math.max(3, Math.round(body.minutes / 5)),
        xp: Math.max(5, body.minutes * 2),
        reason: `專注學習 ${body.minutes} 分鐘`,
        idempotencyKey: `focus:${rows[0].id}`,
      });
      return { session: rows[0], reward, streak };
    },
  }),

  route({
    method: "GET",
    path: "/focus/history",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(focusSessions).where(eq(focusSessions.userId, user.userId)).orderBy(desc(focusSessions.completedAt)).limit(50);
      return { sessions: rows };
    },
  }),

  /* --------------------------------------------------- daily tasks */
  route({
    method: "GET",
    path: "/tasks/daily",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { tasks: await ensureDailyTasks(user.userId) };
    },
  }),

  route({
    method: "POST",
    path: "/tasks/daily/:id/claim",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return claimDailyTask(user.userId, ctx.params.id);
    },
  }),

  route({
    method: "GET",
    path: "/tasks",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(tasks).where(eq(tasks.userId, user.userId)).orderBy(desc(tasks.createdAt)).limit(100);
      const hw = await db.select().from(assignments).where(eq(assignments.userId, user.userId)).orderBy(asc(assignments.dueDate)).limit(100);
      return { tasks: rows, assignments: hw };
    },
  }),

  route({
    method: "POST",
    path: "/tasks",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({ title: z.string().min(1).max(120), detail: z.string().max(1000).optional(), dueDate: zDate.nullable().optional(), source: z.string().max(30).optional() }),
      );
      const rows = await db
        .insert(tasks)
        .values({ userId: user.userId, title: body.title, detail: body.detail ?? "", dueDate: body.dueDate ?? null, source: body.source ?? "manual" })
        .returning();
      return { task: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/tasks/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ done: z.boolean().optional(), title: z.string().min(1).max(120).optional() }));
      const rows = await db
        .update(tasks)
        .set(body)
        .where(and(eq(tasks.id, ctx.params.id), eq(tasks.userId, user.userId)))
        .returning();
      if (!rows[0]) throw notFound("找不到任務");
      return { task: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/tasks/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(tasks).where(and(eq(tasks.id, ctx.params.id), eq(tasks.userId, user.userId)));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/assignments",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ title: z.string().min(1).max(120), subject: z.string().max(20), dueDate: zDate, note: z.string().max(500).optional() }));
      const rows = await db.insert(assignments).values({ userId: user.userId, ...body, note: body.note ?? "" }).returning();
      return { assignment: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/assignments/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ done: z.boolean() }));
      const rows = await db
        .update(assignments)
        .set({ done: body.done })
        .where(and(eq(assignments.id, ctx.params.id), eq(assignments.userId, user.userId)))
        .returning();
      if (!rows[0]) throw notFound("找不到作業");
      return { assignment: rows[0] };
    },
  }),

  /* ------------------------------------------------------- report */
  route({
    method: "GET",
    path: "/report",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const range = ctx.query.get("range") ?? "week";
      const days = range === "month" ? 30 : range === "last_week" ? 14 : 7;
      const from = addDaysStr(todayStr(), -days + 1);
      const to = range === "last_week" ? addDaysStr(todayStr(), -7) : todayStr();

      const records = await db
        .select()
        .from(studyRecords)
        .where(and(eq(studyRecords.userId, user.userId), gte(studyRecords.recordDate, from), lte(studyRecords.recordDate, to)));

      const daily = new Map<string, number>();
      const bySubject = new Map<string, number>();
      for (const r of records) {
        daily.set(r.recordDate, (daily.get(r.recordDate) ?? 0) + r.minutes);
        bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + r.minutes);
      }
      const dailySeries: Array<{ date: string; minutes: number }> = [];
      for (let i = days - 1; i >= 0; i -= 1) {
        const d = addDaysStr(to, -i);
        dailySeries.push({ date: d, minutes: daily.get(d) ?? 0 });
      }

      const [xpSum] = await db
        .select({ total: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
        .from(studyRecords)
        .where(and(eq(studyRecords.userId, user.userId), gte(studyRecords.recordDate, from)));

      const attempts = await db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, user.userId), eq(quizAttempts.status, "submitted")))
        .orderBy(desc(quizAttempts.submittedAt))
        .limit(20);

      const [resolved] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wrongQuestions)
        .where(and(eq(wrongQuestions.userId, user.userId), sql`${wrongQuestions.resolvedAt} is not null`));
      const [openWrong] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(wrongQuestions)
        .where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt)));

      const tasksDone = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(dailyTasks)
        .where(and(eq(dailyTasks.userId, user.userId), gte(dailyTasks.taskDate, from), sql`${dailyTasks.claimedAt} is not null`));

      const novi = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      const nova = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0];

      return {
        range,
        from,
        to,
        totalMinutes: xpSum?.total ?? 0,
        dailySeries,
        subjectSplit: [...bySubject.entries()].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes),
        attempts,
        wrongResolved: resolved?.count ?? 0,
        wrongOpen: openWrong?.count ?? 0,
        tasksClaimed: tasksDone[0]?.count ?? 0,
        streak: await streakDays(user.userId),
        xp: novi?.xp ?? 0,
        level: novi?.level ?? 1,
        nova: nova?.balance ?? 0,
        stats: await subjectStats(user.userId),
      };
    },
  }),

  route({
    method: "GET",
    path: "/achievements",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const defs = await db.select().from(achievements).orderBy(asc(achievements.sortOrder));
      const mine = await db.select().from(userAchievements).where(eq(userAchievements.userId, user.userId));
      return {
        achievements: defs.map((d) => {
          const m = mine.find((x) => x.achievementId === d.id);
          return { ...d, progress: m?.progress ?? 0, unlockedAt: m?.unlockedAt ?? null };
        }),
      };
    },
  }),

  route({
    method: "GET",
    path: "/search",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const q = (ctx.query.get("q") ?? "").trim();
      if (q.length < 1) return { results: [] };
      const like = `%${q}%`;
      const mats = await db.execute(sql`
        select 'material' as kind, id::text, title, subject, created_at from study_materials
        where user_id = ${user.userId} and (title ilike ${like} or content ilike ${like}) limit 10`);
      const nts = await db.execute(sql`
        select 'note' as kind, id::text, title, subject, created_at from notes
        where user_id = ${user.userId} and (title ilike ${like} or body ilike ${like}) limit 10`);
      const qzs = await db.execute(sql`
        select 'quiz' as kind, id::text, title, subject, created_at from quizzes
        where user_id = ${user.userId} and title ilike ${like} limit 10`);
      const qs = await db
        .select({ id: questions.id, stem: questions.stem, subject: questions.subject, difficulty: questions.difficulty })
        .from(questions)
        .where(and(sql`${questions.stem} ilike ${like}`, sql`(${questions.ownerId} = ${user.userId} or ${questions.origin} = 'bank')`))
        .limit(10);
      const acts = await db.select().from(activities).where(and(eq(activities.published, true), sql`${activities.title} ilike ${like}`)).limit(5);
      return {
        results: [
          ...(mats.rows as Array<Record<string, unknown>>),
          ...(nts.rows as Array<Record<string, unknown>>),
          ...(qzs.rows as Array<Record<string, unknown>>),
          ...qs.map((x) => ({ kind: "question", id: x.id, title: x.stem.slice(0, 80), subject: x.subject, created_at: null })),
          ...acts.map((a) => ({ kind: "activity", id: a.id, title: a.title, subject: "活動", created_at: a.startsAt })),
        ],
      };
    },
  }),

  route({
    method: "GET",
    path: "/words/catalog",
    auth: "user",
    handler: async () => {
      await ensureSeeded();
      const rows = await db.execute(sql`select level, count(*)::int as count from daily_words where level in ('junior', 'senior') group by level`);
      const counts = new Map(rows.rows.map((row) => [String(row.level), Number(row.count)]));
      return {
        tracks: [
          { id: "senior", label: "高中 7000 單挑戰", description: "依高中英文參考詞彙表，適合高中學習與大考準備", count: counts.get("senior") ?? 0 },
          { id: "junior", label: "國中 2000 單挑戰", description: "依國中英文 2000 字，打好基礎字彙力", count: counts.get("junior") ?? 0 },
        ],
      };
    },
  }),

  route({
    method: "GET",
    path: "/words/daily",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await ensureSeeded();
      const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      const count = Math.max(1, Math.min(10, settings?.dailyWordCount ?? 10));
      const requestedTrack = ctx.query.get("track");
      const track = requestedTrack === "senior" || requestedTrack === "junior" ? requestedTrack : settings?.schoolLevel === "senior" ? "senior" : "junior";
      const dayNumber = Math.floor(Date.now() / 86_400_000);
      const totalResult = await db.execute(sql`select count(*)::int as count from daily_words where level = ${track}`);
      const total = Number(totalResult.rows[0]?.count ?? 0);
      if (!total) return { words: [], level: track, track, count: 0, dailyTarget: count };
      const offset = (dayNumber * count) % total;
      const baseQuery = sql`
        select w.id, w.word, w.meaning, w.meanings, w.phrases, w.part_of_speech, w.example, w.example_zh, w.level,
               coalesce(p.familiarity, 0) as familiarity, coalesce(p.correct_count,0) as correct_count,
               coalesce(p.wrong_count,0) as wrong_count, p.memory_tip
        from daily_words w
        left join word_progress p on p.word_id = w.id and p.user_id = ${user.userId}
        where w.level = ${track}
        order by w.word asc`;
      const first = await db.execute(sql`${baseQuery} limit ${count} offset ${offset}`);
      const remaining = count - first.rows.length;
      const rows = remaining > 0 ? [...first.rows, ...(await db.execute(sql`${baseQuery} limit ${remaining}`)).rows] : first.rows;
      return { words: rows, level: track, track, count: rows.length, dailyTarget: count };
    },
  }),

  route({
    method: "GET",
    path: "/words/all",
    auth: "user",
    handler: async (ctx) => {
      const requestedTrack = ctx.query.get("track");
      const track = requestedTrack === "senior" || requestedTrack === "junior" ? requestedTrack : null;
      const requestedLimit = Number(ctx.query.get("limit") ?? 500);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(7000, Math.floor(requestedLimit))) : 500;
      const rows = await db.select().from(dailyWords).where(track ? eq(dailyWords.level, track) : undefined).orderBy(asc(dailyWords.word)).limit(limit);
      return { words: rows };
    },
  }),
];

function buildNoviAdvice(input: {
  displayName: string;
  minutes: number;
  goal: number;
  streak: number;
  weakest: SubjectStat | null;
  dueWrong: number;
  upcoming: { name: string; days: number } | null;
  stats: SubjectStat[];
}) {
  const parts: string[] = [];
  parts.push(`${input.displayName}，今天累積 ${input.minutes} / ${input.goal} 分鐘`);
  if (input.streak > 1) parts.push(`已連續學習 ${input.streak} 天，保持節奏！`);
  const rising = input.stats.find((s) => s.trend === "up");
  if (rising) parts.push(`${rising.subject}從 ${Math.round(rising.first)} 進步到 ${Math.round(rising.latest)}，做得很好。`);
  if (input.weakest && input.stats.length) parts.push(`${input.weakest.subject}平均 ${input.weakest.average} 分，是目前最需要補強的科目。`);
  if (input.dueWrong > 0) parts.push(`有 ${input.dueWrong} 題錯題到了複習時間，建議先花 15 分鐘處理。`);
  if (input.upcoming) parts.push(`距離「${input.upcoming.name}」還有 ${input.upcoming.days} 天。`);
  if (parts.length === 1) parts.push("先從今日任務開始，完成第一項就能拿到 Nova！");
  return parts.join("　");
}
