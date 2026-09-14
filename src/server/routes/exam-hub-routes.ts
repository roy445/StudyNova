import { and, asc, desc, eq, inArray, isNull, lte, or, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcements, examHubAttempts, examHubs, examHubWordProgress, examHubWords, userSettings } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";

const openWindow = and(eq(examHubs.status, "published"), or(isNull(examHubs.openAt), lte(examHubs.openAt, new Date())), or(isNull(examHubs.closeAt), gt(examHubs.closeAt, new Date())));
const wordInput = z.object({ word: z.string().trim().min(1).max(200), meaning: z.string().max(1000).default(""), partOfSpeech: z.string().max(80).default(""), synonyms: z.array(z.string().max(100)).max(30).default([]), antonyms: z.array(z.string().max(100)).max(30).default([]), collocations: z.array(z.string().max(200)).max(30).default([]), phrases: z.array(z.string().max(200)).max(30).default([]), example: z.string().max(1000).default(""), exampleZh: z.string().max(1000).default(""), phonetic: z.string().max(160).default(""), audioUrl: z.string().max(500).default(""), published: z.boolean().default(true) });

async function matchingUserHubs(userId: string) {
  const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  if (!settings) return { settings: null, hubs: [] };
  const hubs = await db.select().from(examHubs).where(and(openWindow, eq(examHubs.educationLevel, settings.schoolLevel), eq(examHubs.grade, settings.grade), or(eq(examHubs.schoolName, ""), eq(examHubs.schoolName, settings.schoolName)))).orderBy(asc(examHubs.openAt), desc(examHubs.createdAt));
  return { settings, hubs };
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/exam-hubs/available", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const result = await matchingUserHubs(user.userId);
    return { hubs: result.hubs, profileComplete: Boolean(result.settings?.schoolLevel && result.settings.schoolName && result.settings.grade), needsProfile: !result.settings?.schoolName };
  }}),
  route({ method: "GET", path: "/exam-hubs/:id", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const result = await matchingUserHubs(user.userId); const hub = result.hubs.find((item) => item.id === ctx.params.id);
    if (!hub) throw notFound("找不到目前開放的段考專區");
    const words = await db.select().from(examHubWords).where(and(eq(examHubWords.hubId, hub.id), eq(examHubWords.published, true))).orderBy(asc(examHubWords.word));
    const progress = words.length ? await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.userId, user.userId), inArray(examHubWordProgress.hubWordId, words.map((word) => word.id)))) : [];
    const progressMap = new Map(progress.map((item) => [item.hubWordId, item]));
    return { hub, words: words.map((word) => ({ ...word, progress: progressMap.get(word.id) ?? { familiarity: 0, wrongCount: 0, reviewCount: 0, lastReviewedAt: null } })) };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/word-progress", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ wordId: z.string().uuid(), result: z.enum(["known", "unknown", "later"]) }));
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id); if (!hub) throw notFound("找不到段考專區");
    const current = (await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.hubWordId, body.wordId), eq(examHubWordProgress.userId, user.userId))).limit(1))[0];
    const delta = body.result === "known" ? 20 : body.result === "unknown" ? -10 : 0;
    const values = { hubWordId: body.wordId, userId: user.userId, familiarity: Math.max(0, Math.min(100, (current?.familiarity ?? 0) + delta)), wrongCount: (current?.wrongCount ?? 0) + (body.result === "unknown" ? 1 : 0), reviewCount: (current?.reviewCount ?? 0) + 1, lastReviewedAt: new Date(), updatedAt: new Date() };
    const row = current ? (await db.update(examHubWordProgress).set(values).where(eq(examHubWordProgress.id, current.id)).returning())[0] : (await db.insert(examHubWordProgress).values(values).returning())[0];
    return { progress: row };
  }}),
  route({ method: "POST", path: "/exam-hubs/:id/attempt", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ mode: z.enum(["choice", "fill"]), direction: z.enum(["en2zh", "zh2en"]), responses: z.record(z.string(), z.string()) }));
    const hub = (await matchingUserHubs(user.userId)).hubs.find((item) => item.id === ctx.params.id); if (!hub) throw notFound("找不到段考專區");
    const words = await db.select().from(examHubWords).where(and(eq(examHubWords.hubId, hub.id), eq(examHubWords.published, true)));
    const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[，。！？、,.!?]/g, "").replace(/\s+/g, " ");
    let score = 0; const wrongWordIds: string[] = [];
    for (const word of words) { const expected = body.direction === "en2zh" ? word.meaning : word.word; const answer = body.responses[word.id] ?? ""; const correct = body.mode === "choice" ? normalize(answer) === normalize(expected) : normalize(answer) === normalize(expected) || normalize(answer).includes(normalize(expected)); if (correct) score += 1; else wrongWordIds.push(word.id); }
    const attempt = (await db.insert(examHubAttempts).values({ hubId: hub.id, userId: user.userId, mode: body.mode, direction: body.direction, score, total: words.length, responses: body.responses, wrongWordIds }).returning())[0];
    for (const word of words) { const wrong = wrongWordIds.includes(word.id); const current = (await db.select().from(examHubWordProgress).where(and(eq(examHubWordProgress.hubWordId, word.id), eq(examHubWordProgress.userId, user.userId))).limit(1))[0]; const values = { hubWordId: word.id, userId: user.userId, familiarity: Math.max(0, Math.min(100, (current?.familiarity ?? 0) + (wrong ? -10 : 15))), wrongCount: (current?.wrongCount ?? 0) + (wrong ? 1 : 0), reviewCount: (current?.reviewCount ?? 0) + 1, lastReviewedAt: new Date(), updatedAt: new Date() }; if (current) await db.update(examHubWordProgress).set(values).where(eq(examHubWordProgress.id, current.id)); else await db.insert(examHubWordProgress).values(values); }
    return { attempt, score, total: words.length, wrongWordIds };
  }}),
  route({ method: "GET", path: "/admin/exam-hubs", auth: "admin", handler: async () => ({ hubs: await db.select().from(examHubs).orderBy(desc(examHubs.createdAt)) }) }),
  route({ method: "POST", path: "/admin/exam-hubs", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const body = await ctx.json(z.object({ name: z.string().min(1).max(120), educationLevel: z.enum(["junior", "senior"]), schoolName: z.string().max(120).default(""), grade: z.number().int().min(1).max(3), examNumber: z.string().min(1).max(40), openAt: z.string().datetime().nullable().optional(), closeAt: z.string().datetime().nullable().optional(), status: z.enum(["draft", "published", "closed"]).default("draft"), announcement: z.string().max(2000).default(""), showMarquee: z.boolean().default(false) })); const row = (await db.insert(examHubs).values({ ...body, openAt: body.openAt ? new Date(body.openAt) : null, closeAt: body.closeAt ? new Date(body.closeAt) : null, createdBy: admin.userId }).returning())[0]; if (body.showMarquee) await db.insert(announcements).values({ title: "📢 段考專區已開放", body: body.announcement || `${body.name} 已開放，現在可以開始複習英文單字。`, audience: "all", audienceIds: [], pinned: false, marquee: true, notify: true, push: false, sortOrder: 0, startsAt: body.openAt ? new Date(body.openAt) : new Date(), endsAt: body.closeAt ? new Date(body.closeAt) : null, createdBy: admin.userId, link: `/exam-hubs/${row.id}`, targetFeature: "dashboard" }).catch(() => undefined); return { hub: row }; } }),
  route({ method: "PATCH", path: "/admin/exam-hubs/:id", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ name: z.string().min(1).max(120).optional(), status: z.enum(["draft", "published", "closed"]).optional(), openAt: z.string().datetime().nullable().optional(), closeAt: z.string().datetime().nullable().optional(), announcement: z.string().max(2000).optional(), showMarquee: z.boolean().optional() })); const { openAt, closeAt, ...patch } = body; const row = (await db.update(examHubs).set({ ...patch, ...(openAt !== undefined ? { openAt: openAt ? new Date(openAt) : null } : {}), ...(closeAt !== undefined ? { closeAt: closeAt ? new Date(closeAt) : null } : {}), updatedAt: new Date() }).where(eq(examHubs.id, ctx.params.id)).returning())[0]; if (!row) throw notFound("找不到段考專區"); return { hub: row }; } }),
  route({ method: "GET", path: "/admin/exam-hubs/:id/words", auth: "admin", handler: async (ctx) => ({ words: await db.select().from(examHubWords).where(eq(examHubWords.hubId, ctx.params.id)).orderBy(asc(examHubWords.word)) }) }),
  route({ method: "POST", path: "/admin/exam-hubs/:id/words", auth: "admin", handler: async (ctx) => { const body = await ctx.json(z.object({ words: z.array(wordInput).min(1).max(1000) })); const rows = await db.insert(examHubWords).values(body.words.map((word) => ({ ...word, hubId: ctx.params.id, normalizedWord: word.word.toLocaleLowerCase("en-US") }))).onConflictDoNothing().returning(); return { words: rows, added: rows.length }; } }),
  route({ method: "DELETE", path: "/admin/exam-hubs/:hubId/words/:id", auth: "admin", handler: async (ctx) => { await db.delete(examHubWords).where(and(eq(examHubWords.id, ctx.params.id), eq(examHubWords.hubId, ctx.params.hubId))); return { deleted: true }; } }),
];
