import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { examPkAnswerHistory, examPkAnswers, examPkParticipants, examPkQuestions, examPkRooms, examPrepActivities, examPrepSubjects, questions } from "@/db/schema";
import { fail, notFound } from "../core";
import { route, type RouteDef } from "../router";
import { isHiddenEnglishListeningQuestion } from "../exam-prep-question-filter";

const roomInput = z.object({
  activityId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  maxPlayers: z.number().int().min(2).max(50).default(50),
  durationMinutes: z.number().int().min(10).max(60).default(50),
});
const answerInput = z.object({
  questionId: z.string().uuid(),
  answer: z.array(z.string().trim().min(1)).max(8),
  timeSpent: z.number().int().min(0).max(3600).default(0),
});

function roomCode() {
  return `${randomInt(100000, 999999)}`;
}

async function getRoom(roomId: string, userId: string) {
  const room = (await db.select().from(examPkRooms).where(eq(examPkRooms.id, roomId)).limit(1))[0];
  if (!room) throw notFound("找不到這間段考 PK 房");
  const self = (await db.select().from(examPkParticipants).where(and(eq(examPkParticipants.roomId, roomId), eq(examPkParticipants.userId, userId))).limit(1))[0];
  if (!self) throw fail("SYS_CONFLICT", { message: "你尚未加入這間考試房。" });
  const participants = (await db.execute(sql`select p.id, p.user_id as "userId", u.display_name as "displayName", u.avatar_seed as "avatarSeed", p.status, p.joined_at as "joinedAt", p.score, p.correct_count as "correctCount", p.wrong_count as "wrongCount", p.unanswered_count as "unansweredCount", p.rank, p.last_seen_at as "lastSeenAt" from exam_pk_participants p join users u on u.id = p.user_id where p.room_id = ${roomId} order by p.joined_at`)).rows as Array<{ id: string; userId: string; displayName: string; avatarSeed: string; status: string; joinedAt: string; score: number | null; correctCount: number; wrongCount: number; unansweredCount: number; rank: number | null; lastSeenAt: string | null }>;
  const roomQuestions = await db.select({ id: examPkQuestions.id, orderIndex: examPkQuestions.orderIndex, questionId: examPkQuestions.questionId, snapshot: examPkQuestions.snapshot }).from(examPkQuestions).where(eq(examPkQuestions.roomId, roomId)).orderBy(asc(examPkQuestions.orderIndex));
  const answers = await db.select({ questionId: examPkAnswers.questionId, answer: examPkAnswers.answer, isCorrect: examPkAnswers.isCorrect, submittedAt: examPkAnswers.submittedAt, changedCount: examPkAnswers.changedCount }).from(examPkAnswers).where(and(eq(examPkAnswers.roomId, roomId), eq(examPkAnswers.userId, userId)));
  return { room, self, participants, questions: roomQuestions.map(({ snapshot, ...question }) => ({ ...question, snapshot: Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "answer")) })), answers };
}

async function ensureParticipant(roomId: string, userId: string) {
  const row = (await db.select().from(examPkParticipants).where(and(eq(examPkParticipants.roomId, roomId), eq(examPkParticipants.userId, userId))).limit(1))[0];
  if (!row) throw fail("SYS_CONFLICT", { message: "請先加入這間考試房。" });
  return row;
}

async function statePayload(roomId: string) {
  const room = (await db.select().from(examPkRooms).where(eq(examPkRooms.id, roomId)).limit(1))[0];
  if (!room) return null;
  const participants = (await db.execute(sql`select p.user_id as "userId", u.display_name as "displayName", u.avatar_seed as "avatarSeed", p.status, p.score, p.correct_count as "correctCount", p.wrong_count as "wrongCount", p.unanswered_count as "unansweredCount", p.last_seen_at as "lastSeenAt" from exam_pk_participants p join users u on u.id = p.user_id where p.room_id = ${roomId} order by p.score desc nulls last, p.joined_at`)).rows as Array<{ userId: string; displayName: string; avatarSeed: string; status: string; score: number | null; correctCount: number; wrongCount: number; unansweredCount: number; lastSeenAt: string | null }>;
  return { room: { id: room.id, activityId: room.activityId, roomCode: room.roomCode, hostUserId: room.hostUserId, status: room.status, startedAt: room.startedAt, endsAt: room.endsAt, finishedAt: room.finishedAt, maxPlayers: room.maxPlayers, durationMinutes: room.durationMinutes, subject: room.subject, scope: room.scope }, participants };
}

function sseRoomResponse(roomId: string, request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          const payload = await statePayload(roomId);
          if (!payload) { controller.close(); return; }
          controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch { /* reconnect will recover from a transient database error */ }
      };
      void send();
      const timer = setInterval(() => void send(), 1500);
      const close = () => { if (closed) return; closed = true; clearInterval(timer); try { controller.close(); } catch { /* stream already closed */ } };
      if (request.signal.aborted) close(); else request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { /* abort handler owns cleanup */ },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}

export const routes: RouteDef[] = [
  route({
    method: "GET", path: "/exam-pk/rooms/mine", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = (await db.execute(sql`select r.id, r.activity_id as "activityId", r.room_code as "roomCode", r.host_user_id as "hostUserId", r.subject, r.scope, r.status, r.max_players as "maxPlayers", r.duration_minutes as "durationMinutes", r.created_at as "createdAt", r.started_at as "startedAt", r.ends_at as "endsAt", a.name as "activityName", p.status as "participantStatus", p.joined_at as "joinedAt"
        from exam_pk_rooms r
        join exam_pk_participants p on p.room_id = r.id
        join exam_prep_activities a on a.id = r.activity_id
        where p.user_id = ${user.userId}
        order by case when r.status in ('WAITING', 'RUNNING') then 0 else 1 end, r.created_at desc
        limit 30`)).rows;
      return { rooms: rows };
    },
  }),
  route({
    method: "POST", path: "/exam-pk/rooms", auth: "user", rate: { limit: 12, windowSec: 60 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const input = await ctx.json(roomInput);
      const activity = (await db.select().from(examPrepActivities).where(eq(examPrepActivities.id, input.activityId)).limit(1))[0];
      if (!activity || activity.status !== "open") throw fail("REQ_VALIDATION", { message: "這個段考衝刺活動目前不在開放狀態。" });
      const subject = input.subjectId ? (await db.select().from(examPrepSubjects).where(and(eq(examPrepSubjects.id, input.subjectId), eq(examPrepSubjects.activityId, input.activityId))).limit(1))[0] : (await db.select().from(examPrepSubjects).where(eq(examPrepSubjects.activityId, input.activityId)).orderBy(asc(examPrepSubjects.subject)).limit(1))[0];
      if (!subject) throw fail("REQ_NOTHING_TO_REVIEW", { message: "這個段考活動尚未設定科目。" });
      const bankId = subject.questionBankId ?? activity.questionBankId;
      if (!bankId) throw fail("REQ_NOTHING_TO_REVIEW", { message: "這個科目尚未綁定可用題庫。" });
      const bankQuestions = (await db.select({ id: questions.id, subject: questions.subject, type: questions.type, stem: questions.stem, options: questions.options, answer: questions.answer, explanation: questions.explanation, difficulty: questions.difficulty, metadata: questions.metadata }).from(questions).where(and(eq(questions.bankId, bankId), eq(questions.status, "published"))).orderBy(sql`random()`).limit(100)).filter((question) => !isHiddenEnglishListeningQuestion(question)).slice(0, 50);
      if (!bankQuestions.length) throw fail("REQ_NOTHING_TO_REVIEW", { message: "這個科目目前沒有已發布題目，請先完成題庫審核。" });
      const room = await db.transaction(async (tx) => {
        // Serialize room creation per user so two fast clicks cannot bypass the one-room rule.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.userId}))`);
        const existing = (await tx.select({ id: examPkRooms.id, roomCode: examPkRooms.roomCode }).from(examPkRooms).where(and(eq(examPkRooms.hostUserId, user.userId), inArray(examPkRooms.status, ["WAITING", "RUNNING"]))).orderBy(desc(examPkRooms.createdAt)).limit(1))[0];
        if (existing) throw fail("SYS_CONFLICT", { message: `你已經有一間進行中的 PK 房（房號 ${existing.roomCode}），請先使用「我的房間」回到該房。` });
        let code = roomCode();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const exists = (await tx.select({ id: examPkRooms.id }).from(examPkRooms).where(eq(examPkRooms.roomCode, code)).limit(1))[0];
          if (!exists) break;
          code = roomCode();
        }
        const created = (await tx.insert(examPkRooms).values({ roomCode: code, activityId: activity.id, hostUserId: user.userId, subject: subject.subject, scope: activity.scope || subject.units.join("、"), questionBankId: bankId, maxPlayers: input.maxPlayers, durationMinutes: input.durationMinutes }).returning())[0];
        await tx.insert(examPkParticipants).values({ roomId: created.id, userId: user.userId, status: "JOINED", lastSeenAt: new Date() });
        await tx.insert(examPkQuestions).values(bankQuestions.map((question, index) => ({ roomId: created.id, questionId: question.id, orderIndex: index, snapshot: { subject: question.subject, type: question.type, stem: question.stem, options: question.options, answer: question.answer, explanation: question.explanation, difficulty: question.difficulty } })));
        return created;
      });
      return { roomId: room.id, roomCode: room.roomCode, activityId: room.activityId, host: true };
    },
  }),
  route({
    method: "GET", path: "/exam-pk/rooms/:id", auth: "user",
    handler: async (ctx) => getRoom(ctx.params.id, ctx.requireUser().userId),
  }),
  route({
    method: "POST", path: "/exam-pk/rooms/:id/join", auth: "user", rate: { limit: 20, windowSec: 60 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const room = (await db.select().from(examPkRooms).where(eq(examPkRooms.id, ctx.params.id)).limit(1))[0];
      if (!room) throw notFound("找不到這間段考 PK 房");
      if (room.status !== "WAITING") throw fail("SYS_CONFLICT", { message: "這間房已經開始或已結束，無法加入。" });
      const participantCount = Number((await db.select({ value: count() }).from(examPkParticipants).where(eq(examPkParticipants.roomId, room.id)))[0]?.value ?? 0);
      if (participantCount >= room.maxPlayers) throw fail("SYS_CONFLICT", { message: "這間房已達人數上限。" });
      await db.insert(examPkParticipants).values({ roomId: room.id, userId: user.userId, status: "JOINED", lastSeenAt: new Date() }).onConflictDoUpdate({ target: [examPkParticipants.roomId, examPkParticipants.userId], set: { status: "JOINED", lastSeenAt: new Date() } });
      return { joined: true, roomId: room.id, activityId: room.activityId };
    },
  }),
  route({
    method: "POST", path: "/exam-pk/room-codes/:code/join", auth: "user", rate: { limit: 20, windowSec: 60 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const room = (await db.select().from(examPkRooms).where(eq(examPkRooms.roomCode, ctx.params.code)).limit(1))[0];
      if (!room) throw notFound("找不到這個房號");
      if (room.status !== "WAITING") throw fail("SYS_CONFLICT", { message: "這間房已經開始或已結束，無法加入。" });
      const participantCount = Number((await db.select({ value: count() }).from(examPkParticipants).where(eq(examPkParticipants.roomId, room.id)))[0]?.value ?? 0);
      if (participantCount >= room.maxPlayers) throw fail("SYS_CONFLICT", { message: "這間房已達人數上限。" });
      await db.insert(examPkParticipants).values({ roomId: room.id, userId: user.userId, status: "JOINED", lastSeenAt: new Date() }).onConflictDoUpdate({ target: [examPkParticipants.roomId, examPkParticipants.userId], set: { status: "JOINED", lastSeenAt: new Date() } });
      return { joined: true, roomId: room.id, activityId: room.activityId };
    },
  }),
  route({
    method: "POST", path: "/exam-pk/rooms/:id/start", auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const room = (await db.select().from(examPkRooms).where(and(eq(examPkRooms.id, ctx.params.id), eq(examPkRooms.hostUserId, user.userId))).limit(1))[0];
      if (!room) throw fail("SYS_CONFLICT", { message: "只有房主可以開始考試。" });
      if (room.status !== "WAITING") throw fail("SYS_CONFLICT", { message: "這間房目前不能開始。" });
      const now = new Date(); const ends = new Date(now.getTime() + room.durationMinutes * 60_000);
      await db.update(examPkRooms).set({ status: "RUNNING", startedAt: now, endsAt: ends }).where(eq(examPkRooms.id, room.id));
      await db.update(examPkParticipants).set({ status: "ANSWERING", lastSeenAt: now }).where(eq(examPkParticipants.roomId, room.id));
      return { started: true, startedAt: now.toISOString(), endsAt: ends.toISOString() };
    },
  }),
  route({
    method: "POST", path: "/exam-pk/rooms/:id/heartbeat", auth: "user",
    handler: async (ctx) => { const user = ctx.requireUser(); await ensureParticipant(ctx.params.id, user.userId); await db.update(examPkParticipants).set({ lastSeenAt: new Date() }).where(and(eq(examPkParticipants.roomId, ctx.params.id), eq(examPkParticipants.userId, user.userId))); return { ok: true }; },
  }),
  route({
    method: "POST", path: "/exam-pk/rooms/:id/answers", auth: "user", rate: { limit: 120, windowSec: 60 },
    handler: async (ctx) => {
      const user = ctx.requireUser(); const input = await ctx.json(answerInput);
      const room = (await db.select().from(examPkRooms).where(eq(examPkRooms.id, ctx.params.id)).limit(1))[0];
      if (!room || room.status !== "RUNNING") throw fail("SYS_CONFLICT", { message: "這間考試房目前不在作答階段。" });
      if (room.endsAt && room.endsAt <= new Date()) throw fail("SYS_CONFLICT", { message: "作答時間已結束，系統正在結算。" });
      await ensureParticipant(room.id, user.userId);
      const q = (await db.select().from(examPkQuestions).where(and(eq(examPkQuestions.id, input.questionId), eq(examPkQuestions.roomId, room.id))).limit(1))[0];
      if (!q) throw notFound("找不到這題");
      const snapshot = q.snapshot as { answer?: string[] };
      const correct = input.answer.length === (snapshot.answer ?? []).length && input.answer.every((value) => (snapshot.answer ?? []).includes(value));
      const previous = (await db.select().from(examPkAnswers).where(and(eq(examPkAnswers.roomId, room.id), eq(examPkAnswers.userId, user.userId), eq(examPkAnswers.questionId, q.id))).limit(1))[0];
      await db.transaction(async (tx) => {
        if (previous && JSON.stringify(previous.answer) !== JSON.stringify(input.answer)) await tx.insert(examPkAnswerHistory).values({ roomId: room.id, userId: user.userId, questionId: q.id, oldAnswer: previous.answer, newAnswer: input.answer });
        await tx.insert(examPkAnswers).values({ roomId: room.id, userId: user.userId, questionId: q.id, answer: input.answer, isCorrect: correct, timeSpent: input.timeSpent, submittedAt: new Date(), changedCount: previous ? previous.changedCount + (JSON.stringify(previous.answer) === JSON.stringify(input.answer) ? 0 : 1) : 0 }).onConflictDoUpdate({ target: [examPkAnswers.roomId, examPkAnswers.userId, examPkAnswers.questionId], set: { answer: input.answer, isCorrect: correct, timeSpent: input.timeSpent, submittedAt: new Date(), changedCount: previous ? previous.changedCount + (JSON.stringify(previous.answer) === JSON.stringify(input.answer) ? 0 : 1) : 0, updatedAt: new Date() } });
        const stats = await tx.select({ correct: sql<number>`count(*) filter (where ${examPkAnswers.isCorrect})::int`, answered: count() }).from(examPkAnswers).where(and(eq(examPkAnswers.roomId, room.id), eq(examPkAnswers.userId, user.userId), sql`${examPkAnswers.submittedAt} is not null`));
        const correctCount = Number(stats[0]?.correct ?? 0); const answered = Number(stats[0]?.answered ?? 0); const total = Number((await tx.select({ value: count() }).from(examPkQuestions).where(eq(examPkQuestions.roomId, room.id)))[0]?.value ?? 0);
        await tx.update(examPkParticipants).set({ correctCount, wrongCount: Math.max(0, answered - correctCount), unansweredCount: Math.max(0, total - answered), score: total ? Math.round((correctCount / total) * 1000) / 10 : 0, status: answered >= total ? "SUBMITTED" : "ANSWERING", submittedAt: answered >= total ? new Date() : undefined, lastSeenAt: new Date() }).where(and(eq(examPkParticipants.roomId, room.id), eq(examPkParticipants.userId, user.userId)));
      });
      return { saved: true, isCorrect: correct, answer: snapshot.answer ?? [], explanation: String((q.snapshot as { explanation?: string }).explanation ?? "") };
    },
  }),
  route({
    method: "POST", path: "/exam-pk/rooms/:id/finish", auth: "user",
    handler: async (ctx) => { const user = ctx.requireUser(); await ensureParticipant(ctx.params.id, user.userId); const now = new Date(); await db.update(examPkParticipants).set({ status: "SUBMITTED", submittedAt: now, lastSeenAt: now }).where(and(eq(examPkParticipants.roomId, ctx.params.id), eq(examPkParticipants.userId, user.userId))); const remaining = await db.select({ id: examPkParticipants.id }).from(examPkParticipants).where(and(eq(examPkParticipants.roomId, ctx.params.id), inArray(examPkParticipants.status, ["JOINED", "READY", "ANSWERING"]))); if (!remaining.length) await db.update(examPkRooms).set({ status: "FINISHED", finishedAt: now }).where(eq(examPkRooms.id, ctx.params.id)); return { finished: true }; },
  }),
  route({
    method: "GET", path: "/exam-pk/rooms/:id/events", auth: "user",
    handler: async (ctx) => { const user = ctx.requireUser(); await ensureParticipant(ctx.params.id, user.userId); return sseRoomResponse(ctx.params.id, ctx.req); },
  }),
];
