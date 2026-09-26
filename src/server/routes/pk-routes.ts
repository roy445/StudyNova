import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyWords,
  friends,
  pkActivities,
  pkActivityParticipants,
  pkAuditLogs,
  pkMatchEvents,
  pkMatchQuestions,
  pkMatchScores,
  pkMatchPlayers,
  pkMatches,
  pkMatchmakingQueue,
  pkPlayerAnswers,
  pkPresence,
  pkRewards,
  pkRooms,
  pkTeams,
  questionBanks,
  questions,
  studyMaterials,
  userVocabularies,
  users,
  vocabularyFolderItems,
  vocabularyFolders,
  wrongQuestions,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, forbidden, joinCode, notFound, randomToken, sha256, todayStr } from "../core";
import { ensureReviewItem } from "../review-service";
import { bumpAchievement, grantLearningReward, progressActivities, progressDailyTask } from "../economy";
import { notify } from "../notify";
import { recordStudy } from "./learning-routes";
import { getPkConfig, type PkConfig } from "../pk-config";
import { calculatePkScore, calculateRanks, matchPlayerCount, normalizePkText, pkOptionOrder, pkQuestionFingerprint, type PkQuestionBlueprint } from "../pk-utils";
import { publishPkEvent, sseResponse } from "../pk-realtime";

const matchMode = z.enum(["1v1", "2v2", "3v3", "多人"]);
const teamMode = z.enum(["solo", "team"]);
const visibility = z.enum(["public", "private"]);
const playerState = z.enum(["online", "recently_active"]);

type MatchInput = {
  mode: z.infer<typeof matchMode>;
  teamMode: z.infer<typeof teamMode>;
  questionBankId: string;
  sourceType?: "bank" | "vocabulary" | "folder" | "material";
  sourceId?: string | null;
  subject: string;
  grade: string;
  unit: string;
  difficulty: string;
  questionCount: number;
  questionTimeSec: number;
  allowLateJoin: boolean;
  allowSpectators: boolean;
  showRanking: boolean;
  rewardNova: number;
  rewardXp: number;
};

type PkQuestionRow = typeof pkMatchQuestions.$inferSelect;

type MatchPlayerView = {
  userId: string;
  displayName: string;
  novaId: string;
  teamId: string | null;
  role: string;
  connectionState: string;
  score: number;
  combo: number;
  maxCombo: number;
  correctCount: number;
  answeredCount: number;
  totalResponseMs: number;
  fastestResponseMs: number | null;
  rank: number | null;
};

function publicQuestion(question: PkQuestionRow, playerId: string, matchId: string) {
  return {
    id: question.id,
    orderIndex: question.orderIndex,
    type: question.type,
    stem: question.stem,
    options: pkOptionOrder(question.canonicalOptions, `${matchId}:${playerId}:${question.id}`),
    sourceLabel: question.sourceLabel,
    unit: question.unit,
  };
}

function settingsError(config: PkConfig, area: keyof PkConfig) {
  if (!config.enabled) throw badRequest("線上 PK 目前由管理員暫停");
  if (area === "quickMatchEnabled" && !config.quickMatchEnabled) throw badRequest("快速配對目前未開放");
  if (area === "friendMatchEnabled" && !config.friendMatchEnabled) throw badRequest("好友 PK 目前未開放");
  if (area === "customRoomEnabled" && !config.customRoomEnabled) throw badRequest("自訂房間目前未開放");
}

function assertPkBankAllowed(config: PkConfig, bankId: string) {
  if (config.allowedBankIds.length && !config.allowedBankIds.includes(bankId)) throw forbidden("這個題庫目前未開放線上 PK");
}

function normalizedOptions(options: string[]) {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

async function recentQuestionFingerprints(tx: any, subject: string) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows: Array<{ fingerprint: string }> = await tx.select({ fingerprint: pkMatchQuestions.fingerprint }).from(pkMatchQuestions).innerJoin(pkMatches, eq(pkMatches.id, pkMatchQuestions.matchId)).where(and(eq(pkMatches.subject, subject), gte(pkMatchQuestions.createdAt, since))).limit(10_000);
  return new Set(rows.map((row: { fingerprint: string }) => row.fingerprint));
}

async function generateMatchQuestions(tx: any, matchId: string, input: MatchInput) {
  const fingerprints = await recentQuestionFingerprints(tx, input.subject);
  const usedOptions = new Set<string>();
  const blueprints: PkQuestionBlueprint[] = [];
  const sourceRows = await tx.select({ id: questions.id, type: questions.type, stem: questions.stem, options: questions.options, answer: questions.answer, explanation: questions.explanation, sourceLabel: questions.sourceLabel, unit: questions.unit, subject: questions.subject }).from(questions).where(and(eq(questions.bankId, input.questionBankId), ne(questions.status, "draft"))).orderBy(sql`random()`).limit(Math.min(500, input.questionCount * 8));
  for (const current of sourceRows) {
    if (blueprints.length >= input.questionCount) break;
    const answer = String(current.answer[0] ?? "").trim();
    const options = normalizedOptions(current.options.map(String));
    if (!current.stem.trim() || !answer || options.length < 2 || !options.some((option) => normalizePkText(option) === normalizePkText(answer))) continue;
    const question: PkQuestionBlueprint = { type: current.type, stem: current.stem, options, answer, explanation: current.explanation, sourceLabel: current.sourceLabel, unit: current.unit || input.unit, subject: current.subject };
    const fp = pkQuestionFingerprint(question);
    if (fingerprints.has(fp)) continue;
    blueprints.push(question);
    options.forEach((option) => usedOptions.add(normalizePkText(option)));
  }

  if (blueprints.length < input.questionCount) throw badRequest(`目前「${input.subject}」可用且不重複的 PK 題目不足（${blueprints.length}/${input.questionCount}）`);
  await tx.insert(pkMatchQuestions).values(blueprints.map((question, orderIndex) => ({ matchId, orderIndex, type: question.type, stem: question.stem, canonicalOptions: question.options, canonicalAnswer: question.answer, explanation: question.explanation ?? "", sourceLabel: question.sourceLabel ?? "", unit: question.unit ?? input.unit, fingerprint: pkQuestionFingerprint(question) })));
}

async function questionOrders(tx: any, matchId: string, userId: string) {
  const rows = await tx.select({ id: pkMatchQuestions.id }).from(pkMatchQuestions).where(eq(pkMatchQuestions.matchId, matchId)).orderBy(asc(pkMatchQuestions.orderIndex));
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const question = (await tx.select().from(pkMatchQuestions).where(eq(pkMatchQuestions.id, row.id)).limit(1))[0];
    if (question) result[question.id] = pkOptionOrder(question.canonicalOptions, `${matchId}:${userId}:${question.id}`);
  }
  return result;
}

async function activeFriends(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ friendId: friends.friendId }).from(friends).where(and(eq(friends.userId, userId), inArray(friends.friendId, ids)));
  return rows.map((row) => row.friendId);
}

async function createMatch(ownerId: string, input: MatchInput, roomInput?: { name: string; visibility: z.infer<typeof visibility>; password: string; maxPlayers: number; inviteIds: string[]; roomMode: z.infer<typeof teamMode> }) {
  const config = await getPkConfig();
  const bank = (await db.select({ id: questionBanks.id, name: questionBanks.name, subject: questionBanks.subject }).from(questionBanks).where(eq(questionBanks.id, input.questionBankId)).limit(1))[0];
  if (!bank) throw badRequest("請選擇有效的 PK 題庫");
  if (!config.allowedModes.includes(input.mode)) throw badRequest("這個 PK 模式目前未被管理員允許");
  if (input.questionCount < config.minQuestions || input.questionCount > config.maxQuestions) throw badRequest(`題數必須介於 ${config.minQuestions}～${config.maxQuestions} 題`);
  if (input.questionTimeSec < config.minTimeSec || input.questionTimeSec > config.maxTimeSec) throw badRequest(`每題時間必須介於 ${config.minTimeSec}～${config.maxTimeSec} 秒`);
  if ((roomInput?.inviteIds.length ?? 0) > 0 && !config.friendMatchEnabled) throw badRequest("好友 PK 目前未開放");
  const invited = await activeFriends(ownerId, roomInput?.inviteIds ?? []);
  if (roomInput && invited.length !== roomInput.inviteIds.length) throw forbidden("只能邀請已經成為好友的使用者");

  const result = await db.transaction(async (tx) => {
    const matchRows = await tx.insert(pkMatches).values({ ownerId, status: roomInput ? "waiting" : "matching", mode: input.mode, teamMode: input.teamMode, questionBankId: input.questionBankId, sourceType: input.sourceType ?? "bank", sourceId: input.sourceId ?? null, subject: bank.subject, grade: input.grade, unit: input.unit, difficulty: input.difficulty, questionCount: input.questionCount, questionTimeSec: input.questionTimeSec, allowLateJoin: input.allowLateJoin, allowSpectators: input.allowSpectators, showRanking: input.showRanking, rewardNova: input.rewardNova, rewardXp: input.rewardXp }).returning();
    const match = matchRows[0];
    await generateMatchQuestions(tx, match.id, input);
    let room = null;
    if (roomInput) {
      const roomRows = await tx.insert(pkRooms).values({ matchId: match.id, roomCode: joinCode(), shareToken: randomToken(12), name: roomInput.name, visibility: roomInput.visibility, passwordHash: roomInput.password ? sha256(roomInput.password) : "", maxPlayers: roomInput.maxPlayers, mode: input.mode, teamMode: roomInput.roomMode, allowLateJoin: input.allowLateJoin, allowSpectators: input.allowSpectators, showRanking: input.showRanking, hostId: ownerId }).returning();
      room = roomRows[0];
      await tx.update(pkMatches).set({ roomId: room.id, teamMode: roomInput.roomMode, updatedAt: new Date() }).where(eq(pkMatches.id, match.id));
    }
    const teamIds: string[] = [];
    if (input.teamMode === "team" || roomInput?.roomMode === "team") {
      for (const team of [{ name: "TEAM NOVA", color: "#37d3ff" }, { name: "TEAM STAR", color: "#a78bfa" }]) {
        const teamRows = await tx.insert(pkTeams).values({ matchId: match.id, name: team.name, color: team.color }).returning({ id: pkTeams.id });
        teamIds.push(teamRows[0].id);
      }
    }
    const orders = await questionOrders(tx, match.id, ownerId);
    const playerRows = await tx.insert(pkMatchPlayers).values({ matchId: match.id, userId: ownerId, teamId: teamIds[0] ?? null, optionOrders: orders }).returning();
    return { match: matchRows[0], room, player: playerRows[0], invited };
  });
  publishPkEvent(result.match.id, { type: "match_created", payload: { matchId: result.match.id, status: result.match.status } });
  for (const userId of result.invited) {
    await notify({ userId, kind: "pk_invite", title: `⚔️ ${result.room?.name ?? "線上 PK"} 邀請`, body: "好友邀請你加入線上 PK 等候室。", link: result.room ? `/online-pk?room=${result.room.shareToken}` : `/online-pk?match=${result.match.id}`, dedupeKey: `pk-invite:${result.match.id}:${userId}`, push: true });
  }
  return result;
}

async function syncMatch(matchId: string) {
  const match = (await db.select().from(pkMatches).where(eq(pkMatches.id, matchId)).limit(1))[0];
  if (!match) return null;
  if (match.status === "countdown" && match.startsAt && match.startsAt <= new Date()) {
    const rows = await db.update(pkMatches).set({ status: "in_progress", updatedAt: new Date() }).where(and(eq(pkMatches.id, match.id), eq(pkMatches.status, "countdown"))).returning();
    if (rows[0]) {
      const questionStartedAt = new Date();
      await db.update(pkMatchPlayers).set({ currentQuestionStartedAt: questionStartedAt, lastHeartbeatAt: questionStartedAt }).where(and(eq(pkMatchPlayers.matchId, match.id), eq(pkMatchPlayers.role, "player")));
      publishPkEvent(match.id, { type: "match_started", payload: { matchId: match.id, startsAt: rows[0].startsAt?.toISOString() ?? null } });
      return rows[0];
    }
  }
  return match;
}

async function getPlayer(matchId: string, userId: string) {
  return (await db.select().from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, matchId), eq(pkMatchPlayers.userId, userId))).limit(1))[0] ?? null;
}

async function accessMatch(matchId: string, userId: string) {
  const match = await syncMatch(matchId);
  if (!match) throw notFound("找不到 PK 賽場");
  const player = await getPlayer(matchId, userId);
  if (!player) throw forbidden("你不是這場 PK 的參與者");
  return { match, player };
}

async function emitMatchEvent(matchId: string, eventType: string, userId: string | null, payload: Record<string, unknown>) {
  const updated = (await db.update(pkMatches).set({ eventSeq: sql`${pkMatches.eventSeq} + 1`, updatedAt: new Date() }).where(eq(pkMatches.id, matchId)).returning({ sequence: pkMatches.eventSeq }))[0];
  const sequence = updated?.sequence ?? 0;
  await db.insert(pkMatchEvents).values({ matchId, sequence, eventType, userId, payload });
  publishPkEvent(matchId, { type: eventType, payload: { ...payload, sequence }, sequence });
}

async function addWrongForAnswer(userId: string, question: PkQuestionRow) {
  const fp = `pk:${userId}:${question.fingerprint}`;
  const inserted = await db.insert(questions).values({ ownerId: userId, origin: "online_pk", subject: question.sourceLabel.startsWith("daily_words") ? "英文單字" : "線上 PK", topic: "線上 PK 錯題", unit: question.unit, level: "junior", difficulty: "normal", type: question.type, stem: question.stem, options: question.canonicalOptions, answer: [question.canonicalAnswer], explanation: question.explanation, sourceLabel: question.sourceLabel, fingerprint: fp, status: "published" }).onConflictDoNothing().returning({ id: questions.id });
  const questionId = inserted[0]?.id ?? (await db.select({ id: questions.id }).from(questions).where(eq(questions.fingerprint, fp)).limit(1))[0]?.id;
  if (!questionId) return null;
  const wrong = await db.insert(wrongQuestions).values({ userId, questionId, subject: question.sourceLabel.startsWith("daily_words") ? "英文單字" : "線上 PK", reason: "線上 PK 答錯" }).onConflictDoUpdate({ target: [wrongQuestions.userId, wrongQuestions.questionId], set: { wrongCount: sql`${wrongQuestions.wrongCount} + 1`, lastWrongAt: new Date(), resolvedAt: null, nextReviewAt: new Date() } }).returning();
  const wrongRow = wrong[0] ?? (await db.select().from(wrongQuestions).where(and(eq(wrongQuestions.userId, userId), eq(wrongQuestions.questionId, questionId))).limit(1))[0];
  if (wrongRow) await ensureReviewItem({ userId, contentType: "wrong_question", contentId: wrongRow.id, metadata: { source: "online_pk", matchQuestionId: question.id } });
  return wrongRow ?? null;
}

export async function finishPkMatch(matchId: string) {
  const completed = await db.update(pkMatches).set({ status: "completed", finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(pkMatches.id, matchId), sql`${pkMatches.status} in ('in_progress', 'paused', 'countdown')`, isNull(pkMatches.finishedAt))).returning();
  const match = completed[0] ?? (await db.select().from(pkMatches).where(and(eq(pkMatches.id, matchId), eq(pkMatches.status, "completed"))).limit(1))[0];
  if (!match) return null;
  const players = await db.select({ player: pkMatchPlayers, displayName: users.displayName, novaId: users.novaId }).from(pkMatchPlayers).innerJoin(users, eq(users.userId, pkMatchPlayers.userId)).where(eq(pkMatchPlayers.matchId, matchId));
  const ranked = calculateRanks(players.map((row) => row.player));
  const byId = new Map(ranked.map((row) => [row.player.userId, row.rank]));
  for (const row of ranked) {
    await db.update(pkMatchPlayers).set({ rank: row.rank, connectionState: "finished", finishedAt: new Date() }).where(eq(pkMatchPlayers.id, row.player.id));
    await db.insert(pkMatchScores).values({ matchId, userId: row.player.userId, score: row.player.score, rank: row.rank, combo: row.player.combo, correctCount: row.player.correctCount, answeredCount: row.player.answeredCount }).onConflictDoUpdate({ target: [pkMatchScores.matchId, pkMatchScores.userId], set: { score: row.player.score, rank: row.rank, combo: row.player.combo, correctCount: row.player.correctCount, answeredCount: row.player.answeredCount, updatedAt: new Date() } });
  }
  for (const row of players) {
    const answers = await db.select({ questionId: pkPlayerAnswers.questionId, isCorrect: pkPlayerAnswers.isCorrect }).from(pkPlayerAnswers).where(and(eq(pkPlayerAnswers.matchId, matchId), eq(pkPlayerAnswers.userId, row.player.userId)));
    const questionsById = answers.length ? await db.select().from(pkMatchQuestions).where(inArray(pkMatchQuestions.id, answers.map((answer) => answer.questionId))) : [];
    for (const answer of answers.filter((item) => !item.isCorrect)) {
      const question = questionsById.find((item) => item.id === answer.questionId);
      if (question) await addWrongForAnswer(row.player.userId, question);
    }
    const reward = await db.insert(pkRewards).values({ matchId, userId: row.player.userId, nova: match.rewardNova + (byId.get(row.player.userId) === 1 ? 10 : 0), xp: match.rewardXp + (byId.get(row.player.userId) === 1 ? 20 : 0), wrongQuestionCount: answers.filter((item) => !item.isCorrect).length, idempotencyKey: `pk-reward:${matchId}:${row.player.userId}` }).onConflictDoNothing().returning();
    if (reward[0]) {
      await grantLearningReward({ userId: row.player.userId, nova: reward[0].nova, xp: reward[0].xp, reason: `完成線上 PK：${match.subject}`, idempotencyKey: reward[0].idempotencyKey });
      await progressDailyTask(row.player.userId, "quiz", 1);
      await progressActivities(row.player.userId, "quiz", 1);
      await recordStudy({ userId: row.player.userId, kind: "online_pk", subject: match.subject, minutes: Math.max(1, Math.round(((match.finishedAt?.getTime() ?? Date.now()) - (match.startsAt?.getTime() ?? Date.now())) / 60_000)), detail: { matchId, rank: byId.get(row.player.userId) ?? null } });
      await bumpAchievement(row.player.userId, "pk_matches", 1);
      await notify({ userId: row.player.userId, kind: "pk_result", title: "🏁 PK 結算完成", body: `你在 ${match.subject} PK 取得第 ${byId.get(row.player.userId) ?? "—"} 名。`, link: `/online-pk?match=${matchId}`, dedupeKey: `pk-result:${matchId}:${row.player.userId}`, push: true });
    }
  }
  await db.update(pkPresence).set({ state: "recently_active", currentMatchId: null, currentRoomId: null, updatedAt: new Date() }).where(eq(pkPresence.currentMatchId, matchId));
  await emitMatchEvent(matchId, "match_finished", null, { matchId });
  return { match, players: ranked.map((row) => ({ ...players.find((item) => item.player.userId === row.player.userId), rank: row.rank })) };
}

async function matchPayload(matchId: string, userId: string) {
  const match = await syncMatch(matchId);
  if (!match) throw notFound("找不到 PK 賽場");
  const player = await getPlayer(matchId, userId);
  if (!player) throw forbidden("你不是這場 PK 的參與者");
  const players = await db.select({ player: pkMatchPlayers, displayName: users.displayName, novaId: users.novaId }).from(pkMatchPlayers).innerJoin(users, eq(users.userId, pkMatchPlayers.userId)).where(eq(pkMatchPlayers.matchId, matchId)).orderBy(asc(pkMatchPlayers.rank), desc(pkMatchPlayers.score));
  const questionRows = await db.select().from(pkMatchQuestions).where(eq(pkMatchQuestions.matchId, matchId)).orderBy(asc(pkMatchQuestions.orderIndex));
  const room = match.roomId ? (await db.select().from(pkRooms).where(eq(pkRooms.id, match.roomId)).limit(1))[0] ?? null : null;
  const answerCount = await db.select({ count: sql<number>`count(*)::int` }).from(pkPlayerAnswers).where(and(eq(pkPlayerAnswers.matchId, matchId), eq(pkPlayerAnswers.userId, userId)));
  return {
    match: { id: match.id, roomId: match.roomId, status: match.status, mode: match.mode, teamMode: match.teamMode, subject: match.subject, grade: match.grade, unit: match.unit, difficulty: match.difficulty, questionCount: match.questionCount, questionTimeSec: match.questionTimeSec, currentQuestion: match.currentQuestion, startsAt: match.startsAt, endsAt: match.endsAt, finishedAt: match.finishedAt, allowLateJoin: match.allowLateJoin, allowSpectators: match.allowSpectators, showRanking: match.showRanking },
    room: room ? { id: room.id, name: room.name, roomCode: room.roomCode, shareToken: room.shareToken, visibility: room.visibility, maxPlayers: room.maxPlayers, status: room.status, hostId: room.hostId } : null,
    me: { userId, score: player.score, combo: player.combo, maxCombo: player.maxCombo, correctCount: player.correctCount, answeredCount: Number(answerCount[0]?.count ?? 0), rank: player.rank },
    players: players.map((row) => ({ ...row.player, displayName: row.displayName, novaId: row.novaId, optionOrders: undefined })),
    questions: questionRows.map((question) => publicQuestion(question, userId, matchId)),
  };
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/pk/question-banks",
    auth: "user",
    handler: async () => {
      const config = await getPkConfig();
      const banks = await db.select({ bank: questionBanks, questionCount: sql<number>`(select count(*) from ${questions} where ${questions.bankId} = ${questionBanks.id} and ${questions.status} <> 'draft')::int` }).from(questionBanks).where(and(ne(questionBanks.status, "archived"), config.allowedBankIds.length ? inArray(questionBanks.id, config.allowedBankIds) : sql`true`)).orderBy(asc(questionBanks.name));
      return { banks: banks.filter((row) => Number(row.questionCount) >= 5) };
    },
  }),
  route({
    method: "GET",
    path: "/pk/sources",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const banks = await db.select({ id: questionBanks.id, name: questionBanks.name, subject: questionBanks.subject, count: sql<number>`(select count(*) from ${questions} q where q.bank_id = ${questionBanks.id} and q.status <> 'draft')::int` }).from(questionBanks).where(ne(questionBanks.status, "archived")).orderBy(asc(questionBanks.name));
      const folders = await db.select({ id: vocabularyFolders.id, name: vocabularyFolders.name, count: sql<number>`count(${vocabularyFolderItems.vocabularyId})::int` }).from(vocabularyFolders).leftJoin(vocabularyFolderItems, eq(vocabularyFolderItems.folderId, vocabularyFolders.id)).where(eq(vocabularyFolders.userId, user.userId)).groupBy(vocabularyFolders.id).orderBy(asc(vocabularyFolders.name));
      const materials = await db.select({ id: studyMaterials.id, title: studyMaterials.title, subject: studyMaterials.subject }).from(studyMaterials).where(eq(studyMaterials.userId, user.userId)).orderBy(desc(studyMaterials.createdAt)).limit(100);
      return { banks, folders, materials, vocabulary: { id: null, name: "我的單字", sourceType: "vocabulary" } };
    },
  }),
  route({
    method: "POST",
    path: "/pk/self-test",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "pk-self-test" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await getPkConfig();
      settingsError(config, "customRoomEnabled");
      const body = await ctx.json(z.object({ questionBankId: z.string().uuid(), subject: z.string().max(80).default(""), grade: z.string().max(40).default(""), unit: z.string().max(80).default(""), difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), questionCount: z.number().int().min(5).max(50).default(10), questionTimeSec: z.number().int().min(5).max(120).default(30) }));
      assertPkBankAllowed(config, body.questionBankId);
      const bank = (await db.select({ subject: questionBanks.subject }).from(questionBanks).where(eq(questionBanks.id, body.questionBankId)).limit(1))[0];
      if (!bank) throw badRequest("請選擇有效的自我測驗題庫");
      const result = await createMatch(user.userId, { mode: "1v1", teamMode: "solo", questionBankId: body.questionBankId, sourceType: "bank", sourceId: body.questionBankId, subject: body.subject || bank.subject, grade: body.grade, unit: body.unit, difficulty: body.difficulty, questionCount: body.questionCount, questionTimeSec: body.questionTimeSec, allowLateJoin: false, allowSpectators: false, showRanking: false, rewardNova: 0, rewardXp: 0 });
      const startsAt = new Date(Date.now() + 3000);
      await db.update(pkMatches).set({ status: "countdown", startsAt, updatedAt: new Date() }).where(eq(pkMatches.id, result.match.id));
      return { matchId: result.match.id, status: "ready", preparation: { estimatedSeconds: 3, message: "題目已建立完成，3 秒後開始自我測驗。" } };
    },
  }),
  route({
    method: "GET",
    path: "/pk/overview",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await getPkConfig();
      const now = new Date();
      const [online, pkOnline, matching, waitingRooms, liveMatches] = await Promise.all([
        db.select({ count: sql<number>`count(distinct ${pkPresence.userId})::int` }).from(pkPresence).where(and(gte(pkPresence.expiresAt, now), sql`${pkPresence.state} <> 'offline'`)),
        db.select({ count: sql<number>`count(distinct ${pkPresence.userId})::int` }).from(pkPresence).where(and(gte(pkPresence.expiresAt, now), sql`${pkPresence.currentMatchId} is not null`)),
        db.select({ count: sql<number>`count(distinct ${pkMatchmakingQueue.userId})::int` }).from(pkMatchmakingQueue).where(and(eq(pkMatchmakingQueue.status, "waiting"), gte(pkMatchmakingQueue.expiresAt, now))),
        db.select({ count: sql<number>`count(*)::int` }).from(pkRooms).where(eq(pkRooms.status, "waiting")),
        db.select({ count: sql<number>`count(*)::int` }).from(pkMatches).where(sql`${pkMatches.status} in ('countdown', 'in_progress', 'paused')`),
      ]);
      const live = await db.select({ id: pkMatches.id, subject: pkMatches.subject, mode: pkMatches.mode, status: pkMatches.status, startsAt: pkMatches.startsAt, questionCount: pkMatches.questionCount }).from(pkMatches).where(sql`${pkMatches.status} in ('countdown', 'in_progress', 'paused')`).orderBy(desc(pkMatches.startsAt)).limit(8);
      const my = (await db.select({ id: pkMatches.id }).from(pkMatchPlayers).innerJoin(pkMatches, eq(pkMatches.id, pkMatchPlayers.matchId)).where(and(eq(pkMatchPlayers.userId, user.userId), sql`${pkMatches.status} in ('waiting', 'matching', 'countdown', 'in_progress', 'paused')`)).limit(1))[0] ?? null;
      const activities = await db.select().from(pkActivities).where(and(eq(pkActivities.status, "published"), lte(pkActivities.startsAt, now), gte(pkActivities.endsAt, now))).orderBy(asc(pkActivities.startsAt)).limit(6);
      return { config, online: Number(online[0]?.count ?? 0), pkOnline: Number(pkOnline[0]?.count ?? 0), matchmaking: Number(matching[0]?.count ?? 0), waitingRooms: Number(waitingRooms[0]?.count ?? 0), liveMatches: Number(liveMatches[0]?.count ?? 0), live, activities, myMatchId: my?.id ?? null };
    },
  }),
  route({
    method: "POST",
    path: "/pk/presence/heartbeat",
    auth: "user",
    rate: { limit: 8, windowSec: 60, key: "pk-presence" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ sessionKey: z.string().min(8).max(120), state: playerState.default("online"), currentMatchId: z.string().uuid().nullable().optional(), currentRoomId: z.string().uuid().nullable().optional(), metadata: z.record(z.string(), z.unknown()).optional() }));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90_000);
      const row = await db.insert(pkPresence).values({ userId: user.userId, sessionKey: body.sessionKey, state: body.state, lastHeartbeatAt: now, expiresAt, currentMatchId: body.currentMatchId ?? null, currentRoomId: body.currentRoomId ?? null, metadata: (body.metadata ?? {}) as Record<string, unknown> }).onConflictDoUpdate({ target: [pkPresence.userId, pkPresence.sessionKey], set: { state: body.state, lastHeartbeatAt: now, expiresAt, currentMatchId: body.currentMatchId ?? null, currentRoomId: body.currentRoomId ?? null, metadata: (body.metadata ?? {}) as Record<string, unknown>, updatedAt: now } }).returning({ id: pkPresence.id });
      if (body.currentMatchId) await db.update(pkMatchPlayers).set({ connectionState: "connected", lastHeartbeatAt: now }).where(and(eq(pkMatchPlayers.matchId, body.currentMatchId), eq(pkMatchPlayers.userId, user.userId)));
      return { present: Boolean(row[0]), expiresAt };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matchmaking/join",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "pk-matchmaking-join" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await getPkConfig();
      settingsError(config, "quickMatchEnabled");
      const body = await ctx.json(z.object({ mode: matchMode, questionBankId: z.string().uuid(), grade: z.string().max(40).default(""), unit: z.string().max(80).default(""), difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), questionCount: z.number().int().min(5).max(50).default(10), questionTimeSec: z.number().int().min(5).max(120).default(30), teamMode: teamMode.default("solo") }));
      assertPkBankAllowed(config, body.questionBankId);
      const bank = (await db.select({ subject: questionBanks.subject }).from(questionBanks).where(eq(questionBanks.id, body.questionBankId)).limit(1))[0];
      if (!bank) throw badRequest("請選擇有效的 PK 題庫");
      if (!config.allowedModes.includes(body.mode)) throw badRequest("這個 PK 模式目前未開放");
      const existing = (await db.select().from(pkMatchmakingQueue).where(and(eq(pkMatchmakingQueue.userId, user.userId), eq(pkMatchmakingQueue.status, "waiting"))).limit(1))[0];
      if (existing) return { queue: existing, matched: false, message: "正在尋找對手……" };
      const now = new Date();
      const rows = await db.insert(pkMatchmakingQueue).values({ userId: user.userId, matchType: body.mode, questionBankId: body.questionBankId, subject: bank.subject, grade: body.grade, unit: body.unit, difficulty: body.difficulty, questionCount: body.questionCount, questionTimeSec: body.questionTimeSec, options: { teamMode: body.teamMode }, expiresAt: new Date(now.getTime() + 5 * 60_000) }).returning();
      const candidate = (await db.select().from(pkMatchmakingQueue).where(and(eq(pkMatchmakingQueue.status, "waiting"), eq(pkMatchmakingQueue.matchType, body.mode), eq(pkMatchmakingQueue.questionBankId, body.questionBankId), eq(pkMatchmakingQueue.difficulty, body.difficulty), lte(pkMatchmakingQueue.questionCount, body.questionCount + 5), gte(pkMatchmakingQueue.questionCount, body.questionCount - 5), sql`${pkMatchmakingQueue.userId} <> ${user.userId}`, gte(pkMatchmakingQueue.expiresAt, now))).orderBy(asc(pkMatchmakingQueue.joinedAt)).limit(1))[0];
      if (!candidate) return { queue: rows[0], matched: false, message: "正在尋找對手……" };
      const updated = await db.update(pkMatchmakingQueue).set({ status: "matched" }).where(and(eq(pkMatchmakingQueue.id, candidate.id), eq(pkMatchmakingQueue.status, "waiting"))).returning();
      if (!updated[0]) return { queue: rows[0], matched: false, message: "正在尋找對手……" };
      await db.update(pkMatchmakingQueue).set({ status: "matched" }).where(and(eq(pkMatchmakingQueue.id, rows[0].id), eq(pkMatchmakingQueue.status, "waiting")));
      const match = await createMatch(user.userId, { mode: body.mode, teamMode: body.teamMode, questionBankId: body.questionBankId, subject: bank.subject, grade: body.grade, unit: body.unit, difficulty: body.difficulty, questionCount: Math.max(body.questionCount, candidate.questionCount), questionTimeSec: body.questionTimeSec, allowLateJoin: false, allowSpectators: false, showRanking: true, rewardNova: config.defaultRewardNova, rewardXp: config.defaultRewardXp });
      await db.insert(pkMatchPlayers).values({ matchId: match.match.id, userId: candidate.userId, optionOrders: await questionOrders(db, match.match.id, candidate.userId) }).onConflictDoNothing();
      await emitMatchEvent(match.match.id, "match_found", null, { matchId: match.match.id, playerCount: 2 });
      return { queue: updated[0], matched: true, matchId: match.match.id, message: "已找到對手！" };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matchmaking/cancel",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.update(pkMatchmakingQueue).set({ status: "cancelled" }).where(and(eq(pkMatchmakingQueue.userId, user.userId), eq(pkMatchmakingQueue.status, "waiting")));
      return { cancelled: true };
    },
  }),
  route({
    method: "POST",
    path: "/pk/rooms",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "pk-room-create" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const config = await getPkConfig();
      settingsError(config, "customRoomEnabled");
      const body = await ctx.json(z.object({ name: z.string().min(1).max(80), visibility, password: z.string().max(80).default(""), maxPlayers: z.number().int().min(2).max(12).default(8), mode: matchMode, teamMode: teamMode.default("solo"), questionBankId: z.string().uuid(), grade: z.string().max(40).default(""), unit: z.string().max(80).default(""), difficulty: z.enum(["easy", "normal", "hard"]).default("normal"), questionCount: z.number().int().min(5).max(50).default(10), questionTimeSec: z.number().int().min(5).max(120).default(30), allowLateJoin: z.boolean().default(false), allowSpectators: z.boolean().default(false), showRanking: z.boolean().default(true), inviteIds: z.array(z.string().uuid()).max(20).default([]) }));
      assertPkBankAllowed(config, body.questionBankId);
      const bank = (await db.select({ subject: questionBanks.subject }).from(questionBanks).where(eq(questionBanks.id, body.questionBankId)).limit(1))[0];
      if (!bank) throw badRequest("請選擇有效的 PK 題庫");
      if (body.visibility === "private" && !body.password) throw badRequest("私人房間請設定房間密碼，或使用分享連結邀請");
      const result = await createMatch(user.userId, { mode: body.mode, teamMode: body.teamMode, questionBankId: body.questionBankId, subject: bank.subject, grade: body.grade, unit: body.unit, difficulty: body.difficulty, questionCount: body.questionCount, questionTimeSec: body.questionTimeSec, allowLateJoin: body.allowLateJoin, allowSpectators: body.allowSpectators, showRanking: body.showRanking, rewardNova: config.defaultRewardNova, rewardXp: config.defaultRewardXp }, { name: body.name, visibility: body.visibility, password: body.password, maxPlayers: Math.min(config.maxPlayers, body.maxPlayers), inviteIds: body.inviteIds, roomMode: body.teamMode });
      return { match: result.match, room: result.room, shareUrl: `/online-pk?room=${result.room?.shareToken ?? ""}` };
    },
  }),
  route({
    method: "POST",
    path: "/pk/rooms/join",
    auth: "user",
    rate: { limit: 30, windowSec: 3600, key: "pk-room-join" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ roomCode: z.string().max(20).optional(), shareToken: z.string().max(120).optional(), password: z.string().max(80).default("") }));
      if (!body.roomCode && !body.shareToken) throw badRequest("請輸入房間碼或分享連結");
      const room = (await db.select().from(pkRooms).where(body.shareToken ? eq(pkRooms.shareToken, body.shareToken) : eq(pkRooms.roomCode, body.roomCode!.toUpperCase())).limit(1))[0];
      if (!room || !room.matchId) throw notFound("找不到這個 PK 房間");
      if (room.passwordHash && sha256(body.password) !== room.passwordHash) throw forbidden("房間密碼不正確");
      const match = (await db.select().from(pkMatches).where(eq(pkMatches.id, room.matchId)).limit(1))[0];
      if (!match) throw notFound("找不到對應賽場");
      const lateJoinAllowed = room.status === "started" && match.allowLateJoin && ["countdown", "in_progress"].includes(match.status);
      if (room.status !== "waiting" && !lateJoinAllowed) throw conflict("這個房間目前已經開始或關閉");
      const current = await db.select({ count: sql<number>`count(*)::int` }).from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, room.matchId), eq(pkMatchPlayers.role, "player")));
      if (Number(current[0]?.count ?? 0) >= room.maxPlayers) throw conflict("房間人數已滿");
      const existing = await getPlayer(match.id, user.userId);
      if (!existing) await db.insert(pkMatchPlayers).values({ matchId: match.id, userId: user.userId, optionOrders: await questionOrders(db, match.id, user.userId), currentQuestionStartedAt: match.status === "in_progress" ? new Date() : null }).onConflictDoNothing();
      await emitMatchEvent(match.id, "player_joined", user.userId, { playerCount: Number(current[0]?.count ?? 0) + (existing ? 0 : 1) });
      return { matchId: match.id, room: { ...room, passwordHash: undefined }, joined: !existing };
    },
  }),
  route({
    method: "GET",
    path: "/pk/rooms/share/:token",
    auth: "user",
    handler: async (ctx) => {
      const room = (await db.select({ id: pkRooms.id, name: pkRooms.name, roomCode: pkRooms.roomCode, shareToken: pkRooms.shareToken, visibility: pkRooms.visibility, maxPlayers: pkRooms.maxPlayers, mode: pkRooms.mode, teamMode: pkRooms.teamMode, status: pkRooms.status, matchId: pkRooms.matchId, requiresPassword: sql<boolean>`${pkRooms.passwordHash} <> ''` }).from(pkRooms).where(eq(pkRooms.shareToken, ctx.params.token)).limit(1))[0];
      if (!room) throw notFound("找不到 PK 分享連結");
      return { room };
    },
  }),
  route({
    method: "GET",
    path: "/pk/matches/:id",
    auth: "user",
    handler: async (ctx) => matchPayload(ctx.params.id, ctx.requireUser().userId),
  }),
  route({
    method: "GET",
    path: "/pk/matches/:id/events",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await accessMatch(ctx.params.id, user.userId);
      return sseResponse(ctx.params.id, ctx.req.signal);
    },
  }),
  route({
    method: "POST",
    path: "/pk/matches/:id/start",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const access = await accessMatch(ctx.params.id, user.userId);
      if (access.match.ownerId !== user.userId) throw forbidden("只有房主可以開始 PK");
      if (!["waiting", "matching"].includes(access.match.status)) throw conflict("這場 PK 目前不能開始");
      const count = await db.select({ count: sql<number>`count(*)::int` }).from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.role, "player")));
      if (Number(count[0]?.count ?? 0) < 2) throw badRequest("至少需要 2 位真實玩家才能開始，系統不會建立假玩家");
      const startsAt = new Date(Date.now() + 3_000);
      const updated = await db.update(pkMatches).set({ status: "countdown", startsAt, updatedAt: new Date() }).where(and(eq(pkMatches.id, ctx.params.id), sql`${pkMatches.status} in ('waiting', 'matching')`)).returning();
      if (!updated[0]) throw conflict("另一位玩家已經改變了賽場狀態");
      await db.update(pkRooms).set({ status: "started", startsAt, updatedAt: new Date() }).where(eq(pkRooms.matchId, ctx.params.id));
      await emitMatchEvent(ctx.params.id, "countdown_started", user.userId, { startsAt: startsAt.toISOString() });
      return { match: updated[0] };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matches/:id/heartbeat",
    auth: "user",
    rate: { limit: 8, windowSec: 60, key: "pk-match-heartbeat" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await accessMatch(ctx.params.id, user.userId);
      const now = new Date();
      await db.update(pkMatchPlayers).set({ connectionState: "connected", lastHeartbeatAt: now }).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.userId, user.userId)));
      return { connected: true, at: now };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matches/:id/leave",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const access = await accessMatch(ctx.params.id, user.userId);
      if (["completed", "cancelled"].includes(access.match.status)) return { left: true };
      if (["waiting", "matching"].includes(access.match.status)) await db.delete(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.userId, user.userId)));
      else await db.update(pkMatchPlayers).set({ connectionState: "disconnected", lastHeartbeatAt: new Date() }).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.userId, user.userId)));
      await emitMatchEvent(ctx.params.id, "player_left", user.userId, { userId: user.userId });
      return { left: true };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matches/:id/answer",
    auth: "user",
    rate: { limit: 240, windowSec: 3600, key: "pk-answer" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ questionId: z.string().uuid(), selectedOption: z.string().min(1).max(500), responseMs: z.number().int().min(0).max(120_000), idempotencyKey: z.string().min(8).max(160) }));
      const access = await accessMatch(ctx.params.id, user.userId);
      if (access.match.status !== "in_progress") throw conflict(access.match.status === "countdown" ? "倒數尚未結束，請等 GO 後作答" : "這場 PK 目前不在作答狀態");
      const question = (await db.select().from(pkMatchQuestions).where(and(eq(pkMatchQuestions.id, body.questionId), eq(pkMatchQuestions.matchId, ctx.params.id))).limit(1))[0];
      if (!question) throw badRequest("題目不屬於這場 PK");
      const previousAnswers = await db.select({ id: pkPlayerAnswers.id }).from(pkPlayerAnswers).where(and(eq(pkPlayerAnswers.matchId, ctx.params.id), eq(pkPlayerAnswers.userId, user.userId)));
      if (previousAnswers.length !== question.orderIndex) throw conflict("請依照題目順序作答");
      const existing = (await db.select().from(pkPlayerAnswers).where(eq(pkPlayerAnswers.idempotencyKey, body.idempotencyKey)).limit(1))[0];
      if (existing) return { accepted: false, replay: true, isCorrect: existing.isCorrect, scoreAwarded: existing.scoreAwarded, combo: existing.comboAfter, score: access.player.score };
      const serverElapsedMs = access.player.currentQuestionStartedAt ? Math.max(0, Date.now() - access.player.currentQuestionStartedAt.getTime()) : access.match.questionTimeSec * 1000;
      const withinTime = serverElapsedMs <= access.match.questionTimeSec * 1000 + 1_000;
      const isCorrect = withinTime && normalizePkText(body.selectedOption) === normalizePkText(question.canonicalAnswer);
      const result = calculatePkScore({ correct: isCorrect, elapsedMs: serverElapsedMs, comboBefore: access.player.combo, questionTimeSec: access.match.questionTimeSec });
      const answerRows = await db.insert(pkPlayerAnswers).values({ matchId: ctx.params.id, questionId: question.id, userId: user.userId, selectedOption: body.selectedOption, responseMs: serverElapsedMs, isCorrect, scoreAwarded: result.points, comboAfter: result.combo, idempotencyKey: body.idempotencyKey }).onConflictDoNothing().returning();
      if (!answerRows[0]) return { accepted: false, replay: true, isCorrect: false, scoreAwarded: 0, combo: access.player.combo, score: access.player.score };
      const nextQuestionStartedAt = new Date();
      const updated = (await db.update(pkMatchPlayers).set({ score: sql`${pkMatchPlayers.score} + ${result.points}`, combo: result.combo, maxCombo: sql`greatest(${pkMatchPlayers.maxCombo}, ${result.combo})`, correctCount: sql`${pkMatchPlayers.correctCount} + ${isCorrect ? 1 : 0}`, answeredCount: sql`${pkMatchPlayers.answeredCount} + 1`, totalResponseMs: sql`${pkMatchPlayers.totalResponseMs} + ${serverElapsedMs}`, fastestResponseMs: access.player.fastestResponseMs === null ? serverElapsedMs : sql`least(${pkMatchPlayers.fastestResponseMs}, ${serverElapsedMs})`, lastHeartbeatAt: nextQuestionStartedAt, currentQuestionStartedAt: nextQuestionStartedAt }).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.userId, user.userId))).returning())[0];
      if (!updated) throw conflict("玩家狀態已改變，請重新連線");
      await db.insert(pkMatchScores).values({ matchId: ctx.params.id, userId: user.userId, score: updated.score, rank: updated.rank ?? 0, combo: updated.combo, correctCount: updated.correctCount, answeredCount: updated.answeredCount }).onConflictDoUpdate({ target: [pkMatchScores.matchId, pkMatchScores.userId], set: { score: updated.score, combo: updated.combo, correctCount: updated.correctCount, answeredCount: updated.answeredCount, updatedAt: new Date() } });
      if (body.responseMs < 250) await emitMatchEvent(ctx.params.id, "anomaly_detected", user.userId, { kind: "very_fast_answer", responseMs: body.responseMs, questionId: question.id });
      await emitMatchEvent(ctx.params.id, "answer_submitted", user.userId, { userId: user.userId, score: updated.score, combo: updated.combo, answeredCount: updated.answeredCount });
      const totalPlayers = await db.select({ count: sql<number>`count(*)::int` }).from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.role, "player")));
      const completedPlayers = await db.select({ count: sql<number>`count(*)::int` }).from(pkMatchPlayers).where(and(eq(pkMatchPlayers.matchId, ctx.params.id), eq(pkMatchPlayers.role, "player"), gte(pkMatchPlayers.answeredCount, access.match.questionCount)));
      if (Number(totalPlayers[0]?.count ?? 0) > 0 && Number(totalPlayers[0]?.count ?? 0) === Number(completedPlayers[0]?.count ?? 0)) await finishPkMatch(ctx.params.id);
      return { accepted: true, replay: false, isCorrect, scoreAwarded: result.points, combo: result.combo, score: updated.score, serverResponseMs: serverElapsedMs, finished: Boolean((await db.select({ status: pkMatches.status }).from(pkMatches).where(eq(pkMatches.id, ctx.params.id)).limit(1))[0]?.status === "completed") };
    },
  }),
  route({
    method: "POST",
    path: "/pk/matches/:id/review",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await accessMatch(ctx.params.id, user.userId);
      const body = await ctx.json(z.object({ action: z.enum(["review", "vocabulary"]), questionIds: z.array(z.string().uuid()).min(1).max(50), folderId: z.string().uuid().nullable().optional(), newFolderName: z.string().max(80).optional() }));
      const rows = await db.select({ answer: pkPlayerAnswers, question: pkMatchQuestions }).from(pkPlayerAnswers).innerJoin(pkMatchQuestions, eq(pkMatchQuestions.id, pkPlayerAnswers.questionId)).where(and(eq(pkPlayerAnswers.matchId, ctx.params.id), eq(pkPlayerAnswers.userId, user.userId), eq(pkPlayerAnswers.isCorrect, false), inArray(pkPlayerAnswers.questionId, body.questionIds)));
      if (!rows.length) return { added: 0, skipped: body.questionIds.length };
      let folderId = body.folderId ?? null;
      if (folderId) {
        const folder = (await db.select({ id: vocabularyFolders.id }).from(vocabularyFolders).where(and(eq(vocabularyFolders.id, folderId), eq(vocabularyFolders.userId, user.userId))).limit(1))[0];
        if (!folder) throw forbidden("這個單字資料夾不屬於你");
      }
      if (body.action === "vocabulary" && !folderId) {
        const folder = await db.insert(vocabularyFolders).values({ userId: user.userId, name: body.newFolderName?.trim() || "PK 錯題" }).onConflictDoNothing().returning({ id: vocabularyFolders.id });
        folderId = folder[0]?.id ?? (await db.select({ id: vocabularyFolders.id }).from(vocabularyFolders).where(and(eq(vocabularyFolders.userId, user.userId), eq(vocabularyFolders.name, body.newFolderName?.trim() || "PK 錯題"))).limit(1))[0]?.id ?? null;
      }
      let added = 0;
      for (const row of rows) {
        if (body.action === "review") {
          const wrong = await addWrongForAnswer(user.userId, row.question);
          if (wrong) added += 1;
          continue;
        }
        const word = (await db.select().from(dailyWords).where(ilike(dailyWords.word, row.question.canonicalAnswer)).limit(1))[0];
        if (!word) continue;
        const vocabulary = await db.insert(userVocabularies).values({ userId: user.userId, word: word.word, normalizedWord: normalizePkText(word.word), partOfSpeech: word.partOfSpeech, meaning: word.meaning, example: word.example, exampleZh: word.exampleZh }).onConflictDoNothing().returning({ id: userVocabularies.id });
        const vocabularyId = vocabulary[0]?.id ?? (await db.select({ id: userVocabularies.id }).from(userVocabularies).where(and(eq(userVocabularies.userId, user.userId), eq(userVocabularies.normalizedWord, normalizePkText(word.word)))).limit(1))[0]?.id;
        if (vocabularyId && folderId) await db.insert(vocabularyFolderItems).values({ folderId, vocabularyId }).onConflictDoNothing();
        if (vocabularyId) added += 1;
      }
      await db.update(pkRewards).set({ vocabularyAdded: sql`${pkRewards.vocabularyAdded} + ${added}` }).where(and(eq(pkRewards.matchId, ctx.params.id), eq(pkRewards.userId, user.userId)));
      return { added, skipped: Math.max(0, rows.length - added), folderId };
    },
  }),
  route({
    method: "GET",
    path: "/pk/activities",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const now = new Date();
      const activities = await db.select().from(pkActivities).where(and(eq(pkActivities.status, "published"), lte(pkActivities.startsAt, now), gte(pkActivities.endsAt, now))).orderBy(asc(pkActivities.endsAt)).limit(20);
      const joined = activities.length ? await db.select().from(pkActivityParticipants).where(and(eq(pkActivityParticipants.userId, user.userId), inArray(pkActivityParticipants.activityId, activities.map((activity) => activity.id)))) : [];
      return { activities: activities.map((activity) => ({ ...activity, participation: joined.find((row) => row.activityId === activity.id) ?? null })) };
    },
  }),
];
