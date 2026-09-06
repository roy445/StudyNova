import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { essayGradingJobs, featurePermissions, featureUsage, platformSettings } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, notFound, randomToken } from "../core";
import { runAiJson, aiConfigured } from "../ai";
import { consumeFeature, featureState, isProUser } from "../economy";
import { putObject, readObject } from "../storage";

const DEFAULT_SERVICE = {
  status: "ENABLED" as "ENABLED" | "PAUSED" | "DISABLED",
  proOnly: false,
  novaCost: 10,
  dailyLimit: 1,
  monthlyLimit: 30,
  maintenanceNotice: "",
  showScores: true,
};

type EssayResult = {
  ocrText?: string;
  overallFeedback?: string;
  corrections?: Array<{ category: string; original: string; suggestion: string; reason: string; explanation?: string }>;
  spelling?: Array<{ original: string; suggestion: string; reason: string }>;
  scores?: { grammar?: number; vocabulary?: number; spelling?: number; organization?: number; coherence?: number; taskAchievement?: number; overall?: number };
  structure?: { introduction?: string; body?: string; conclusion?: string };
};

async function serviceConfig() {
  const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, "essay_grading_service")).limit(1);
  const value = rows[0]?.value ?? {};
  return {
    ...DEFAULT_SERVICE,
    ...value,
    status: value.status === "PAUSED" || value.status === "DISABLED" ? value.status : "ENABLED",
    proOnly: Boolean(value.proOnly),
    novaCost: Math.max(0, Number(value.novaCost ?? DEFAULT_SERVICE.novaCost)),
    dailyLimit: Number(value.dailyLimit ?? DEFAULT_SERVICE.dailyLimit),
    monthlyLimit: Number(value.monthlyLimit ?? DEFAULT_SERVICE.monthlyLimit),
    maintenanceNotice: String(value.maintenanceNotice ?? ""),
    showScores: value.showScores !== false,
  };
}

function normalizeResult(value: EssayResult): EssayResult {
  return {
    ocrText: String(value.ocrText ?? "").slice(0, 30000),
    overallFeedback: String(value.overallFeedback ?? "").slice(0, 5000),
    corrections: Array.isArray(value.corrections) ? value.corrections.slice(0, 100).map((item) => ({
      category: String(item.category ?? "Grammar").slice(0, 40),
      original: String(item.original ?? "").slice(0, 1000),
      suggestion: String(item.suggestion ?? "").slice(0, 1000),
      reason: String(item.reason ?? "").slice(0, 1500),
      explanation: item.explanation ? String(item.explanation).slice(0, 1500) : undefined,
    })) : [],
    spelling: Array.isArray(value.spelling) ? value.spelling.slice(0, 100).map((item) => ({ original: String(item.original ?? ""), suggestion: String(item.suggestion ?? ""), reason: String(item.reason ?? "") })) : [],
    scores: value.scores ? {
      grammar: Number(value.scores.grammar ?? 0), vocabulary: Number(value.scores.vocabulary ?? 0), spelling: Number(value.scores.spelling ?? 0),
      organization: Number(value.scores.organization ?? 0), coherence: Number(value.scores.coherence ?? 0), taskAchievement: Number(value.scores.taskAchievement ?? 0), overall: Number(value.scores.overall ?? 0),
    } : undefined,
    structure: value.structure ? { introduction: String(value.structure.introduction ?? ""), body: String(value.structure.body ?? ""), conclusion: String(value.structure.conclusion ?? "") } : undefined,
  };
}

function dayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function monthStart() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/essay/gradings",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select({ id: essayGradingJobs.id, status: essayGradingJobs.status, originalText: essayGradingJobs.originalText, ocrText: essayGradingJobs.ocrText, result: essayGradingJobs.result, errorMessage: essayGradingJobs.errorMessage, createdAt: essayGradingJobs.createdAt, completedAt: essayGradingJobs.completedAt }).from(essayGradingJobs).where(eq(essayGradingJobs.userId, user.userId)).orderBy(desc(essayGradingJobs.createdAt)).limit(50);
      return { gradings: rows.map((row) => ({ ...row, result: row.status === "completed" ? row.result : null })) };
    },
  }),
  route({
    method: "GET",
    path: "/essay/gradings/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const row = (await db.select().from(essayGradingJobs).where(and(eq(essayGradingJobs.id, ctx.params.id), eq(essayGradingJobs.userId, user.userId))).limit(1))[0];
      if (!row) throw notFound("找不到作文批改紀錄");
      return { grading: row };
    },
  }),
  route({
    method: "POST",
    path: "/essay/gradings",
    auth: "user",
    rate: { limit: 8, windowSec: 3600, key: "essay-grading" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      const form = await ctx.formData();
      const file = form.get("file");
      const originalText = String(form.get("originalText") ?? "").trim().slice(0, 30000);
      const requestedKey = String(form.get("idempotencyKey") ?? "").trim().slice(0, 160);
      const idempotencyKey = `${user.userId}:${requestedKey || randomToken(18)}`;
      const duplicate = (await db.select().from(essayGradingJobs).where(and(eq(essayGradingJobs.idempotencyKey, idempotencyKey), eq(essayGradingJobs.userId, user.userId))).limit(1))[0];
      if (duplicate) return { grading: duplicate, reused: true };
      if (!(file instanceof File) && !originalText) throw badRequest("請上傳英文作文圖片或輸入作文文字");
      if (file instanceof File && (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024)) throw badRequest("作文圖片僅支援圖片格式，且單檔不可超過 12MB");

      const service = await serviceConfig();
      if (service.status !== "ENABLED") throw fail("QUOTA_FEATURE_DISABLED", { message: service.maintenanceNotice || (service.status === "PAUSED" ? "英文作文批改服務目前暫停中，請稍後再試。" : "英文作文批改服務目前未開放。") });
      const pro = await isProUser(user.userId);
      if (service.proOnly && !pro) throw fail("QUOTA_PRO_REQUIRED", { message: "此功能目前為 Nova Pro 專屬功能" });
      const gate = await featureState(user.userId, "essay_grading");
      if (!gate.enabled) throw fail("QUOTA_FEATURE_DISABLED", { message: "英文作文批改服務目前已停用" });
      if (gate.proOnly && !pro) throw fail("QUOTA_PRO_REQUIRED", { message: "此功能目前為 Nova Pro 專屬功能" });
      if (!gate.unlimited && gate.remaining <= 0) throw fail("QUOTA_EXHAUSTED", { message: "今日英文作文批改次數已達上限" });
      const [daily] = await db.select({ count: sql<number>`count(*)::int` }).from(essayGradingJobs).where(and(eq(essayGradingJobs.userId, user.userId), gte(essayGradingJobs.createdAt, dayStart()), eq(essayGradingJobs.status, "completed")));
      const [monthly] = await db.select({ count: sql<number>`count(*)::int` }).from(essayGradingJobs).where(and(eq(essayGradingJobs.userId, user.userId), gte(essayGradingJobs.createdAt, monthStart()), eq(essayGradingJobs.status, "completed")));
      if (service.dailyLimit >= 0 && Number(daily?.count ?? 0) >= service.dailyLimit) throw fail("QUOTA_EXHAUSTED", { message: `今日英文作文批改已達上限（${service.dailyLimit} 次）` });
      if (service.monthlyLimit >= 0 && Number(monthly?.count ?? 0) >= service.monthlyLimit) throw fail("QUOTA_EXHAUSTED", { message: `本月英文作文批改已達上限（${service.monthlyLimit} 次）` });

      let objectId: string | null = null;
      let imagePart: { kind: "image"; mimeType: string; base64: string } | null = null;
      if (file instanceof File) {
        const data = Buffer.from(await file.arrayBuffer());
        const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: file.type || "image/jpeg", data, allow: ["image"] });
        objectId = stored.id;
        imagePart = { kind: "image", mimeType: stored.mimeType, base64: data.toString("base64") };
      }
      const created = (await db.insert(essayGradingJobs).values({ userId: user.userId, objectId, idempotencyKey, status: "processing", originalText }).returning())[0];
      try {
        const parts: Array<{ kind: "text"; text: string } | { kind: "image"; mimeType: string; base64: string }> = [{ kind: "text", text: `請分析以下英文作文。${originalText ? `使用者輸入文字：\n${originalText}` : "請先從圖片中完整 OCR，保留原文，不確定的字以 [unclear] 標示。"}` }];
        if (imagePart) parts.push(imagePart);
        const { data, meta } = await runAiJson<EssayResult>({
          feature: "essay_grading",
          userId: user.userId,
          temperature: 0.2,
          maxOutputTokens: 5000,
          system: "你是 StudyNova 英文作文學習批改助理。只根據作文內容分析，不要假裝等同正式考試成績。回傳 JSON，欄位為 ocrText、overallFeedback、corrections[{category,original,suggestion,reason,explanation}]、spelling[{original,suggestion,reason}]、scores[{grammar,vocabulary,spelling,organization,coherence,taskAchievement,overall}]、structure。分數 0-100；沒有證據的錯誤不要捏造。",
          parts,
        }, { corrections: [], spelling: [], overallFeedback: "", ocrText: originalText, scores: {} });
        const result = normalizeResult(data);
        const charged = await consumeFeature(user.userId, "essay_grading");
        await db.update(essayGradingJobs).set({ status: "completed", ocrText: result.ocrText || originalText, result: { ...result, meta: { provider: meta.provider, model: meta.model, latencyMs: meta.latencyMs, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens, fallbackFrom: meta.fallbackFrom }, aiDisclaimer: "AI 評估，僅供學習參考" }, updatedAt: new Date(), completedAt: new Date(), errorMessage: "" }).where(eq(essayGradingJobs.id, created.id));
        return { grading: { ...(await db.select().from(essayGradingJobs).where(eq(essayGradingJobs.id, created.id)).limit(1))[0], balance: charged.remaining }, reused: false };
      } catch (error) {
        await db.update(essayGradingJobs).set({ status: "failed", errorMessage: String(error instanceof Error ? error.message : error).slice(0, 500), updatedAt: new Date() }).where(eq(essayGradingJobs.id, created.id));
        throw error;
      }
    },
  }),
  route({
    method: "DELETE",
    path: "/essay/gradings/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.update(essayGradingJobs).set({ status: "deleted", result: null, originalText: "", ocrText: "", updatedAt: new Date() }).where(and(eq(essayGradingJobs.id, ctx.params.id), eq(essayGradingJobs.userId, user.userId))).returning({ id: essayGradingJobs.id });
      if (!rows[0]) throw notFound("找不到作文批改紀錄");
      return { deleted: true };
    },
  }),
  route({
    method: "GET",
    path: "/admin/essay-service",
    auth: "admin",
    handler: async () => ({ service: await serviceConfig() }),
  }),
  route({
    method: "PATCH",
    path: "/admin/essay-service",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({
        status: z.enum(["ENABLED", "PAUSED", "DISABLED"]).optional(),
        proOnly: z.boolean().optional(),
        novaCost: z.number().int().min(0).max(5000).optional(),
        dailyLimit: z.number().int().min(-1).max(1000).optional(),
        monthlyLimit: z.number().int().min(-1).max(10000).optional(),
        maintenanceNotice: z.string().max(500).optional(),
        showScores: z.boolean().optional(),
      }));
      const current = await serviceConfig();
      const next = { ...current, ...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) };
      await db.insert(platformSettings).values({ key: "essay_grading_service", value: next }).onConflictDoUpdate({ target: platformSettings.key, set: { value: next, updatedAt: new Date() } });
      if (body.novaCost !== undefined) await db.update(featurePermissions).set({ novaCost: body.novaCost }).where(eq(featurePermissions.feature, "essay_grading"));
      return { service: next };
    },
  }),
];
