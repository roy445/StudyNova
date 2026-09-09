import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { analysisScopes, aiModes, fileContexts, solutionSessions } from "@/db/schema";
import { fail } from "./core";
import { consumeFeature, featureState, grantNova } from "./economy";
import { AI_SOLUTION_FEATURE } from "./quota-policy";
import { readObject } from "./storage";
import { runAiJson } from "./ai";
import { subjectStrategy } from "./subject-strategies";

export const SEGMENT_KINDS = ["QUESTION", "HANDWRITING", "NOTE", "HIGHLIGHT", "UNKNOWN"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export type Segment = { kind: SegmentKind; text: string; confidence: number; box?: number[] };
export type Scope = { includeQuestion: boolean; includeHandwriting: boolean; includeNote: boolean; highlightPriority: boolean; questionColor?: string; sentenceColor?: string; keywordColor?: string };

const DEFAULT_SCOPE: Scope = { includeQuestion: true, includeHandwriting: true, includeNote: true, highlightPriority: false };

export async function createFileContext(params: { userId: string; objectId: string; originalName: string; batch: number; scope?: Partial<Scope>; subject?: string }) {
  const object = await readObject(params.objectId);
  if (object.userId !== params.userId) throw fail("PERM_FILE_DENIED");
  const sha256 = createHash("sha256").update(object.data).digest("hex");
  const duplicate = (await db.select().from(fileContexts).where(and(eq(fileContexts.userId, params.userId), eq(fileContexts.sha256, sha256))).limit(1))[0];
  // A ready or currently-running hash is safely reusable. A previous failed
  // attempt must be allowed to retry; otherwise the UI reports "duplicate"
  // forever even though no usable analysis exists.
  if (duplicate && duplicate.status !== "failed") return { context: duplicate, duplicate: true };
  const scope = { ...DEFAULT_SCOPE, ...params.scope };
  const inserted = await db.insert(fileContexts).values({ userId: params.userId, objectId: params.objectId, originalName: params.originalName.slice(0, 180), uploadBatch: params.batch, sha256, status: "analyzing" }).returning();
  const context = inserted[0];
  await db.insert(analysisScopes).values({ fileContextId: context.id, ...scope }).onConflictDoUpdate({ target: analysisScopes.fileContextId, set: scope });
  try {
    const { data } = await runAiJson<{ segments?: Segment[]; readable?: boolean; multipleQuestions?: boolean; message?: string }>(
      {
        feature: "ai_solution_segment",
        userId: params.userId,
        system: `你是 StudyNova 的全科影像內容分段器。${subjectStrategy(params.subject)}請辨識圖片內每個區塊並只回傳 JSON。kind 只能是 QUESTION、HANDWRITING、NOTE、HIGHLIGHT、UNKNOWN。不要猜測看不清楚的文字；readable=false 時 message 必須是請拍攝的清楚一點。若有兩個以上獨立題目，multipleQuestions=true。`,
        parts: [{ kind: object.mimeType.startsWith("image/") ? "image" : "text", ...(object.mimeType.startsWith("image/") ? { mimeType: object.mimeType, base64: object.data.toString("base64") } : { text: object.data.toString("utf8").slice(0, 30000) }) } as never],
        maxOutputTokens: 3000,
      },
      { segments: [], readable: true, multipleQuestions: false },
    );
    const segments = (data.segments ?? []).filter((s) => SEGMENT_KINDS.includes(s.kind as SegmentKind)).map((s) => ({ kind: s.kind as SegmentKind, text: String(s.text ?? "").slice(0, 12000), confidence: Math.max(0, Math.min(1, Number(s.confidence ?? 0))), box: s.box }));
    const rows = await db.update(fileContexts).set({ status: "ready", detected: segments, error: data.readable === false ? String(data.message || "請拍攝的清楚一點") : "", updatedAt: new Date() }).where(eq(fileContexts.id, context.id)).returning();
    return { context: rows[0], duplicate: false, readable: data.readable !== false, multipleQuestions: Boolean(data.multipleQuestions) };
  } catch (error) {
    await db.update(fileContexts).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "分析失敗", updatedAt: new Date() }).where(eq(fileContexts.id, context.id));
    throw error;
  }
}

export async function resolveMode(userId: string, sessionId: string, requested: string | undefined, segments: Segment[]) {
  const current = (await db.select().from(aiModes).where(and(eq(aiModes.userId, userId), eq(aiModes.solutionSessionId, sessionId))).limit(1))[0];
  if (current?.locked) return current;
  const hasQuestion = segments.some((s) => s.kind === "QUESTION");
  const hasNote = segments.some((s) => s.kind === "NOTE");
  const mode = requested === "tutor" || requested === "solution" || requested === "note" ? requested : hasQuestion ? "solution" : hasNote ? "note" : "tutor";
  const reason = requested ? "使用者指定模式" : hasQuestion ? "偵測到題目" : hasNote ? "偵測到筆記" : "一般學習對話";
  const rows = await db.insert(aiModes).values({ userId, solutionSessionId: sessionId, mode, source: requested ? "manual" : "router", locked: !requested, reason }).returning();
  return rows[0];
}

export async function analyzeSolution(params: { userId: string; contextIds: string[]; requestedMode?: string; scope?: Partial<Scope>; idempotencyKey?: string }) {
  if (!params.contextIds.length) throw fail("REQ_CONTENT_TOO_SHORT", { message: "請先上傳圖片或檔案" });
  const contexts = await db.select().from(fileContexts).where(and(eq(fileContexts.userId, params.userId), inArray(fileContexts.id, params.contextIds)));
  if (!contexts.length) throw fail("FILE_NOT_FOUND");

  const scope: Scope = { ...DEFAULT_SCOPE, ...(params.scope ?? {}) };
  const idempotencyKey = params.idempotencyKey?.trim().slice(0, 160) || createHash("sha256").update(JSON.stringify({ contexts: [...params.contextIds].sort(), mode: params.requestedMode ?? "", scope })).digest("hex");
  const existing = (await db.select().from(solutionSessions).where(and(eq(solutionSessions.userId, params.userId), eq(solutionSessions.idempotencyKey, idempotencyKey))).limit(1))[0];
  if (existing?.status === "completed") return { session: existing, result: existing.result ?? {} };
  if (existing?.status === "processing") throw fail("SYS_CONFLICT", { message: "這筆 AI 解題正在分析中，請稍候。" });

  // Preflight checks only. No usage row or Nova transaction is written here.
  const costState = await featureState(params.userId, AI_SOLUTION_FEATURE);
  if (!costState.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: `「${costState.label}」目前已停用` });
  if (!costState.unlimited && costState.limit <= 0) throw fail("QUOTA_NOT_IN_PLAN", { message: `「${costState.label}」在你目前的方案中未開放` });
  if (costState.monthlyLimit > 0 && costState.monthlyUsed >= costState.monthlyLimit) throw fail("QUOTA_EXHAUSTED", { message: `本月「${costState.label}」已達上限` });
  if (!costState.unlimited && costState.used >= costState.limit) throw fail("QUOTA_EXHAUSTED", { message: `今日「${costState.label}」已達上限` });

  const session = existing
    ? (await db.update(solutionSessions).set({ status: "processing", error: "", result: null, updatedAt: new Date() }).where(eq(solutionSessions.id, existing.id)).returning())[0]
    : (await db.insert(solutionSessions).values({ userId: params.userId, fileContextIds: contexts.map((x) => x.id), novaCost: costState.novaCost, charged: false, idempotencyKey, status: "processing" }).returning())[0];
  let charged = false;
  try {
    const segments = contexts.flatMap((c) => (Array.isArray(c.detected) ? c.detected : []) as Segment[]).filter((s) => (s.kind === "QUESTION" && scope.includeQuestion) || (s.kind === "HANDWRITING" && scope.includeHandwriting) || (s.kind === "NOTE" && scope.includeNote) || (s.kind === "HIGHLIGHT" && scope.highlightPriority));
    const mode = await resolveMode(params.userId, session.id, params.requestedMode, segments);
    const source = segments.map((s) => `[${s.kind}] ${s.text}`).join("\n");
    const { data } = await runAiJson<{ reply?: string; hint?: string; steps?: string[]; answer?: string; needsCrop?: boolean }>(
      { feature: AI_SOLUTION_FEATURE, userId: params.userId, system: `你是 StudyNova Novi。模式是 ${mode.mode}。預設採用引導解題：先給提示與步驟，不直接揭露答案；只有使用者明確要求且政策允許時才提供答案。若偵測多題，needsCrop=true 並請使用者裁切成單題。`, parts: [{ kind: "text", text: `分析範圍：${JSON.stringify(scope)}\n內容：\n${source.slice(0, 30000)}` }], maxOutputTokens: 2600 },
      { reply: "目前無法產生解析。", hint: "請先確認圖片內容清楚。", steps: [], needsCrop: false },
    );
    // The provider succeeded; only now atomically record quota/Nova consumption.
    const settled = await consumeFeature(params.userId, AI_SOLUTION_FEATURE, 1, `solution:${session.id}`);
    charged = settled.novaCost > 0;
    const result = { ...data, mode: mode.mode, modeLocked: mode.locked, segmentsUsed: segments.length };
    const updated = await db.update(solutionSessions).set({ status: "completed", result, novaCost: settled.novaCost, charged, updatedAt: new Date() }).where(eq(solutionSessions.id, session.id)).returning();
    return { session: updated[0], result };
  } catch (error) {
    if (charged) await grantNova({ userId: params.userId, amount: costState.novaCost, reason: "AI 解題結算失敗退款", source: "ai_refund", idempotencyKey: `ai-refund:${session.id}` });
    const updated = await db.update(solutionSessions).set({ status: "failed", charged: false, error: error instanceof Error ? error.message.slice(0, 500) : "分析失敗", updatedAt: new Date() }).where(eq(solutionSessions.id, session.id)).returning();
    throw error;
  }
}
