import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne, or, sql, gte, lte, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  friends,
  friendRequests,
  friendBlocks,
  groups,
  groupMembers,
  challenges,
  challengeParticipants,
  shares,
  assistantProfiles,
  studyRecords,
  focusSessions,
  activities,
  activityParticipants,
  activityQuestions,
  quizzes,
  weeklyExamWeeks,
  novaAccounts,
  announcements,
  dailyWords,
  userVocabularies,
  userSettings,
  platformSettings,
  challengeQuestionHistory,
  challengeAnswers,
  challengeSettlements,
  novaTransactions,
  shareAnalytics,
  shareCopies,
  aiArtifacts,
  studyMaterials,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, forbidden, fingerprint, joinCode, notFound, slugToken, todayStr, addDaysStr } from "../core";
import { grantLearningReward } from "../economy";
import { notify } from "../notify";
import { objectOwner, readObject } from "../storage";

async function friendIds(userId: string) {
  const rows = await db.select({ friendId: friends.friendId }).from(friends).where(eq(friends.userId, userId));
  return rows.map((r) => r.friendId);
}

async function canViewShare(row: typeof shares.$inferSelect, viewerId: string | null) {
  if (row.visibility === "public" || row.visibility === "link") return true;
  if (!viewerId || row.userId === viewerId) return Boolean(viewerId);
  if (row.visibility !== "friends") return false;
  const friendship = await db.select({ userId: friends.userId }).from(friends).where(or(and(eq(friends.userId, viewerId), eq(friends.friendId, row.userId)), and(eq(friends.userId, row.userId), eq(friends.friendId, viewerId)))).limit(1);
  return Boolean(friendship[0]);
}

async function vocabularyChallengeSetting() {
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "challenge_vocabulary_source")).limit(1))[0];
  const value = (row?.value ?? {}) as { manualOpen?: boolean; minimumWords?: number };
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(dailyWords);
  const minimumWords = Math.max(100, Number(value.minimumWords ?? 100));
  return { totalWords: Number(total?.count ?? 0), minimumWords, manualOpen: value.manualOpen === true };
}

function normalizeChallengeOption(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-TW");
}

function challengeQuestionFingerprint(item: Record<string, unknown>) {
  const options = Array.isArray(item.options) ? item.options.map(normalizeChallengeOption).sort().join("|") : "";
  return fingerprint("challenge-question", String(item.word ?? ""), `${String(item.meaning ?? "")}|${options}`);
}

function publicChallengePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return payload;
  return {
    ...payload,
    items: payload.items.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const item = raw as Record<string, unknown>;
      const safe = { ...item };
      delete safe.answer;
      delete safe.answerLabel;
      delete safe.expected;
      delete safe.canonicalAnswer;
      delete safe.correct;
      const semanticOptions = safe.semanticOptions;
      delete safe.semanticOptions;
      const publicSemanticOptions = Array.isArray(semanticOptions) ? semanticOptions.map((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) return {};
        const publicOption = { ...(option as Record<string, unknown>) };
        delete publicOption.correct;
        return publicOption;
      }) : undefined;
      return {
        ...safe,
        ...(publicSemanticOptions ? { semanticOptions: publicSemanticOptions } : {}),
      };
    }),
  };
}

async function settleChallengeStake(challenge: typeof challenges.$inferSelect) {
  if (challenge.competitionMode !== "stake" || challenge.stakeNova < 100) return null;
  const participants = await db.select({ userId: challengeParticipants.userId, points: challengeParticipants.points, correctCount: challengeParticipants.correctCount, durationSec: challengeParticipants.durationSec, finishedAt: challengeParticipants.finishedAt }).from(challengeParticipants).where(eq(challengeParticipants.challengeId, challenge.id));
  if (participants.length < 2 || participants.some((participant) => !participant.finishedAt)) return null;
  const ordered = [...participants].sort((a, b) => b.points - a.points || b.correctCount - a.correctCount || a.durationSec - b.durationSec);
  if (ordered[0].points === ordered[1].points && ordered[0].correctCount === ordered[1].correctCount && ordered[0].durationSec === ordered[1].durationSec) return { tie: true, amount: 0 };
  const winner = ordered[0];
  const loser = ordered[1];
  const claim = await db.insert(challengeSettlements).values({ challengeId: challenge.id, winnerId: winner.userId, loserId: loser.userId, amount: challenge.stakeNova, winnerPoints: winner.points, loserPoints: loser.points }).onConflictDoNothing().returning();
  if (!claim[0]) return null;
  await db.insert(novaAccounts).values([{ userId: winner.userId }, { userId: loser.userId }]).onConflictDoNothing();
  const winnerBalance = (await db.update(novaAccounts).set({ balance: sql`${novaAccounts.balance} + ${challenge.stakeNova}`, lifetimeEarned: sql`${novaAccounts.lifetimeEarned} + ${challenge.stakeNova}`, updatedAt: new Date() }).where(eq(novaAccounts.userId, winner.userId)).returning({ balance: novaAccounts.balance }))[0]?.balance ?? challenge.stakeNova;
  const loserBalance = (await db.update(novaAccounts).set({ balance: sql`${novaAccounts.balance} - ${challenge.stakeNova}`, lifetimeSpent: sql`${novaAccounts.lifetimeSpent} + ${challenge.stakeNova}`, updatedAt: new Date() }).where(eq(novaAccounts.userId, loser.userId)).returning({ balance: novaAccounts.balance }))[0]?.balance ?? -challenge.stakeNova;
  await db.insert(novaTransactions).values([
    { userId: winner.userId, amount: challenge.stakeNova, balanceAfter: winnerBalance, reason: `挑戰勝利：${challenge.title}`, source: "challenge_stake", idempotencyKey: `challenge-stake-win:${challenge.id}` },
    { userId: loser.userId, amount: -challenge.stakeNova, balanceAfter: loserBalance, reason: `挑戰落敗：${challenge.title}`, source: "challenge_stake", idempotencyKey: `challenge-stake-loss:${challenge.id}` },
  ]).onConflictDoNothing();
  return { tie: false, amount: challenge.stakeNova, winnerId: winner.userId, loserId: loser.userId, winnerPoints: winner.points, loserPoints: loser.points, winnerBalance, loserBalance, debt: Math.max(0, -loserBalance) };
}

export const routes: RouteDef[] = [
  /* -------------------------------------------------------- friends */
  route({
    method: "GET",
    path: "/friends",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const ids = await friendIds(user.userId);
      const list = ids.length
        ? await db
            .select({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, avatarSeed: users.avatarSeed, level: assistantProfiles.level, xp: assistantProfiles.xp })
            .from(users)
            .leftJoin(assistantProfiles, eq(assistantProfiles.userId, users.userId))
            .where(inArray(users.userId, ids))
        : [];
      const incoming = await db
        .select({ id: friendRequests.id, fromUserId: friendRequests.fromUserId, novaId: users.novaId, displayName: users.displayName, createdAt: friendRequests.createdAt })
        .from(friendRequests)
        .innerJoin(users, eq(users.userId, friendRequests.fromUserId))
        .where(and(eq(friendRequests.toUserId, user.userId), eq(friendRequests.status, "pending")));
      const outgoing = await db
        .select({ id: friendRequests.id, toUserId: friendRequests.toUserId, novaId: users.novaId, displayName: users.displayName, status: friendRequests.status })
        .from(friendRequests)
        .innerJoin(users, eq(users.userId, friendRequests.toUserId))
        .where(and(eq(friendRequests.fromUserId, user.userId), eq(friendRequests.status, "pending")));
      const blocked = await db
        .select({ id: friendBlocks.id, blockedId: friendBlocks.blockedId, novaId: users.novaId, displayName: users.displayName })
        .from(friendBlocks)
        .innerJoin(users, eq(users.userId, friendBlocks.blockedId))
        .where(eq(friendBlocks.userId, user.userId));
      return { friends: list, incoming, outgoing, blocked };
    },
  }),

  route({
    method: "POST",
    path: "/friends/request",
    auth: "user",
    rate: { limit: 40, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ novaId: z.string().min(4).max(20) }));
      const target = (await db.select().from(users).where(eq(users.novaId, body.novaId.toUpperCase().trim())).limit(1))[0];
      if (!target) throw fail("ACCT_NOT_FOUND");
      if (target.userId === user.userId) throw fail("SOCIAL_SELF_FRIEND");
      const blocked = await db
        .select()
        .from(friendBlocks)
        .where(or(and(eq(friendBlocks.userId, target.userId), eq(friendBlocks.blockedId, user.userId)), and(eq(friendBlocks.userId, user.userId), eq(friendBlocks.blockedId, target.userId))))
        .limit(1);
      if (blocked[0]) throw fail("SOCIAL_BLOCKED");
      const already = await db.select().from(friends).where(and(eq(friends.userId, user.userId), eq(friends.friendId, target.userId))).limit(1);
      if (already[0]) throw fail("SOCIAL_ALREADY_FRIEND");

      const reverse = (
        await db
          .select()
          .from(friendRequests)
          .where(and(eq(friendRequests.fromUserId, target.userId), eq(friendRequests.toUserId, user.userId), eq(friendRequests.status, "pending")))
          .limit(1)
      )[0];
      if (reverse) {
        await db.update(friendRequests).set({ status: "accepted" }).where(eq(friendRequests.id, reverse.id));
        await db.insert(friends).values([{ userId: user.userId, friendId: target.userId }, { userId: target.userId, friendId: user.userId }]).onConflictDoNothing();
        await notify({ userId: target.userId, kind: "friend", title: "🤝 好友邀請已接受", body: `${user.displayName} 現在是你的好友`, link: "/challenge?tab=friends" });
        return { status: "accepted" };
      }

      const rows = await db
        .insert(friendRequests)
        .values({ fromUserId: user.userId, toUserId: target.userId })
        .onConflictDoUpdate({ target: [friendRequests.fromUserId, friendRequests.toUserId], set: { status: "pending", createdAt: new Date() } })
        .returning();
      await notify({
        userId: target.userId,
        kind: "friend",
        title: "🤝 有人想加你好友",
        body: `${user.displayName}（${user.novaId}）送出好友邀請`,
        link: "/challenge?tab=friends",
        dedupeKey: `friendreq:${rows[0].id}`,
        push: true,
      });
      return { status: "pending", request: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/friends/requests/:id/respond",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ accept: z.boolean() }));
      const req = (await db.select().from(friendRequests).where(eq(friendRequests.id, ctx.params.id)).limit(1))[0];
      if (!req) throw fail("SOCIAL_REQUEST_NOT_FOUND");
      if (req.toUserId !== user.userId) throw forbidden();
      if (req.status !== "pending") throw fail("SOCIAL_REQUEST_HANDLED");
      await db.update(friendRequests).set({ status: body.accept ? "accepted" : "rejected" }).where(eq(friendRequests.id, req.id));
      if (body.accept) {
        await db.insert(friends).values([{ userId: req.fromUserId, friendId: req.toUserId }, { userId: req.toUserId, friendId: req.fromUserId }]).onConflictDoNothing();
        await notify({ userId: req.fromUserId, kind: "friend", title: "🤝 好友邀請已接受", body: `${user.displayName} 接受了你的邀請`, link: "/challenge?tab=friends" });
      }
      return { status: body.accept ? "accepted" : "rejected" };
    },
  }),

  route({
    method: "DELETE",
    path: "/friends/:userId",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(friends).where(or(and(eq(friends.userId, user.userId), eq(friends.friendId, ctx.params.userId)), and(eq(friends.userId, ctx.params.userId), eq(friends.friendId, user.userId))));
      return { removed: true };
    },
  }),

  route({
    method: "POST",
    path: "/friends/block",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ userId: z.string().uuid(), block: z.boolean() }));
      if (body.userId === user.userId) throw fail("ACCT_SELF_ACTION", { message: "不能封鎖自己" });
      if (body.block) {
        await db.insert(friendBlocks).values({ userId: user.userId, blockedId: body.userId }).onConflictDoNothing();
        await db.delete(friends).where(or(and(eq(friends.userId, user.userId), eq(friends.friendId, body.userId)), and(eq(friends.userId, body.userId), eq(friends.friendId, user.userId))));
      } else {
        await db.delete(friendBlocks).where(and(eq(friendBlocks.userId, user.userId), eq(friendBlocks.blockedId, body.userId)));
      }
      return { blocked: body.block };
    },
  }),

  /* ----------------------------------------------------- challenges */
  route({
    method: "GET",
    path: "/challenges",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const ids = await friendIds(user.userId);
      const scope = [user.userId, ...ids];
      const rows = await db
        .select({
          id: challenges.id,
          kind: challenges.kind,
          title: challenges.title,
          creatorId: challenges.creatorId,
          creatorName: users.displayName,
          quizId: challenges.quizId,
          payload: challenges.payload,
          status: challenges.status,
          competitionMode: challenges.competitionMode,
          stakeNova: challenges.stakeNova,
          expiresAt: challenges.expiresAt,
          createdAt: challenges.createdAt,
        })
        .from(challenges)
        .innerJoin(users, eq(users.userId, challenges.creatorId))
        .where(and(inArray(challenges.creatorId, scope), eq(challenges.status, "open"), gte(challenges.expiresAt, new Date())))
        .orderBy(desc(challenges.createdAt))
        .limit(30);
      const out = [];
      for (const c of rows) {
        const parts = await db
          .select({ userId: challengeParticipants.userId, score: challengeParticipants.score, points: challengeParticipants.points, correctCount: challengeParticipants.correctCount, wrongCount: challengeParticipants.wrongCount, durationSec: challengeParticipants.durationSec, finishedAt: challengeParticipants.finishedAt, displayName: users.displayName, novaId: users.novaId })
          .from(challengeParticipants)
          .innerJoin(users, eq(users.userId, challengeParticipants.userId))
          .where(eq(challengeParticipants.challengeId, c.id))
          .orderBy(desc(challengeParticipants.score), asc(challengeParticipants.durationSec));
        out.push({ ...c, payload: publicChallengePayload(c.payload), participants: parts, joined: parts.some((p) => p.userId === user.userId) });
      }
      return { challenges: out };
    },
  }),

  route({
    method: "POST",
    path: "/challenges",
    auth: "user",
    rate: { limit: 30, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          kind: z.enum(["word", "quiz", "weekly"]),
          title: z.string().min(1).max(60),
          quizId: z.string().uuid().nullable().optional(),
          weekId: z.string().uuid().nullable().optional(),
          durationHours: z.number().int().min(1).max(168).default(48),
          inviteIds: z.array(z.string().uuid()).max(20).default([]),
          track: z.enum(["junior", "senior"]).default("junior"),
          questionCount: z.number().int().min(5).max(200).default(10),
          direction: z.enum(["zh2en", "en2zh", "mixed"]).default("mixed"),
          difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
          challengeMode: z.enum(["choice", "listening", "handwriting", "confusable", "part_of_speech", "meaning", "semantic_image"]).default("choice"),
          timeMode: z.enum(["standard", "sprint"]).default("standard"),
          source: z.enum(["catalog", "mine", "vocabulary", "material"]).default("catalog"),
          sourceId: z.string().uuid().nullable().optional(),
          competitionMode: z.enum(["entertainment", "stake"]).default("entertainment"),
          stakeNova: z.number().int().min(0).max(100000).default(0),
        }),
      );
      if (body.competitionMode === "stake" && body.stakeNova < 100) throw badRequest("籌碼競賽最低 100 Nova；也可以選擇娛樂模式，不扣籌碼");
      if (body.kind === "quiz") {
        if (!body.quizId) throw badRequest("請選擇測驗");
        const q = (await db.select().from(quizzes).where(eq(quizzes.id, body.quizId)).limit(1))[0];
        if (!q || q.userId !== user.userId) throw fail("SOCIAL_QUIZ_NOT_OWNED");
        await db.update(quizzes).set({ visibility: "friends", shareSlug: q.shareSlug ?? slugToken(12) }).where(eq(quizzes.id, q.id));
      }
      if (body.kind === "weekly") {
        if (!body.weekId) throw badRequest("請選擇每週小考");
        const week = (await db.select({ id: weeklyExamWeeks.id, title: weeklyExamWeeks.title, status: weeklyExamWeeks.status }).from(weeklyExamWeeks).where(eq(weeklyExamWeeks.id, body.weekId)).limit(1))[0];
        if (!week || week.status !== "published") throw badRequest("這個每週小考目前不可參加");
      }
      let challengeItems: Array<Record<string, unknown>> = [];
      if (body.kind === "word") {
        const count = Math.max(5, Math.min(200, body.questionCount));
        if (body.source === "material") {
          if (!body.sourceId) throw badRequest("請選擇教材");
          const material = (await db.select({ title: studyMaterials.title, content: studyMaterials.content }).from(studyMaterials).where(and(eq(studyMaterials.id, body.sourceId), eq(studyMaterials.userId, user.userId))).limit(1))[0];
          if (!material) throw forbidden("這份教材不屬於你");
          const chunks = material.content.split(/\n{2,}|(?<=[。！？.!?])\s+/).map((item) => item.trim()).filter((item) => item.length >= 12).slice(0, 200);
          for (let i = 0; i < Math.min(count, chunks.length); i += 1) {
            const current = chunks[i];
            const options = [current, ...chunks.filter((_, index) => index !== i).slice(0, 3)];
            challengeItems.push({ id: `${body.sourceId}-${i}`, word: `教材內容 ${i + 1}`, meaning: current, example: current, direction: "en2zh", challengeMode: "choice", timeMode: body.timeMode, sentence: current, options: options.sort(() => Math.random() - 0.5), answer: current, answerLabel: current, sourceLabel: material.title });
          }
        } else {
        if (body.source === "vocabulary") {
          const setting = await vocabularyChallengeSetting();
          if (!setting.manualOpen && setting.totalWords < setting.minimumWords) throw badRequest(`字詞百科題庫尚未開放，目前 ${setting.totalWords}/${setting.minimumWords} 個單字`);
        }
        // 題目在建立挑戰時一次抽好並寫入 payload，所有參與者讀到完全相同的題目。
        // 每一題的選項也預先洗牌，且同一輪不重複使用選項文字。
        const pool = body.source === "mine"
          ? await db.select({ id: userVocabularies.id, word: userVocabularies.word, meaning: userVocabularies.meaning, partOfSpeech: userVocabularies.partOfSpeech, example: userVocabularies.example, exampleZh: userVocabularies.exampleZh, level: sql<string>`'mine'` }).from(userVocabularies).where(eq(userVocabularies.userId, user.userId)).orderBy(sql`random()`).limit(200)
          : await db.select({ id: dailyWords.id, word: dailyWords.word, meaning: dailyWords.meaning, partOfSpeech: dailyWords.partOfSpeech, example: dailyWords.example, exampleZh: dailyWords.exampleZh, level: dailyWords.level }).from(dailyWords).where(body.source === "vocabulary" ? sql`true` : eq(dailyWords.level, body.track)).orderBy(sql`random()`).limit(Math.min(800, count * 4));
        const distinctPool = pool.filter((item, index, all) => {
          const normalized = item.word.trim().toLocaleLowerCase("en-US");
          return normalized && all.findIndex((candidate) => candidate.word.trim().toLocaleLowerCase("en-US") === normalized) === index;
        });
        if (body.source === "mine") {
          for (let i = 0; i < Math.min(count, distinctPool.length); i += 1) {
            const current = distinctPool[i];
            const direction = body.direction === "mixed" ? (i % 2 === 0 ? "zh2en" : "en2zh") : body.direction;
            const answer = body.challengeMode === "semantic_image" ? `${current.id}-correct` : body.challengeMode === "part_of_speech" ? current.partOfSpeech : direction === "zh2en" ? current.word : current.meaning;
            const answerLabel = body.challengeMode === "semantic_image" ? "語意圖片" : answer;
            const options = body.challengeMode === "part_of_speech"
              ? [answer, "n.", "v.", "adj.", "adv.", "prep.", "conj."].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4)
              : [answer, ...distinctPool.filter((item) => item.id !== current.id).map((item) => direction === "zh2en" ? item.word : item.meaning).filter(Boolean)].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4);
            challengeItems.push({ ...current, direction, challengeMode: body.challengeMode, timeMode: body.timeMode, sentence: current.example, options: options.sort(() => Math.random() - 0.5), answer, answerLabel });
          }
        } else {
          for (let i = 0; i < Math.min(count, Math.floor(distinctPool.length / 4)); i += 1) {
            const group = distinctPool.slice(i * 4, i * 4 + 4);
            const direction = body.direction === "mixed" ? (i % 2 === 0 ? "zh2en" : "en2zh") : body.direction;
            const answer = body.challengeMode === "semantic_image" ? `${group[0].id}-correct` : body.challengeMode === "part_of_speech" ? group[0].partOfSpeech : direction === "zh2en" ? group[0].word : group[0].meaning;
            const answerLabel = body.challengeMode === "semantic_image" ? "語意圖片" : answer;
            const options = body.challengeMode === "part_of_speech" ? [answer, "n.", "v.", "adj.", "adv.", "prep.", "conj."].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4) : group.map((item) => direction === "zh2en" ? item.word : item.meaning).filter(Boolean);
            challengeItems.push({ ...group[0], direction, challengeMode: body.challengeMode, timeMode: body.timeMode, sentence: group[0].example, options: [...options].sort(() => Math.random() - 0.5), answer, answerLabel });
          }
        }
        }
        if (challengeItems.length < 5) throw fail("CHAL_BANK_EMPTY");
        }
      const rows = await db
        .insert(challenges)
        .values({
          creatorId: user.userId,
          kind: body.kind,
          title: body.title,
          quizId: body.quizId ?? null,
          competitionMode: body.competitionMode,
          stakeNova: body.competitionMode === "stake" ? body.stakeNova : 0,
          payload: body.kind === "weekly" ? { weekId: body.weekId } : body.kind === "word" ? {
            track: body.track,
            questionCount: body.questionCount,
            direction: body.direction,
            difficulty: body.difficulty,
            challengeMode: body.challengeMode,
            source: body.source,
            timeMode: body.timeMode,
            items: challengeItems,
            readyUserIds: [user.userId],
          } : {},
          expiresAt: new Date(Date.now() + body.durationHours * 3600_000),
        })
        .returning();
      await db.insert(challengeParticipants).values({ challengeId: rows[0].id, userId: user.userId }).onConflictDoNothing();
      for (const id of body.inviteIds) {
        await notify({ userId: id, kind: "challenge", title: `⚔️ ${user.displayName} 向你發起挑戰`, body: body.title, link: "/challenge", dedupeKey: `chal:${rows[0].id}:${id}`, push: true });
      }
      return { challenge: { ...rows[0], payload: publicChallengePayload(rows[0].payload) } };
    },
  }),

  route({
    method: "GET",
    path: "/challenges/:id/words",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const challenge = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!challenge) throw fail("CHAL_MATCH_NOT_FOUND");
      const ids = await friendIds(user.userId);
      if (challenge.creatorId !== user.userId && !ids.includes(challenge.creatorId)) throw forbidden("只有挑戰發起人或好友可以參加");
      if (challenge.kind !== "word") throw badRequest("這不是單字挑戰");
      if (challenge.status !== "open") throw badRequest("這個挑戰目前已暫停或關閉");
      if (challenge.expiresAt && new Date(challenge.expiresAt) <= new Date()) throw fail("SOCIAL_CHALLENGE_ENDED");
      const payload = challenge.payload as { track?: "junior" | "senior"; questionCount?: number; difficulty?: string; direction?: string; timeMode?: "standard" | "sprint"; items?: Array<Record<string, unknown>>; readyUserIds?: string[] };
      const track = payload.track === "senior" ? "senior" : "junior";
      const count = Math.max(5, Math.min(200, Number(payload.questionCount ?? 10)));
      const appearedDate = todayStr();
      const history = await db.select({ questionFingerprint: challengeQuestionHistory.questionFingerprint, options: challengeQuestionHistory.options }).from(challengeQuestionHistory).where(and(eq(challengeQuestionHistory.userId, user.userId), eq(challengeQuestionHistory.appearedDate, appearedDate)));
      const usedQuestions = new Set(history.map((item) => item.questionFingerprint));
      const usedOptions = new Set(history.flatMap((item) => item.options.map(normalizeChallengeOption)));
      const sourceRows = payload.items?.length ? payload.items : await db.select({ id: dailyWords.id, word: dailyWords.word, meaning: dailyWords.meaning, partOfSpeech: dailyWords.partOfSpeech, example: dailyWords.example, exampleZh: dailyWords.exampleZh, level: dailyWords.level }).from(dailyWords).where(eq(dailyWords.level, track)).orderBy(sql`random()`).limit(Math.min(800, count * 8));
      const freshRows = sourceRows.filter((item) => {
        const record = item as Record<string, unknown>;
        const questionKey = challengeQuestionFingerprint(record);
        const options = Array.isArray(record.options) ? record.options.map(normalizeChallengeOption).filter(Boolean) : [];
        return !usedQuestions.has(questionKey) && !options.some((option) => usedOptions.has(option));
      });
      const rows = freshRows.slice(0, count);
      if (!rows.length) throw fail("CHAL_BANK_EMPTY", { message: "這位使用者已完成目前題庫的題目與選項，請等待新的題庫內容" });
      await db.insert(challengeQuestionHistory).values(rows.map((record) => ({ userId: user.userId, challengeId: challenge.id, questionFingerprint: challengeQuestionFingerprint(record as Record<string, unknown>), appearedDate, options: Array.isArray((record as Record<string, unknown>).options) ? ((record as Record<string, unknown>).options as unknown[]).map(String) : [] }))).onConflictDoNothing();
      const publicWords = rows.map((row) => {
        const item = row as Record<string, unknown>;
        const semanticOptions = Array.isArray(item.semanticOptions)
          ? item.semanticOptions.map((option) => {
              const value = option as Record<string, unknown>;
              return { id: value.id, label: value.label, emoji: value.emoji, imageUrl: value.imageUrl };
            })
          : undefined;
        return {
          id: item.id, word: item.word, meaning: item.meaning, partOfSpeech: item.partOfSpeech,
          example: item.example, exampleZh: item.exampleZh, level: item.level,
          direction: item.direction, challengeMode: item.challengeMode, timeMode: item.timeMode,
          options: item.options, sentence: item.sentence, semanticOptions,
        };
      });
      return { challengeId: challenge.id, title: challenge.title, expiresAt: challenge.expiresAt, readyCount: payload.readyUserIds?.length ?? 0, ready: (payload.readyUserIds ?? []).includes(user.userId), settings: { track, count, direction: payload.direction ?? "mixed", difficulty: payload.difficulty ?? "normal", timeMode: payload.timeMode ?? "standard" }, words: publicWords };
    },
  }),

  route({
    method: "POST",
    path: "/challenges/:id/ready",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const challenge = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!challenge || challenge.kind !== "word") throw fail("CHAL_MATCH_NOT_FOUND");
      if (challenge.status !== "open" || (challenge.expiresAt && new Date(challenge.expiresAt) <= new Date())) throw fail("SOCIAL_CHALLENGE_ENDED");
      const ids = await friendIds(user.userId);
      if (challenge.creatorId !== user.userId && !ids.includes(challenge.creatorId)) throw forbidden("只有挑戰發起人或好友可以參加");
      const payload = challenge.payload as { readyUserIds?: string[] };
      const readyUserIds = Array.from(new Set([...(payload.readyUserIds ?? []), user.userId]));
      await db.update(challenges).set({ payload: { ...payload, readyUserIds } }).where(eq(challenges.id, challenge.id));
      await db.insert(challengeParticipants).values({ challengeId: challenge.id, userId: user.userId }).onConflictDoNothing();
      return { ready: true, readyCount: readyUserIds.length, canStart: readyUserIds.length >= 2 };
    },
  }),

  route({
    method: "POST",
    path: "/challenges/:id/answer",
    auth: "user",
    rate: { limit: 300, windowSec: 3600, key: "challenge-answer" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ questionIndex: z.number().int().min(0).max(200), correct: z.boolean(), response: z.string().max(500).default("") }));
      const challenge = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!challenge || challenge.status !== "open") throw fail("CHAL_MATCH_NOT_FOUND");
      if (challenge.expiresAt && new Date(challenge.expiresAt) <= new Date()) throw fail("CHAL_MATCH_ENDED");
      const allowedIds = await friendIds(user.userId);
      if (challenge.creatorId !== user.userId && !allowedIds.includes(challenge.creatorId)) throw forbidden("只有挑戰發起人或好友可以參加");
      const challengePayload = challenge.payload as { items?: Array<Record<string, unknown>> };
      const item = challengePayload.items?.[body.questionIndex];
      if (!item) throw badRequest("題目不存在或已失效");
      const canonicalAnswer = String(item.challengeMode === "semantic_image" ? `${String(item.id ?? "")}-correct` : item.answer ?? "").trim();
      if (!canonicalAnswer) throw badRequest("這道題目缺少有效答案，請聯絡管理員");
      const displayAnswer = String(item.answerLabel ?? (item.challengeMode === "semantic_image" ? "語意圖片" : item.answer) ?? "").trim();
      const expected = canonicalAnswer.toLocaleLowerCase();
      const actualCorrect = expected.length > 0 && expected === body.response.trim().toLocaleLowerCase();
      await db.insert(challengeParticipants).values({ challengeId: challenge.id, userId: user.userId }).onConflictDoNothing();
      const inserted = await db.insert(challengeAnswers).values({ challengeId: challenge.id, userId: user.userId, questionIndex: body.questionIndex, correct: actualCorrect, response: body.response }).onConflictDoNothing().returning();
      if (!inserted[0]) {
        const previous = (await db.select({ correct: challengeAnswers.correct }).from(challengeAnswers).where(and(eq(challengeAnswers.challengeId, challenge.id), eq(challengeAnswers.userId, user.userId), eq(challengeAnswers.questionIndex, body.questionIndex))).limit(1))[0];
        const current = (await db.select({ points: challengeParticipants.points, correctCount: challengeParticipants.correctCount, wrongCount: challengeParticipants.wrongCount }).from(challengeParticipants).where(and(eq(challengeParticipants.challengeId, challenge.id), eq(challengeParticipants.userId, user.userId))).limit(1))[0];
        return { accepted: false, isCorrect: previous?.correct ?? false, expectedAnswer: displayAnswer, points: current?.points ?? 0, correctCount: current?.correctCount ?? 0, wrongCount: current?.wrongCount ?? 0, reason: "這一題已經提交過" };
      }
      let pointsAwarded = 0;
      if (actualCorrect) {
        const firstCorrect = await db.select({ id: challengeAnswers.id }).from(challengeAnswers).where(and(eq(challengeAnswers.challengeId, challenge.id), eq(challengeAnswers.questionIndex, body.questionIndex), eq(challengeAnswers.correct, true))).orderBy(asc(challengeAnswers.answeredAt)).limit(1);
        pointsAwarded = firstCorrect[0]?.id === inserted[0].id ? 1 : 0;
        await db.update(challengeAnswers).set({ pointsAwarded }).where(eq(challengeAnswers.id, inserted[0].id));
      }
      const updated = await db.update(challengeParticipants).set({ points: sql`${challengeParticipants.points} + ${pointsAwarded}`, correctCount: sql`${challengeParticipants.correctCount} + ${actualCorrect ? 1 : 0}`, wrongCount: sql`${challengeParticipants.wrongCount} + ${actualCorrect ? 0 : 1}`, score: sql`${challengeParticipants.score} + ${pointsAwarded}` }).where(and(eq(challengeParticipants.challengeId, challenge.id), eq(challengeParticipants.userId, user.userId))).returning({ points: challengeParticipants.points, correctCount: challengeParticipants.correctCount, wrongCount: challengeParticipants.wrongCount });
      return { accepted: true, isCorrect: actualCorrect, expectedAnswer: displayAnswer, pointsAwarded, points: updated[0]?.points ?? pointsAwarded, correctCount: updated[0]?.correctCount ?? (actualCorrect ? 1 : 0), wrongCount: updated[0]?.wrongCount ?? (actualCorrect ? 0 : 1), firstCorrect: pointsAwarded === 1 };
    },
  }),

  route({
    method: "POST",
    path: "/challenges/:id/submit",
    auth: "user",
    rate: { limit: 20, windowSec: 3600, key: "challenge-submit" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ score: z.number().int().min(0).max(10000), durationSec: z.number().int().min(0).max(36000), records: z.array(z.object({ word: z.string().max(400), prompt: z.string().max(1000), expected: z.string().max(400), response: z.string().max(400), correct: z.boolean(), timedOut: z.boolean() })).max(200).optional() }));
      const c = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!c) throw fail("CHAL_MATCH_NOT_FOUND");
      if (c.kind !== "word") throw badRequest("這個挑戰類型不接受單字測驗交卷");
      if (c.status !== "open") throw fail("SOCIAL_CHALLENGE_ENDED", { message: "這個挑戰目前已暫停或關閉" });
      if (new Date(c.expiresAt) <= new Date()) throw fail("SOCIAL_CHALLENGE_ENDED");
      const submitFriendIds = await friendIds(user.userId);
      if (c.creatorId !== user.userId && !submitFriendIds.includes(c.creatorId)) throw forbidden("只有挑戰發起人或好友可以參加");
      const payload = c.payload as { items?: Array<Record<string, unknown>> };
      const challengeItems = payload.items ?? [];
      if (!challengeItems.length) throw badRequest("本場挑戰沒有可結算的題目");
      const answerRows = await db.select({ questionIndex: challengeAnswers.questionIndex, response: challengeAnswers.response, correct: challengeAnswers.correct }).from(challengeAnswers).where(and(eq(challengeAnswers.challengeId, c.id), eq(challengeAnswers.userId, user.userId))).orderBy(asc(challengeAnswers.questionIndex));
      if (answerRows.length !== challengeItems.length) throw badRequest("請完成並保存本場所有題目後再提交");
      const verifiedRecords = answerRows.map((answerRow) => {
        const item = challengeItems[answerRow.questionIndex];
        if (!item) throw badRequest("伺服器作答紀錄與本場題目不符");
        const expectedAnswer = String(item.challengeMode === "semantic_image" ? "語意圖片" : item.answerLabel ?? item.answer ?? "").trim();
        return { word: String(item.word ?? ""), prompt: String(item.meaning ?? item.word ?? ""), expected: expectedAnswer, response: answerRow.response, correct: answerRow.correct, timedOut: !answerRow.response.trim(), item };
      });
      await db.insert(challengeParticipants).values({ challengeId: c.id, userId: user.userId }).onConflictDoNothing();
      const rows = await db
        .update(challengeParticipants)
        .set({ score: verifiedRecords.length ? verifiedRecords.filter((record) => record.correct).length : 0, durationSec: body.durationSec, finishedAt: new Date() })
        .where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, user.userId), isNull(challengeParticipants.finishedAt)))
        .returning();
      if (!rows[0]) throw conflict("這場挑戰已完成提交，不可再次變更分數");
      for (const record of verifiedRecords) {
        const item = record.item;
        const options = Array.isArray(item?.options) ? item.options.map(String) : [];
        await db.insert(challengeQuestionHistory).values({ userId: user.userId, challengeId: c.id, questionFingerprint: challengeQuestionFingerprint(item ?? { word: record.word, meaning: record.prompt, options }), appearedDate: todayStr(), options }).onConflictDoNothing();
      }
      const settlement = await settleChallengeStake(c);
      const claimed = await db
        .update(challengeParticipants)
        .set({ rewardGranted: true })
        .where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, user.userId), eq(challengeParticipants.rewardGranted, false)))
        .returning({ id: challengeParticipants.id });
      let reward = null;
      if (claimed[0]) {
        const wrongCount = verifiedRecords.filter((record) => !record.correct && !record.timedOut).length;
        const timedOutCount = verifiedRecords.filter((record) => record.timedOut).length;
        const total = Math.max(1, verifiedRecords.length);
        const accuracy = Math.max(0, Math.min(1, (total - wrongCount - timedOutCount) / total));
        const nova = Math.max(5, Math.round(10 + accuracy * 30 - wrongCount * 2));
        const xp = Math.max(10, Math.round(20 + accuracy * 60 - wrongCount * 4));
        reward = await grantLearningReward({ userId: user.userId, nova, xp, reason: `完成挑戰：${c.title}（錯題 ${wrongCount} 題）`, idempotencyKey: `challenge:${c.id}:${user.userId}` });
        (reward as Record<string, unknown>).wrongCount = wrongCount;
        (reward as Record<string, unknown>).timedOutCount = timedOutCount;
      }
      const board = await db
        .select({ userId: challengeParticipants.userId, score: challengeParticipants.score, durationSec: challengeParticipants.durationSec, displayName: users.displayName })
        .from(challengeParticipants)
        .innerJoin(users, eq(users.userId, challengeParticipants.userId))
        .where(eq(challengeParticipants.challengeId, c.id))
        .orderBy(desc(challengeParticipants.score), asc(challengeParticipants.durationSec));
      return { participant: rows[0], leaderboard: board, reward, settlement };
    },
  }),

  /* ---------------------------------------------------- study rooms */
  route({
    method: "GET",
    path: "/rooms",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const mine = await db
        .select({ id: groups.id, name: groups.name, kind: groups.kind, joinCode: groups.joinCode, goalMinutes: groups.goalMinutes, ownerId: groups.ownerId })
        .from(groups)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(eq(groupMembers.userId, user.userId));
      const out = [];
      for (const room of mine) {
        const members = await db
          .select({ userId: users.userId, displayName: users.displayName, novaId: users.novaId, role: groupMembers.role })
          .from(groupMembers)
          .innerJoin(users, eq(users.userId, groupMembers.userId))
          .where(eq(groupMembers.groupId, room.id));
        const memberIds = members.map((m) => m.userId);
        const todayMinutes = memberIds.length
          ? await db
              .select({ userId: focusSessions.userId, minutes: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int` })
              .from(focusSessions)
              .where(and(inArray(focusSessions.userId, memberIds), sql`${focusSessions.completedAt} >= current_date`))
              .groupBy(focusSessions.userId)
          : [];
        out.push({
          ...room,
          members: members.map((m) => ({ ...m, minutesToday: todayMinutes.find((t) => t.userId === m.userId)?.minutes ?? 0 })),
          totalToday: todayMinutes.reduce((a, b) => a + b.minutes, 0),
        });
      }
      return { rooms: out };
    },
  }),

  route({
    method: "POST",
    path: "/rooms",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ name: z.string().min(1).max(40), kind: z.enum(["room", "class"]).default("room"), goalMinutes: z.number().int().min(30).max(1200).default(120) }));
      const rows = await db.insert(groups).values({ name: body.name, kind: body.kind, ownerId: user.userId, joinCode: joinCode(), goalMinutes: body.goalMinutes }).returning();
      await db.insert(groupMembers).values({ groupId: rows[0].id, userId: user.userId, role: "owner" });
      return { room: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/rooms/join",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ code: z.string().min(4).max(10) }));
      const room = (await db.select().from(groups).where(eq(groups.joinCode, body.code.toUpperCase().trim())).limit(1))[0];
      if (!room) throw fail("SOCIAL_ROOM_NOT_FOUND");
      await db.insert(groupMembers).values({ groupId: room.id, userId: user.userId }).onConflictDoNothing();
      return { room };
    },
  }),

  route({
    method: "DELETE",
    path: "/rooms/:id/leave",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, ctx.params.id), eq(groupMembers.userId, user.userId)));
      return { left: true };
    },
  }),

  /* ---------------------------------------------------- leaderboard */
  route({
    method: "GET",
    path: "/leaderboard",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const scope = ctx.query.get("scope") ?? "global";
      const from = addDaysStr(todayStr(), -6);
      let ids: string[] | null = null;
      if (scope === "friends") ids = [user.userId, ...(await friendIds(user.userId))];
      const conds = [gte(studyRecords.recordDate, from)];
      if (ids) conds.push(inArray(studyRecords.userId, ids));
      const weekly = await db
        .select({ userId: studyRecords.userId, minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int`, displayName: users.displayName, novaId: users.novaId, level: assistantProfiles.level })
        .from(studyRecords)
        .innerJoin(users, eq(users.userId, studyRecords.userId))
        .leftJoin(assistantProfiles, eq(assistantProfiles.userId, studyRecords.userId))
        .where(and(...conds))
        .groupBy(studyRecords.userId, users.displayName, users.novaId, assistantProfiles.level)
        .orderBy(desc(sql`sum(${studyRecords.minutes})`))
        .limit(20);
      const xpBoard = await db
        .select({ userId: assistantProfiles.userId, xp: assistantProfiles.xp, level: assistantProfiles.level, displayName: users.displayName, novaId: users.novaId })
        .from(assistantProfiles)
        .innerJoin(users, eq(users.userId, assistantProfiles.userId))
        .where(ids ? inArray(assistantProfiles.userId, ids) : ne(users.status, "blocked"))
        .orderBy(desc(assistantProfiles.xp))
        .limit(20);
      return { scope, weekly, xp: xpBoard, me: user.userId };
    },
  }),

  /* -------------------------------------------------------- sharing */
  route({
    method: "POST",
    path: "/shares",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          kind: z.enum(["quiz", "note", "achievement", "grades", "challenge", "plan", "weekly", "artifact", "visual_note", "tts", "vocabulary"]),
          title: z.string().min(1).max(80),
          payload: z.record(z.string(), z.unknown()).default({}),
          artifactId: z.string().uuid().nullable().optional(),
          visibility: z.enum(["private", "link", "friends", "public"]).default("link"),
        }),
      );
      if (JSON.stringify(body.payload).length > 50_000) throw badRequest("分享內容過大，請先保存到教材或筆記再分享");
      if (body.artifactId) {
        const artifact = (await db.select({ id: aiArtifacts.id, userId: aiArtifacts.userId }).from(aiArtifacts).where(eq(aiArtifacts.id, body.artifactId)).limit(1))[0];
        if (!artifact || artifact.userId !== user.userId) throw forbidden("只能分享自己的 AI 產物");
      }
      const rows = await db
        .insert(shares)
        .values({ userId: user.userId, artifactId: body.artifactId ?? null, kind: body.kind, slug: slugToken(14), title: body.title, payload: body.payload as Record<string, unknown>, visibility: body.visibility })
        .returning();
      if (rows[0]) await db.insert(shareAnalytics).values({ shareId: rows[0].id, eventType: "shareCreated", userId: user.userId, metadata: { visibility: body.visibility, kind: body.kind } });
      return { share: rows[0], url: `/s/${rows[0].slug}` };
    },
  }),

  route({
    method: "GET",
    path: "/shares",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { shares: await db.select().from(shares).where(eq(shares.userId, user.userId)).orderBy(desc(shares.createdAt)).limit(50) };
    },
  }),

  route({
    method: "DELETE",
    path: "/shares/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(shares).where(and(eq(shares.id, ctx.params.id), eq(shares.userId, user.userId)));
      return { deleted: true };
    },
  }),

  route({
    method: "GET",
    path: "/shares/public/:slug",
    auth: "optional",
    handler: async (ctx) => {
      const row = (await db.select().from(shares).where(eq(shares.slug, ctx.params.slug)).limit(1))[0];
      if (!row || !(await canViewShare(row, ctx.user?.userId ?? null))) throw fail("SOCIAL_SHARE_NOT_FOUND");
      await db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1` }).where(eq(shares.id, row.id));
      await db.insert(shareAnalytics).values({ shareId: row.id, eventType: "shareOpened", userId: ctx.user?.userId ?? null, metadata: { route: "api" } });
      const owner = (await db.select({ displayName: users.displayName, novaId: users.novaId }).from(users).where(eq(users.userId, row.userId)).limit(1))[0];
      return { share: { id: row.id, slug: row.slug, kind: row.kind, title: row.title, payload: row.payload, artifactId: row.artifactId, visibility: row.visibility, createdAt: row.createdAt }, owner };
    },
  }),

  route({
    method: "GET",
    path: "/shares/public/:slug/asset",
    auth: "optional",
    handler: async (ctx) => {
      const row = (await db.select().from(shares).where(eq(shares.slug, ctx.params.slug)).limit(1))[0];
      if (!row || !(await canViewShare(row, ctx.user?.userId ?? null))) throw fail("SOCIAL_SHARE_NOT_FOUND");
      let objectId = row.artifactId ? (await db.select({ objectId: aiArtifacts.objectId }).from(aiArtifacts).where(eq(aiArtifacts.id, row.artifactId)).limit(1))[0]?.objectId ?? null : null;
      if (!objectId && typeof row.payload.objectId === "string") objectId = row.payload.objectId;
      if (!objectId) throw notFound("這個分享沒有檔案產物");
      const owner = await objectOwner(objectId);
      if (!owner || owner.userId !== row.userId) throw forbidden("分享檔案權限不正確");
      const object = await readObject(objectId);
      await db.insert(shareAnalytics).values({ shareId: row.id, eventType: "imageDownloaded", userId: ctx.user?.userId ?? null, metadata: { mimeType: object.mimeType } });
      const cacheControl = row.visibility === "public" || row.visibility === "link" ? "public, max-age=300" : "private, no-store";
      return new Response(new Uint8Array(object.data), { headers: { "content-type": object.mimeType, "cache-control": cacheControl, "content-disposition": `inline; filename="${encodeURIComponent(object.filename)}"`, "x-content-type-options": "nosniff" } });
    },
  }),

  route({
    method: "POST",
    path: "/shares/:id/copy",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const row = (await db.select().from(shares).where(eq(shares.id, ctx.params.id)).limit(1))[0];
      if (!row || !(await canViewShare(row, user.userId))) throw fail("SOCIAL_SHARE_NOT_FOUND");
      const body = await ctx.json(z.object({ copiedKind: z.enum(["reference", "note", "material"]).default("reference") }));
      if (row.kind === "vocabulary") {
        const parsed = z.object({ words: z.array(z.object({ word: z.string().trim().min(1).max(200), meaning: z.string().max(1000).default(""), partOfSpeech: z.string().max(80).default(""), phonetic: z.string().max(160).default(""), example: z.string().max(1000).default(""), exampleZh: z.string().max(1000).default("") })).min(1).max(50) }).safeParse(row.payload);
        if (!parsed.success) throw badRequest("這個分享的單字卡格式無效或超過 50 個單字");
        const imported = await db.insert(userVocabularies).values(parsed.data.words.map((word) => ({ userId: user.userId, word: word.word, normalizedWord: word.word.toLocaleLowerCase("en-US"), meaning: word.meaning, partOfSpeech: word.partOfSpeech, phonetic: word.phonetic, example: word.example, exampleZh: word.exampleZh }))).onConflictDoNothing().returning({ id: userVocabularies.id });
        const insertedCopy = await db.insert(shareCopies).values({ shareId: row.id, userId: user.userId, copiedKind: "reference" }).onConflictDoNothing().returning();
        const copy = insertedCopy[0] ?? (await db.select().from(shareCopies).where(and(eq(shareCopies.shareId, row.id), eq(shareCopies.userId, user.userId))).limit(1))[0] ?? null;
        await db.insert(shareAnalytics).values({ shareId: row.id, eventType: "contentImported", userId: user.userId, metadata: { copiedKind: "vocabulary", added: imported.length, duplicates: parsed.data.words.length - imported.length } });
        return { copied: Boolean(insertedCopy[0]), copy, kind: "vocabulary", added: imported.length, duplicates: parsed.data.words.length - imported.length };
      }
      const inserted = await db.insert(shareCopies).values({ shareId: row.id, userId: user.userId, copiedKind: body.copiedKind }).onConflictDoNothing().returning();
      await db.insert(shareAnalytics).values({ shareId: row.id, eventType: body.copiedKind === "reference" ? "contentImported" : "shareCopied", userId: user.userId, metadata: { copiedKind: body.copiedKind } });
      return { copied: Boolean(inserted[0]), copy: inserted[0] ?? (await db.select().from(shareCopies).where(and(eq(shareCopies.shareId, row.id), eq(shareCopies.userId, user.userId))).limit(1))[0] ?? null };
    },
  }),

  route({
    method: "POST",
    path: "/shares/:id/events",
    auth: "optional",
    rate: { limit: 60, windowSec: 3600, key: "share-events" },
    handler: async (ctx) => {
      const row = (await db.select({ id: shares.id, visibility: shares.visibility, userId: shares.userId }).from(shares).where(eq(shares.id, ctx.params.id)).limit(1))[0];
      if (!row || !(await canViewShare(row as typeof shares.$inferSelect, ctx.user?.userId ?? null))) throw fail("SOCIAL_SHARE_NOT_FOUND");
      const body = await ctx.json(z.object({ eventType: z.enum(["shareOpened", "imageDownloaded", "contentImported", "favoriteAdded"]), metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}) }));
      await db.insert(shareAnalytics).values({ shareId: row.id, eventType: body.eventType, userId: ctx.user?.userId ?? null, metadata: body.metadata });
      return { recorded: true };
    },
  }),

  /* ----------------------------------------------------- activities */
  route({
    method: "GET",
    path: "/activities",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const now = new Date();
      const profile = (await db.select({ schoolName: userSettings.schoolName }).from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      const schoolName = profile?.schoolName?.trim() ?? "";
      const rows = await db
        .select()
        .from(activities)
        .where(and(eq(activities.published, true), lte(activities.startsAt, now), gte(activities.endsAt, now), or(eq(activities.accessSchoolName, ""), eq(activities.accessSchoolName, schoolName))))
        .orderBy(asc(activities.sortOrder));
      const mine = await db.select().from(activityParticipants).where(eq(activityParticipants.userId, user.userId));
      const upcoming = await db
        .select()
        .from(activities)
        .where(and(eq(activities.published, true), gte(activities.startsAt, now), or(eq(activities.accessSchoolName, ""), eq(activities.accessSchoolName, schoolName))))
        .orderBy(asc(activities.startsAt))
        .limit(5);
      return {
        live: await Promise.all(rows.map(async (a) => {
          const p = mine.find((m) => m.activityId === a.id);
          const [q] = await db.select({ count: sql<number>`count(*)::int` }).from(activityQuestions).where(and(eq(activityQuestions.activityId, a.id), eq(activityQuestions.enabled, true)));
          return { ...a, progress: p?.progress ?? 0, completedAt: p?.completedAt ?? null, questionCount: Number(q?.count ?? 0) };
        })),
        upcoming,
      };
    },
  }),

  route({
    method: "GET",
    path: "/activities/:id/questions",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const now = new Date();
      const profile = (await db.select({ schoolName: userSettings.schoolName }).from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      const activity = (await db.select({ id: activities.id, title: activities.title, startsAt: activities.startsAt, endsAt: activities.endsAt, published: activities.published, accessSchoolName: activities.accessSchoolName }).from(activities).where(eq(activities.id, ctx.params.id)).limit(1))[0];
      if (!activity || !activity.published || activity.startsAt > now || activity.endsAt < now) throw notFound("活動尚未開始或已結束");
      if (activity.accessSchoolName && activity.accessSchoolName !== (profile?.schoolName?.trim() ?? "")) throw forbidden("此活動僅開放指定學校");
      const questions = await db.select().from(activityQuestions).where(and(eq(activityQuestions.activityId, activity.id), eq(activityQuestions.enabled, true))).orderBy(asc(activityQuestions.orderIndex));
      return { activity, questions };
    },
  }),
  route({
    method: "GET",
    path: "/announcements",
    auth: "optional",
    handler: async () => {
      const now = new Date();
      let rows;
      try {
        rows = await db.select().from(announcements).where(and(eq(announcements.status, "published"), lte(announcements.startsAt, now), sql`(${announcements.endsAt} is null or ${announcements.endsAt} >= now())`)).orderBy(desc(announcements.pinned), asc(announcements.sortOrder)).limit(20);
      } catch (error) {
        console.error("[StudyNova][announcements] fallback query", error);
        rows = await db.select({ id: announcements.id, title: announcements.title, body: announcements.body, link: announcements.link, status: announcements.status, startsAt: announcements.startsAt, endsAt: announcements.endsAt, pinned: announcements.pinned, sortOrder: announcements.sortOrder }).from(announcements).where(and(eq(announcements.status, "published"), lte(announcements.startsAt, now))).orderBy(desc(announcements.pinned), asc(announcements.sortOrder)).limit(20);
      }
      return { announcements: rows };
    },
  }),

  route({
    method: "GET",
    path: "/pwa/announcements",
    auth: "optional",
    handler: async () => {
      const now = new Date();
      let rows;
      try { rows = await db.select().from(announcements).where(and(eq(announcements.status, "published"), eq(announcements.showPwa, true), eq(announcements.pinned, true), lte(announcements.startsAt, now), sql`(${announcements.endsAt} is null or ${announcements.endsAt} >= now())`)).orderBy(desc(announcements.importance), asc(announcements.sortOrder), desc(announcements.startsAt)).limit(20); }
      catch (error) { console.error("[StudyNova][pwa-announcements] fallback query", error); rows = await db.select({ id: announcements.id, title: announcements.title, body: announcements.body, link: announcements.link, status: announcements.status, startsAt: announcements.startsAt, endsAt: announcements.endsAt, pinned: announcements.pinned, sortOrder: announcements.sortOrder }).from(announcements).where(and(eq(announcements.status, "published"), eq(announcements.pinned, true), lte(announcements.startsAt, now))).orderBy(desc(announcements.sortOrder), desc(announcements.startsAt)).limit(20); }
      return { announcements: rows };
    },
  }),

  route({
    method: "GET",
    path: "/friends/suggest",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const ids = [user.userId, ...(await friendIds(user.userId))];
      const rows = await db
        .select({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, nova: novaAccounts.balance })
        .from(users)
        .leftJoin(novaAccounts, eq(novaAccounts.userId, users.userId))
        .where(and(eq(users.status, "active"), sql`${users.userId} <> all(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`)})`))
        .limit(8);
      return { suggestions: rows };
    },
  }),
];
