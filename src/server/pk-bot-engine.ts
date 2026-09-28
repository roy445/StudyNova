import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { pkBotJobs, pkBotProfiles, pkBotSessions, pkMatchPlayers, pkMatchQuestions, pkMatches, pkPlayerAnswers } from "@/db/schema";
import { calculatePkScore, normalizePkText } from "./pk-utils";

function seedNumber(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function botDelay(profile: typeof pkBotProfiles.$inferSelect, matchId: string, questionIndex: number) {
  const span = Math.max(1, profile.responseMaxMs - profile.responseMinMs);
  return profile.responseMinMs + (seedNumber(`${profile.botKey}:${matchId}:${questionIndex}:delay`) % span);
}

export async function scheduleBotJobsForMatch(matchId: string, startsAt: Date) {
  const sessions = await db.select({ session: pkBotSessions, profile: pkBotProfiles }).from(pkBotSessions).innerJoin(pkBotProfiles, eq(pkBotProfiles.id, pkBotSessions.botProfileId)).where(and(eq(pkBotSessions.matchId, matchId), eq(pkBotSessions.state, "active")));
  const firstQuestion = (await db.select({ id: pkMatchQuestions.id }).from(pkMatchQuestions).where(and(eq(pkMatchQuestions.matchId, matchId), eq(pkMatchQuestions.orderIndex, 0))).limit(1))[0];
  for (const row of sessions) {
    await db.insert(pkBotJobs).values({ sessionId: row.session.id, matchId, questionIndex: 0, questionId: firstQuestion?.id ?? null, availableAt: new Date(startsAt.getTime() + botDelay(row.profile, matchId, 0)), idempotencyKey: `bot-turn:${matchId}:${row.profile.id}:0` }).onConflictDoNothing();
  }
}

async function scheduleNext(sessionId: string, matchId: string, profile: typeof pkBotProfiles.$inferSelect, questionIndex: number, startsFrom = Date.now()) {
  const question = (await db.select({ id: pkMatchQuestions.id }).from(pkMatchQuestions).where(and(eq(pkMatchQuestions.matchId, matchId), eq(pkMatchQuestions.orderIndex, questionIndex))).limit(1))[0];
  if (!question) return null;
  const row = (await db.insert(pkBotJobs).values({ sessionId, matchId, questionIndex, questionId: question.id, availableAt: new Date(startsFrom + botDelay(profile, matchId, questionIndex)), idempotencyKey: `bot-turn:${matchId}:${profile.id}:${questionIndex}` }).onConflictDoNothing().returning({ id: pkBotJobs.id }))[0];
  return row?.id ?? (await db.select({ id: pkBotJobs.id }).from(pkBotJobs).where(eq(pkBotJobs.idempotencyKey, `bot-turn:${matchId}:${profile.id}:${questionIndex}`)).limit(1))[0]?.id ?? null;
}

export async function processPkBotJob(jobId: string) {
  const job = (await db.select().from(pkBotJobs).where(eq(pkBotJobs.id, jobId)).limit(1))[0];
  if (!job || job.status === "completed") return { done: true, nextJobId: null };
  if (job.availableAt > new Date()) return { done: false, nextJobId: null };
  const row = (await db.select({ job: pkBotJobs, session: pkBotSessions, profile: pkBotProfiles, player: pkMatchPlayers, match: pkMatches, question: pkMatchQuestions }).from(pkBotJobs).innerJoin(pkBotSessions, eq(pkBotSessions.id, pkBotJobs.sessionId)).innerJoin(pkBotProfiles, eq(pkBotProfiles.id, pkBotSessions.botProfileId)).innerJoin(pkMatchPlayers, eq(pkMatchPlayers.id, pkBotSessions.playerId)).innerJoin(pkMatches, eq(pkMatches.id, pkBotJobs.matchId)).leftJoin(pkMatchQuestions, eq(pkMatchQuestions.id, pkBotJobs.questionId)).where(eq(pkBotJobs.id, jobId)).limit(1))[0];
  if (!row || !row.question) return { done: true, nextJobId: null };
  if (row.match.status === "countdown" && row.match.startsAt && row.match.startsAt > new Date()) {
    await db.update(pkBotJobs).set({ availableAt: new Date(row.match.startsAt.getTime() + botDelay(row.profile, row.match.id, row.job.questionIndex)), updatedAt: new Date() }).where(eq(pkBotJobs.id, jobId));
    return { done: false, nextJobId: null };
  }
  if (row.match.status === "countdown" && row.match.startsAt && row.match.startsAt <= new Date()) {
    await db.update(pkMatches).set({ status: "in_progress", updatedAt: new Date() }).where(and(eq(pkMatches.id, row.match.id), eq(pkMatches.status, "countdown")));
    await db.update(pkMatchPlayers).set({ currentQuestionStartedAt: new Date(), lastHeartbeatAt: new Date() }).where(eq(pkMatchPlayers.matchId, row.match.id));
  }
  const matchLive = row.match.status === "in_progress" || (row.match.status === "countdown" && row.match.startsAt !== null && row.match.startsAt <= new Date());
  if (!matchLive) {
    await db.update(pkBotJobs).set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() }).where(eq(pkBotJobs.id, jobId));
    return { done: true, nextJobId: null };
  }
  await db.update(pkBotJobs).set({ status: "running", attempts: sql`${pkBotJobs.attempts} + 1`, updatedAt: new Date() }).where(and(eq(pkBotJobs.id, jobId), eq(pkBotJobs.status, "queued")));
  const already = (await db.select({ id: pkPlayerAnswers.id }).from(pkPlayerAnswers).where(and(eq(pkPlayerAnswers.matchId, row.match.id), eq(pkPlayerAnswers.questionId, row.question.id), eq(pkPlayerAnswers.playerId, row.player.id))).limit(1))[0];
  if (!already) {
    const roll = seedNumber(`${row.profile.botKey}:${row.match.id}:${row.question.id}:answer`) % 10_000 / 10_000;
    const correct = roll < Math.max(0, Math.min(1, row.profile.accuracy));
    const selectedOption = correct ? row.question.canonicalAnswer : row.question.canonicalOptions.find((option) => normalizePkText(option) !== normalizePkText(row.question!.canonicalAnswer)) ?? row.question.canonicalAnswer;
    const responseMs = Math.max(1, Math.min(row.match.questionTimeSec * 1000, botDelay(row.profile, row.match.id, row.job.questionIndex)));
    const score = calculatePkScore({ correct, elapsedMs: responseMs, comboBefore: row.player.combo, questionTimeSec: row.match.questionTimeSec });
    await db.insert(pkPlayerAnswers).values({ matchId: row.match.id, playerId: row.player.id, questionId: row.question.id, userId: null, selectedOption, responseMs, isCorrect: correct, scoreAwarded: score.points, comboAfter: score.combo, idempotencyKey: `bot-answer:${row.match.id}:${row.profile.id}:${row.question.orderIndex}` }).onConflictDoNothing();
    await db.update(pkMatchPlayers).set({ score: sql`${pkMatchPlayers.score} + ${score.points}`, combo: score.combo, maxCombo: sql`greatest(${pkMatchPlayers.maxCombo}, ${score.combo})`, correctCount: sql`${pkMatchPlayers.correctCount} + ${correct ? 1 : 0}`, answeredCount: sql`${pkMatchPlayers.answeredCount} + 1`, totalResponseMs: sql`${pkMatchPlayers.totalResponseMs} + ${responseMs}`, fastestResponseMs: row.player.fastestResponseMs === null ? responseMs : sql`least(${pkMatchPlayers.fastestResponseMs}, ${responseMs})`, lastHeartbeatAt: new Date(), currentQuestionStartedAt: new Date() }).where(eq(pkMatchPlayers.id, row.player.id));
  }
  await db.update(pkBotSessions).set({ lastQuestionIndex: row.question.orderIndex, lastActionAt: new Date(), updatedAt: new Date() }).where(eq(pkBotSessions.id, row.session.id));
  await db.update(pkBotJobs).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(pkBotJobs.id, jobId));
  const nextJobId = await scheduleNext(row.session.id, row.match.id, row.profile, row.question.orderIndex + 1);
  const players = await db.select({ answered: pkMatchPlayers.answeredCount }).from(pkMatchPlayers).where(eq(pkMatchPlayers.matchId, row.match.id));
  if (players.length > 0 && players.every((player) => player.answered >= row.match.questionCount)) {
    const { finishPkMatch } = await import("./routes/pk-routes");
    await finishPkMatch(row.match.id);
  }
  return { done: true, nextJobId };
}
