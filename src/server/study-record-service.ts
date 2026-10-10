import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { studyRecords } from "@/db/schema";
import { bumpAchievement, progressActivities, progressDailyTask } from "./economy";
import { addDaysStr, todayStr } from "./core";

async function streakDays(userId: string): Promise<number> {
  const rows = await db
    .select({ d: studyRecords.recordDate })
    .from(studyRecords)
    .where(eq(studyRecords.userId, userId))
    .groupBy(studyRecords.recordDate)
    .orderBy(desc(studyRecords.recordDate))
    .limit(400);
  const days = new Set(rows.map((row) => row.d));
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
