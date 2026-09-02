import { and, eq, lte, sql, desc, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  jobQueue,
  users,
  wrongQuestions,
  memberships,
  weeklyExamWeeks,
  activities,
  studyRecords,
  focusSessions,
  notifications,
} from "@/db/schema";
import { ensureDailyTasks } from "./economy";
import { notify } from "./notify";
import { addDaysStr, isoWeekCode, todayStr, localWeekday, localHm } from "./core";

export type JobName =
  | "daily_tasks_refresh"
  | "review_reminder"
  | "weekly_exam_open"
  | "weekly_report"
  | "membership_expiry"
  | "activity_reminder"
  | "session_cleanup";

export type JobPayload = Record<string, unknown>;

export interface QueueAdapter {
  readonly name: string;
  enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }): Promise<{ queued: boolean }>;
  drain(limit?: number): Promise<{ processed: number; failed: number; results: Array<{ name: string; ok: boolean; detail: string }> }>;
  health(): Promise<{ status: "healthy" | "warning" | "error"; detail: string; pending: number }>;
}

/* ------------------------------------------------------- job handlers */

const handlers: Record<JobName, (payload: JobPayload) => Promise<string>> = {
  async daily_tasks_refresh() {
    const rows = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    for (const r of rows) await ensureDailyTasks(r.userId);
    return `已為 ${rows.length} 位使用者建立今日任務`;
  },

  async review_reminder() {
    const due = await db
      .select({ userId: wrongQuestions.userId, count: sql<number>`count(*)::int` })
      .from(wrongQuestions)
      .where(and(lte(wrongQuestions.nextReviewAt, new Date()), sql`${wrongQuestions.resolvedAt} is null`))
      .groupBy(wrongQuestions.userId);
    let sent = 0;
    for (const row of due) {
      const created = await notify({
        userId: row.userId,
        kind: "review",
        title: "🧠 今天有錯題等你複習",
        body: `你有 ${row.count} 題待複習，10 分鐘就能完成。`,
        link: "/study?tab=wrong",
        dedupeKey: `review:${row.userId}:${todayStr()}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則複習提醒`;
  },

  async weekly_exam_open() {
    const weeks = await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.status, "published"));
    const open = weeks.filter((w) => isWeekOpen(w));
    if (!open.length) return "目前沒有開放中的每週小考";
    const students = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    let sent = 0;
    for (const week of open) {
      for (const s of students) {
        const created = await notify({
          userId: s.userId,
          kind: "weekly_exam",
          title: `📚 ${week.title} 已開放`,
          body: "本週補習小考開放中，快去完成快速背誦與測驗！",
          link: "/weekly",
          dedupeKey: `weekopen:${week.id}:${s.userId}:${todayStr()}`,
          push: true,
        });
        if (created) sent += 1;
      }
    }
    return `通知 ${sent} 位學生本週小考開放`;
  },

  async weekly_report() {
    const from = addDaysStr(todayStr(), -7);
    const rows = await db
      .select({ userId: studyRecords.userId, minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
      .from(studyRecords)
      .where(gte(studyRecords.recordDate, from))
      .groupBy(studyRecords.userId);
    let sent = 0;
    for (const r of rows) {
      const created = await notify({
        userId: r.userId,
        kind: "report",
        title: "📈 你的每週學習報告出爐了",
        body: `過去 7 天你累積學習 ${r.minutes} 分鐘，來看看完整分析。`,
        link: "/report",
        dedupeKey: `report:${r.userId}:${isoWeekCode()}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 份週報通知`;
  },

  async membership_expiry() {
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.tier, "pro"), sql`${memberships.expiresAt} is not null`, lte(memberships.expiresAt, soon)));
    let sent = 0;
    for (const m of rows) {
      const created = await notify({
        userId: m.userId,
        kind: "membership",
        title: "⏳ Nova Pro 即將到期",
        body: `你的 Nova Pro 將於 ${m.expiresAt?.toISOString().slice(0, 10)} 到期，請聯絡管理員續期。`,
        link: "/profile?tab=pass",
        dedupeKey: `proexp:${m.userId}:${m.expiresAt?.toISOString().slice(0, 10)}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則會員到期提醒`;
  },

  async activity_reminder() {
    const now = new Date();
    const live = await db
      .select()
      .from(activities)
      .where(and(eq(activities.published, true), lte(activities.startsAt, now), gte(activities.endsAt, now)));
    if (!live.length) return "沒有進行中的活動";
    const students = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    let sent = 0;
    for (const act of live) {
      for (const s of students) {
        const created = await notify({
          userId: s.userId,
          kind: "activity",
          title: `${act.cover} ${act.title} 進行中`,
          body: act.description.slice(0, 120),
          link: "/challenge?tab=activity",
          dedupeKey: `act:${act.id}:${s.userId}:${todayStr()}`,
        });
        if (created) sent += 1;
      }
    }
    return `通知 ${sent} 位學生活動進行中`;
  },

  async session_cleanup() {
    const { purgeExpiredSessions } = await import("./auth");
    await purgeExpiredSessions();
    await db.delete(notifications).where(sql`${notifications.createdAt} < now() - interval '90 days'`);
    return "已清理過期 session 與 90 天前通知";
  },
};

/* ------------------------------------------------------------ helpers */

export function isWeekOpen(week: {
  status: string;
  openMode: string;
  openDays: number[];
  openTime: string;
  closeTime: string;
  openFrom: Date | null;
  openUntil: Date | null;
}): boolean {
  if (week.status !== "published") return false;
  if (week.openMode === "manual_close") return false;
  if (week.openMode === "manual_open") {
    const now = new Date();
    if (week.openFrom && now < new Date(week.openFrom)) return false;
    if (week.openUntil && now > new Date(week.openUntil)) return false;
    return true;
  }
  const day = localWeekday();
  if (!week.openDays.includes(day)) return false;
  const hm = localHm();
  return hm >= week.openTime && hm <= week.closeTime;
}

/* ------------------------------------------------------ pg adapter */

class PostgresQueue implements QueueAdapter {
  readonly name = "postgres";

  async enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }) {
    const rows = await db
      .insert(jobQueue)
      .values({ name: job.name, payload: job.payload ?? {}, uniqueKey: job.uniqueKey, runAt: job.runAt ?? new Date() })
      .onConflictDoNothing()
      .returning({ id: jobQueue.id });
    return { queued: Boolean(rows[0]) };
  }

  async drain(limit = 20) {
    const due = await db
      .select()
      .from(jobQueue)
      .where(and(eq(jobQueue.status, "pending"), lte(jobQueue.runAt, new Date())))
      .orderBy(jobQueue.runAt)
      .limit(limit);
    const results: Array<{ name: string; ok: boolean; detail: string }> = [];
    let processed = 0;
    let failed = 0;
    for (const job of due) {
      const claimed = await db
        .update(jobQueue)
        .set({ status: "running", attempts: sql`${jobQueue.attempts} + 1` })
        .where(and(eq(jobQueue.id, job.id), eq(jobQueue.status, "pending")))
        .returning({ id: jobQueue.id });
      if (!claimed[0]) continue;
      try {
        const handler = handlers[job.name as JobName];
        if (!handler) throw new Error(`unknown job ${job.name}`);
        const detail = await handler(job.payload ?? {});
        await db.update(jobQueue).set({ status: "done", finishedAt: new Date(), lastError: "" }).where(eq(jobQueue.id, job.id));
        results.push({ name: job.name, ok: true, detail });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : "unknown";
        await db.update(jobQueue).set({ status: "failed", lastError: message, finishedAt: new Date() }).where(eq(jobQueue.id, job.id));
        results.push({ name: job.name, ok: false, detail: message });
        failed += 1;
      }
    }
    return { processed, failed, results };
  }

  async health() {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobQueue)
      .where(eq(jobQueue.status, "pending"));
    return { status: "healthy" as const, detail: "PostgreSQL job queue", pending: rows[0]?.count ?? 0 };
  }
}

/* --------------------------------------------------- redis adapter */

class RedisQueue implements QueueAdapter {
  readonly name = "bullmq";
  private fallback = new PostgresQueue();

  async enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }) {
    try {
      const { Queue } = await import("bullmq");
      const queue = new Queue("studynova", { connection: { url: process.env.REDIS_URL! } as never });
      await queue.add(job.name, job.payload ?? {}, {
        jobId: job.uniqueKey,
        delay: job.runAt ? Math.max(0, job.runAt.getTime() - Date.now()) : 0,
        removeOnComplete: 200,
        removeOnFail: 200,
      });
      await queue.close();
      return { queued: true };
    } catch {
      return this.fallback.enqueue(job);
    }
  }

  /** Workers pull from BullMQ (see scripts/worker.ts); drain also flushes the pg mirror. */
  async drain(limit = 20) {
    return this.fallback.drain(limit);
  }

  async health() {
    try {
      const IORedis = (await import("ioredis")).default;
      const client = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, lazyConnect: true });
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      const pg = await this.fallback.health();
      return { status: pong === "PONG" ? ("healthy" as const) : ("warning" as const), detail: "Redis + BullMQ", pending: pg.pending };
    } catch {
      const pg = await this.fallback.health();
      return { status: "warning" as const, detail: "Redis 無法連線，已降級為 PostgreSQL queue", pending: pg.pending };
    }
  }
}

let adapter: QueueAdapter | null = null;
export function queue(): QueueAdapter {
  if (!adapter) adapter = process.env.REDIS_URL ? new RedisQueue() : new PostgresQueue();
  return adapter;
}

export const CRON_TASKS: Array<{ task: JobName; label: string; schedule: string }> = [
  { task: "daily_tasks_refresh", label: "重建每日任務", schedule: "每日 00:05" },
  { task: "review_reminder", label: "錯題複習提醒", schedule: "每日 19:00" },
  { task: "weekly_exam_open", label: "每週小考開放通知", schedule: "每 30 分鐘" },
  { task: "weekly_report", label: "每週學習報告", schedule: "每週一 09:00" },
  { task: "membership_expiry", label: "Nova Pro 到期提醒", schedule: "每日 10:00" },
  { task: "activity_reminder", label: "活動提醒", schedule: "每日 12:00" },
  { task: "session_cleanup", label: "Session / 通知清理", schedule: "每日 03:00" },
];

export async function runCronTask(task: JobName, taskUid: string) {
  const q = queue();
  const { queued } = await q.enqueue({ name: task, uniqueKey: `${task}:${taskUid}` });
  if (!queued) return { deduped: true, processed: 0, failed: 0, results: [] as Array<{ name: string; ok: boolean; detail: string }> };
  const out = await q.drain(50);
  return { deduped: false, ...out };
}

export async function recentJobs(limit = 25) {
  return db.select().from(jobQueue).orderBy(desc(jobQueue.createdAt)).limit(limit);
}

export async function focusMinutesToday(userId: string) {
  const rows = await db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int` })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), sql`${focusSessions.completedAt} >= current_date`));
  return rows[0]?.minutes ?? 0;
}
