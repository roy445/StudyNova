import { z } from "zod";
import { and, desc, eq, inArray, ne, or, sql, gte, lte, asc } from "drizzle-orm";
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
  quizzes,
  weeklyExamWeeks,
  novaAccounts,
  announcements,
  dailyWords,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, forbidden, joinCode, notFound, slugToken, todayStr, addDaysStr } from "../core";
import { grantLearningReward } from "../economy";
import { notify } from "../notify";

async function friendIds(userId: string) {
  const rows = await db.select({ friendId: friends.friendId }).from(friends).where(eq(friends.userId, userId));
  return rows.map((r) => r.friendId);
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
            .select({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, level: assistantProfiles.level, xp: assistantProfiles.xp })
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
          expiresAt: challenges.expiresAt,
          createdAt: challenges.createdAt,
        })
        .from(challenges)
        .innerJoin(users, eq(users.userId, challenges.creatorId))
        .where(and(inArray(challenges.creatorId, scope), gte(challenges.expiresAt, new Date())))
        .orderBy(desc(challenges.createdAt))
        .limit(30);
      const out = [];
      for (const c of rows) {
        const parts = await db
          .select({ userId: challengeParticipants.userId, score: challengeParticipants.score, durationSec: challengeParticipants.durationSec, finishedAt: challengeParticipants.finishedAt, displayName: users.displayName, novaId: users.novaId })
          .from(challengeParticipants)
          .innerJoin(users, eq(users.userId, challengeParticipants.userId))
          .where(eq(challengeParticipants.challengeId, c.id))
          .orderBy(desc(challengeParticipants.score), asc(challengeParticipants.durationSec));
        out.push({ ...c, participants: parts, joined: parts.some((p) => p.userId === user.userId) });
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
        }),
      );
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
        // 題目在建立挑戰時一次抽好並寫入 payload，所有參與者讀到完全相同的題目。
        // 每一題的選項也預先洗牌，且同一輪不重複使用選項文字。
        const pool = await db
          .select({ id: dailyWords.id, word: dailyWords.word, meaning: dailyWords.meaning, partOfSpeech: dailyWords.partOfSpeech, example: dailyWords.example, exampleZh: dailyWords.exampleZh, level: dailyWords.level })
          .from(dailyWords)
          .where(eq(dailyWords.level, body.track))
          .orderBy(sql`random()`)
          .limit(Math.min(800, count * 4));
        for (let i = 0; i < Math.min(count, Math.floor(pool.length / 4)); i += 1) {
          const group = pool.slice(i * 4, i * 4 + 4);
          const direction = body.direction === "mixed" ? (i % 2 === 0 ? "zh2en" : "en2zh") : body.direction;
          const answer = direction === "zh2en" ? group[0].word : group[0].meaning;
          const options = group.map((item) => direction === "zh2en" ? item.word : item.meaning).filter(Boolean);
          const shuffled = [...options].sort(() => Math.random() - 0.5);
          challengeItems.push({ ...group[0], direction, options: shuffled, answer });
        }
        if (challengeItems.length < 5) throw badRequest("目前題庫不足，請稍後再試");
      }
      const rows = await db
        .insert(challenges)
        .values({
          creatorId: user.userId,
          kind: body.kind,
          title: body.title,
          quizId: body.quizId ?? null,
          payload: body.kind === "weekly" ? { weekId: body.weekId } : body.kind === "word" ? {
            track: body.track,
            questionCount: body.questionCount,
            direction: body.direction,
            difficulty: body.difficulty,
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
      return { challenge: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/challenges/:id/words",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const challenge = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!challenge) throw notFound("找不到挑戰");
      const ids = await friendIds(user.userId);
      if (challenge.creatorId !== user.userId && !ids.includes(challenge.creatorId)) throw forbidden("只有挑戰發起人或好友可以參加");
      if (challenge.kind !== "word") throw badRequest("這不是單字挑戰");
      const payload = challenge.payload as { track?: "junior" | "senior"; questionCount?: number; difficulty?: string; direction?: string; items?: Array<Record<string, unknown>>; readyUserIds?: string[] };
      const track = payload.track === "senior" ? "senior" : "junior";
      const count = Math.max(5, Math.min(200, Number(payload.questionCount ?? 10)));
      const rows = payload.items?.length ? payload.items.slice(0, count) : await db.select({ id: dailyWords.id, word: dailyWords.word, meaning: dailyWords.meaning, partOfSpeech: dailyWords.partOfSpeech, example: dailyWords.example, exampleZh: dailyWords.exampleZh, level: dailyWords.level }).from(dailyWords).where(eq(dailyWords.level, track)).orderBy(sql`random()`).limit(count);
      return { challengeId: challenge.id, title: challenge.title, expiresAt: challenge.expiresAt, readyCount: payload.readyUserIds?.length ?? 0, ready: (payload.readyUserIds ?? []).includes(user.userId), settings: { track, count, direction: payload.direction ?? "mixed", difficulty: payload.difficulty ?? "normal" }, words: rows };
    },
  }),

  route({
    method: "POST",
    path: "/challenges/:id/ready",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const challenge = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!challenge || challenge.kind !== "word") throw notFound("找不到單字挑戰");
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
    path: "/challenges/:id/submit",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ score: z.number().int().min(0).max(10000), durationSec: z.number().int().min(0).max(36000) }));
      const c = (await db.select().from(challenges).where(eq(challenges.id, ctx.params.id)).limit(1))[0];
      if (!c) throw notFound("找不到挑戰");
      if (new Date(c.expiresAt) < new Date()) throw fail("SOCIAL_CHALLENGE_ENDED");
      await db.insert(challengeParticipants).values({ challengeId: c.id, userId: user.userId }).onConflictDoNothing();
      const rows = await db
        .update(challengeParticipants)
        .set({ score: body.score, durationSec: body.durationSec, finishedAt: new Date() })
        .where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, user.userId)))
        .returning();
      const claimed = await db
        .update(challengeParticipants)
        .set({ rewardGranted: true })
        .where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, user.userId), eq(challengeParticipants.rewardGranted, false)))
        .returning({ id: challengeParticipants.id });
      let reward = null;
      if (claimed[0]) {
        reward = await grantLearningReward({ userId: user.userId, nova: 15, xp: 30, reason: `完成挑戰：${c.title}`, idempotencyKey: `challenge:${c.id}:${user.userId}` });
      }
      const board = await db
        .select({ userId: challengeParticipants.userId, score: challengeParticipants.score, durationSec: challengeParticipants.durationSec, displayName: users.displayName })
        .from(challengeParticipants)
        .innerJoin(users, eq(users.userId, challengeParticipants.userId))
        .where(eq(challengeParticipants.challengeId, c.id))
        .orderBy(desc(challengeParticipants.score), asc(challengeParticipants.durationSec));
      return { participant: rows[0], leaderboard: board, reward };
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
          kind: z.enum(["quiz", "note", "achievement", "grades", "challenge", "plan", "weekly"]),
          title: z.string().min(1).max(80),
          payload: z.record(z.string(), z.unknown()).default({}),
          visibility: z.enum(["link", "friends", "public"]).default("link"),
        }),
      );
      const rows = await db
        .insert(shares)
        .values({ userId: user.userId, kind: body.kind, slug: slugToken(14), title: body.title, payload: body.payload as Record<string, unknown>, visibility: body.visibility })
        .returning();
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
    auth: "none",
    handler: async (ctx) => {
      const row = (await db.select().from(shares).where(eq(shares.slug, ctx.params.slug)).limit(1))[0];
      if (!row) throw fail("SOCIAL_SHARE_NOT_FOUND");
      await db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1` }).where(eq(shares.id, row.id));
      const owner = (await db.select({ displayName: users.displayName, novaId: users.novaId }).from(users).where(eq(users.userId, row.userId)).limit(1))[0];
      return { share: { kind: row.kind, title: row.title, payload: row.payload, createdAt: row.createdAt }, owner };
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
      const rows = await db
        .select()
        .from(activities)
        .where(and(eq(activities.published, true), lte(activities.startsAt, now), gte(activities.endsAt, now)))
        .orderBy(asc(activities.sortOrder));
      const mine = await db.select().from(activityParticipants).where(eq(activityParticipants.userId, user.userId));
      const upcoming = await db
        .select()
        .from(activities)
        .where(and(eq(activities.published, true), gte(activities.startsAt, now)))
        .orderBy(asc(activities.startsAt))
        .limit(5);
      return {
        live: rows.map((a) => {
          const p = mine.find((m) => m.activityId === a.id);
          return { ...a, progress: p?.progress ?? 0, completedAt: p?.completedAt ?? null };
        }),
        upcoming,
      };
    },
  }),

  route({
    method: "GET",
    path: "/announcements",
    auth: "optional",
    handler: async () => {
      const now = new Date();
      const rows = await db
        .select()
        .from(announcements)
        .where(and(lte(announcements.startsAt, now), sql`(${announcements.endsAt} is null or ${announcements.endsAt} >= now())`))
        .orderBy(desc(announcements.pinned), asc(announcements.sortOrder))
        .limit(20);
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
