import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { consumeFeature } from "../economy";
import { runAiJson } from "../ai";
import { notFound } from "../core";
import { teachingBoardStates, teachingLearningSummaries, teachingMessages, teachingMaterials, teachingPreferences, teachingSessions } from "@/db/schema";
import { putObject } from "../storage";
import { extractText } from "./content-routes";
import { route, type RouteDef } from "../router";
import { moderationFooter, moderateUserContent } from "../content-moderation";

const sessionSchema = z.object({ title: z.string().trim().max(120).default("新的教學課堂"), subject: z.string().trim().max(40).default("綜合"), topic: z.string().trim().max(120).default(""), teachingMode: z.enum(["free", "concept", "socratic", "exam", "review", "debug", "quick"]).default("free") });
const messageSchema = z.object({ content: z.string().trim().min(1).max(10_000) });
const boardSchema = z.object({ theme: z.enum(["dark", "light"]).default("dark"), state: z.object({ elements: z.array(z.record(z.string(), z.unknown())).max(500) }) });
const preferenceSchema = z.object({ personality: z.enum(["normal", "humorous", "strict", "encouraging"]).optional(), answerLength: z.enum(["short", "normal", "long"]).optional(), detailLevel: z.enum(["simple", "normal", "deep"]).optional(), proactiveQuestions: z.boolean().optional(), hintFirst: z.boolean().optional() });
const fallback = { answer: "目前無法取得老師回覆，請稍後再試。", boardCommands: [], sourceRefs: [], misconception: "" };
async function ownedSession(userId: string, id: string) {
  const row = (await db.select().from(teachingSessions).where(and(eq(teachingSessions.id, id), eq(teachingSessions.userId, userId))).limit(1))[0];
  if (!row) throw notFound("找不到這個教學課堂。");
  return row;
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/teaching-room/sessions", auth: "user", handler: async ({ requireUser }) => db.select().from(teachingSessions).where(eq(teachingSessions.userId, requireUser().userId)).orderBy(desc(teachingSessions.updatedAt)).limit(100) }),
  route({ method: "POST", path: "/teaching-room/sessions", auth: "user", handler: async ({ requireUser, json }) => { const user = requireUser(); const body = await json(sessionSchema); const session = (await db.insert(teachingSessions).values({ userId: user.userId, ...body }).returning())[0]; await db.insert(teachingBoardStates).values({ sessionId: session.id, userId: user.userId, state: { elements: [] } }); return session; }}),
  route({ method: "GET", path: "/teaching-room/sessions/:id", auth: "user", handler: async ({ requireUser, params }) => { const session = await ownedSession(requireUser().userId, params.id); const [messages, board, summary] = await Promise.all([db.select().from(teachingMessages).where(eq(teachingMessages.sessionId, session.id)).orderBy(asc(teachingMessages.createdAt)), db.select().from(teachingBoardStates).where(eq(teachingBoardStates.sessionId, session.id)).limit(1), db.select().from(teachingLearningSummaries).where(eq(teachingLearningSummaries.sessionId, session.id)).limit(1)]); return { session, messages, board: board[0] ?? { state: { elements: [] }, theme: "dark" }, summary: summary[0] ?? null }; }}),
  route({ method: "POST", path: "/teaching-room/sessions/:id/materials", auth: "user", rate: { limit: 10, windowSec: 3600 }, handler: async ({ requireUser, params, formData }) => { const user = requireUser(); await ownedSession(user.userId, params.id); const form = await formData(); const file = form.get("file"); if (!(file instanceof File)) throw new Error("請選擇教材檔案。"); const mime = (file.type || "application/octet-stream").split(";")[0].toLowerCase(); const stored = await putObject({ userId: user.userId, filename: file.name.slice(0, 180), mimeType: mime, data: Buffer.from(await file.arrayBuffer()), allow: ["image", "pdf", "text"] }); let extractedText = ""; try { extractedText = await extractText(mime, Buffer.from(await file.arrayBuffer()), user.userId, "綜合"); } catch { extractedText = ""; } const material = (await db.insert(teachingMaterials).values({ sessionId: params.id, userId: user.userId, fileName: file.name.slice(0, 180), mimeType: mime, extractedText, status: extractedText ? "ready" : "uploaded" }).returning())[0]; return { material, objectId: stored.id }; }}),
  route({ method: "POST", path: "/teaching-room/sessions/:id/messages", auth: "user", rate: { limit: 30, windowSec: 3600 }, handler: async ({ requireUser, params, json }) => {
    const user = requireUser(); const session = await ownedSession(user.userId, params.id); const body = await json(messageSchema); await moderateUserContent({ userId: user.userId, content: body.content, channel: "teaching_room", sourceId: session.id }); await consumeFeature(user.userId, "learning_ai_chat", 1);
    await db.insert(teachingMessages).values({ sessionId: session.id, userId: user.userId, role: "user", content: body.content });
    const prefs = (await db.select().from(teachingPreferences).where(eq(teachingPreferences.userId, user.userId)).limit(1))[0];
    const recent = await db.select({ role: teachingMessages.role, content: teachingMessages.content }).from(teachingMessages).where(eq(teachingMessages.sessionId, session.id)).orderBy(desc(teachingMessages.createdAt)).limit(12);
    const { data, meta } = await runAiJson<typeof fallback>({ feature: "teaching_room_chat", userId: user.userId, providerOverride: "nvidia", json: true, maxOutputTokens: 2600, temperature: 0.45, system: `你是 StudyNova「有教無類」AI 老師。科目：${session.subject}；主題：${session.topic || "未指定"}；教學模式：${session.teachingMode}；老師個性：${prefs?.personality ?? "normal"}；回答長度：${prefs?.answerLength ?? "normal"}；詳細程度：${prefs?.detailLevel ?? "normal"}。請以繁體中文教學，遇到英文、公式或程式碼保留原文。先理解學生，再用分段、例子、反問或提示引導；不要捏造教材來源。只輸出 JSON：{answer:string,boardCommands:[{type:"text"|"formula"|"line"|"clear",text?:string,x?:number,y?:number,x2?:number,y2?:number}],sourceRefs:string[],misconception:string}.`, parts: [{ kind: "text", text: recent.reverse().map((m) => `${m.role === "user" ? "學生" : "老師"}：${m.content}`).join("\n") + `\n學生最新問題：${body.content}` }] }, fallback);
    const answer = `${data?.answer || fallback.answer}${moderationFooter()}`; const commands = Array.isArray(data?.boardCommands) ? data.boardCommands : []; const sourceRefs = Array.isArray(data?.sourceRefs) ? data.sourceRefs.map(String) : [];
    const message = (await db.insert(teachingMessages).values({ sessionId: session.id, userId: user.userId, role: "assistant", content: answer, boardCommands: commands, sourceRefs }).returning())[0];
    await db.update(teachingSessions).set({ updatedAt: new Date() }).where(eq(teachingSessions.id, session.id));
    if (data?.misconception) await db.insert(teachingLearningSummaries).values({ sessionId: session.id, userId: user.userId, summary: `最近觀念提醒：${data.misconception}`, misconceptions: [data.misconception] }).onConflictDoUpdate({ target: teachingLearningSummaries.sessionId, set: { summary: `最近觀念提醒：${data.misconception}`, misconceptions: [data.misconception], updatedAt: new Date() } });
    return { message, provider: meta.provider, model: meta.model };
  }}),
  route({ method: "PUT", path: "/teaching-room/sessions/:id/board", auth: "user", handler: async ({ requireUser, params, json }) => { const user = requireUser(); await ownedSession(user.userId, params.id); const body = await json(boardSchema); const row = (await db.insert(teachingBoardStates).values({ sessionId: params.id, userId: user.userId, theme: body.theme, state: body.state }).onConflictDoUpdate({ target: teachingBoardStates.sessionId, set: { theme: body.theme, state: body.state, updatedAt: new Date() } }).returning())[0]; return row; }}),
  route({ method: "PATCH", path: "/teaching-room/preferences", auth: "user", handler: async ({ requireUser, json }) => { const user = requireUser(); const body = await json(preferenceSchema); return (await db.insert(teachingPreferences).values({ userId: user.userId, ...body }).onConflictDoUpdate({ target: teachingPreferences.userId, set: { ...body, updatedAt: new Date() } }).returning())[0]; }}),
];
