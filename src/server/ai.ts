import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiProviderHealth, aiUsageLogs } from "@/db/schema";
import { fail, monthStart, nextUtcMonthStart } from "./core";

export type ProviderName = "gemini_1" | "gemini_2" | "gemini_3" | "openai" | "openrouter";

export type ProviderConfig = {
  name: ProviderName;
  priority: number;
  model: string;
  apiKey?: string;
};

export type AiPart =
  | { kind: "text"; text: string }
  | { kind: "image"; mimeType: string; base64: string }
  | { kind: "audio"; mimeType: string; base64: string };

export type AiRequest = {
  feature: string;
  system?: string;
  parts: AiPart[];
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  userId?: string | null;
};

export type AiResult = {
  text: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  fallbackFrom: string;
};

export type FailureCategory =
  | "rate_limited"
  | "quota_exhausted"
  | "server_error"
  | "timeout"
  | "network"
  | "configuration"
  | "invalid_request"
  | "unknown";

const RETRYABLE: FailureCategory[] = ["rate_limited", "quota_exhausted", "server_error", "timeout", "network"];

function cleanEnv(value?: string) {
  return value?.trim().replace(/^([\"']).*\1$/, (quoted) => quoted.slice(1, -1)).trim() || undefined;
}

function cleanModel(value?: string) {
  return (cleanEnv(value) || "gemini-3.6-flash").replace(/^models\//, "");
}

export function providerConfigs(): ProviderConfig[] {
  const geminiModel = cleanModel(process.env.GEMINI_MODEL);
  return [
    {
      name: "gemini_1",
      priority: 1,
      model: geminiModel,
      apiKey: cleanEnv(process.env.GEMINI_API_KEY_1 || process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
    },
    { name: "gemini_2", priority: 2, model: geminiModel, apiKey: cleanEnv(process.env.GEMINI_API_KEY_2) },
    { name: "gemini_3", priority: 3, model: geminiModel, apiKey: cleanEnv(process.env.GEMINI_API_KEY_3) },
    {
      name: "openai",
      priority: 4,
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      apiKey: process.env.OPENAI_API_KEY,
    },
    {
      name: "openrouter",
      priority: 5,
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
      apiKey: process.env.OPENROUTER_API_KEY,
    },
  ];
}

export function aiConfigured(): boolean {
  return providerConfigs().some((p) => Boolean(p.apiKey));
}

class ProviderError extends Error {
  category: FailureCategory;
  reason: string;
  constructor(category: FailureCategory, message: string, reason = "") {
    super(message);
    this.category = category;
    this.reason = reason;
  }
}

function safeProviderReason(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    return String(parsed.error?.message || parsed.error?.status || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").slice(0, 180);
  } catch {
    return body.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 180);
  }
}

function categorize(status: number, body: string): FailureCategory {
  if (status === 429) return /quota|exceeded your current quota|billing/i.test(body) ? "quota_exhausted" : "rate_limited";
  if (status >= 500) return "server_error";
  if (status === 401 || status === 403) return "configuration";
  if (status === 400 && /(api[ _-]?key|invalid.*key|key.*valid|model.*not found)/i.test(body)) return "configuration";
  if (status === 404 && /model|not found/i.test(body)) return "configuration";
  if (status === 400 || status === 404 || status === 422) return "invalid_request";
  return "unknown";
}

const estimate = (s: string) => Math.max(1, Math.ceil(s.length / 4));

async function fetchJson(url: string, init: RequestInit, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      const reason = safeProviderReason(text);
      throw new ProviderError(categorize(res.status, text), `provider responded ${res.status}`, reason);
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ProviderError("unknown", "provider returned malformed payload");
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new ProviderError("timeout", "provider timeout");
    throw new ProviderError("network", "provider network error");
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------- providers */

async function callGemini(cfg: ProviderConfig, req: AiRequest): Promise<Omit<AiResult, "fallbackFrom">> {
  const started = Date.now();
  const parts = req.parts.map((p) =>
    p.kind === "text" ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
  );
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.6,
      maxOutputTokens: req.maxOutputTokens ?? 2048,
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

  const json = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
    { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey! }, body: JSON.stringify(body) },
  )) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new ProviderError("server_error", "empty completion");
  return {
    text,
    provider: cfg.name,
    model: cfg.model,
    inputTokens: json.usageMetadata?.promptTokenCount ?? estimate(JSON.stringify(parts)),
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? estimate(text),
    latencyMs: Date.now() - started,
  };
}

async function callOpenAiCompatible(cfg: ProviderConfig, req: AiRequest, endpoint: string): Promise<Omit<AiResult, "fallbackFrom">> {
  const started = Date.now();
  const content = req.parts.map((p) => {
    if (p.kind === "text") return { type: "text", text: p.text };
    if (p.kind === "image") return { type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.base64}` } };
    return { type: "input_audio", input_audio: { data: p.base64, format: p.mimeType.includes("wav") ? "wav" : "mp3" } };
  });
  const messages: Array<Record<string, unknown>> = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.name === "openrouter") {
    headers["HTTP-Referer"] = process.env.APP_URL || "https://studynova.ai";
    headers["X-Title"] = "StudyNova AI";
  }

  const json = (await fetchJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: req.temperature ?? 0.6,
      max_tokens: req.maxOutputTokens ?? 2048,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    }),
  })) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = (json.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new ProviderError("server_error", "empty completion");
  return {
    text,
    provider: cfg.name,
    model: cfg.model,
    inputTokens: json.usage?.prompt_tokens ?? estimate(JSON.stringify(content)),
    outputTokens: json.usage?.completion_tokens ?? estimate(text),
    latencyMs: Date.now() - started,
  };
}

/* ------------------------------------------------------- health state */

async function healthRow(name: ProviderName, model: string) {
  const rows = await db.select().from(aiProviderHealth).where(eq(aiProviderHealth.provider, name)).limit(1);
  if (rows[0]) return rows[0];
  const priority = providerConfigs().find((p) => p.name === name)?.priority ?? 9;
  const inserted = await db
    .insert(aiProviderHealth)
    .values({ provider: name, model, priority })
    .onConflictDoNothing()
    .returning();
  return inserted[0] ?? (await db.select().from(aiProviderHealth).where(eq(aiProviderHealth.provider, name)).limit(1))[0];
}

async function logUsage(entry: {
  userId?: string | null;
  provider: string;
  model: string;
  feature: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  fallbackFrom?: string;
  failureCategory?: string;
}) {
  await db.insert(aiUsageLogs).values({
    userId: entry.userId ?? null,
    provider: entry.provider,
    model: entry.model,
    feature: entry.feature,
    success: entry.success,
    inputTokens: entry.inputTokens ?? 0,
    outputTokens: entry.outputTokens ?? 0,
    latencyMs: entry.latencyMs ?? 0,
    fallbackFrom: entry.fallbackFrom ?? "",
    failureCategory: entry.failureCategory ?? "",
  });
}

/* --------------------------------------------------------- public API */

export async function runAi(req: AiRequest): Promise<AiResult> {
  const configs = providerConfigs()
    .filter((c) => Boolean(c.apiKey))
    .sort((a, b) => a.priority - b.priority);

  if (!configs.length) {
    throw fail("AI_NOT_CONFIGURED");
  }

  let fallbackFrom = "";
  let lastCategory: FailureCategory = "unknown";

  for (const cfg of configs) {
    const health = await healthRow(cfg.name, cfg.model);
    if (health && health.enabled === false) continue;
    if (health?.cooldownUntil && new Date(health.cooldownUntil) > new Date()) {
      fallbackFrom = fallbackFrom || cfg.name;
      continue;
    }
    try {
      const out =
          cfg.name.startsWith("gemini_")
          ? await callGemini(cfg, req)
          : await callOpenAiCompatible(
              cfg,
              req,
              cfg.name === "openai"
                ? "https://api.openai.com/v1/chat/completions"
                : "https://openrouter.ai/api/v1/chat/completions",
            );
      await db
        .update(aiProviderHealth)
        .set({ lastSuccessAt: new Date(), cooldownUntil: null, model: cfg.model, updatedAt: new Date() })
        .where(eq(aiProviderHealth.provider, cfg.name));
      await logUsage({ ...out, userId: req.userId, feature: req.feature, success: true, fallbackFrom });
      return { ...out, fallbackFrom };
    } catch (err) {
      const category: FailureCategory = err instanceof ProviderError ? err.category : "unknown";
      lastCategory = category;
      await db
        .update(aiProviderHealth)
        .set({
          lastFailureAt: new Date(),
          lastFailureCategory: category,
          updatedAt: new Date(),
          ...(category === "quota_exhausted" ? { cooldownUntil: nextUtcMonthStart() } : {}),
        })
        .where(eq(aiProviderHealth.provider, cfg.name));
      await logUsage({
        userId: req.userId,
        provider: cfg.name,
        model: cfg.model,
        feature: req.feature,
        success: false,
        failureCategory: category,
        fallbackFrom,
      });
      if (!RETRYABLE.includes(category)) {
        throw fail("AI_PROVIDER_ERROR", { message: "AI 服務暫時無法使用，請稍後再試。" });
      }
      fallbackFrom = cfg.name;
    }
  }
  throw fail("AI_ALL_UNAVAILABLE", { message: "AI 服務暫時無法使用，請稍後再試。" });
}

export function extractJson<T>(raw: string, fallback: T): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const attempt = (s: string) => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const direct = attempt(cleaned);
  if (direct) return direct;
  const first = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const start = first === -1 ? firstArr : firstArr === -1 ? first : Math.min(first, firstArr);
  const lastObj = cleaned.lastIndexOf("}");
  const lastArr = cleaned.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (start >= 0 && end > start) {
    const sliced = attempt(cleaned.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return fallback;
}

export async function runAiJson<T>(req: AiRequest, fallback: T): Promise<{ data: T; meta: AiResult }> {
  const meta = await runAi({ ...req, json: true });
  return { data: extractJson<T>(meta.text, fallback), meta };
}

/* ------------------------------------------------------------ metrics */

export async function providerMetrics() {
  const since = monthStart();
  const usage = await db
    .select({
      provider: aiUsageLogs.provider,
      requests: sql<number>`count(*)::int`,
      success: sql<number>`sum(case when ${aiUsageLogs.success} then 1 else 0 end)::int`,
      failure: sql<number>`sum(case when ${aiUsageLogs.success} then 0 else 1 end)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}),0)::int`,
      avgLatency: sql<number>`coalesce(avg(${aiUsageLogs.latencyMs}),0)::int`,
      fallbacks: sql<number>`sum(case when ${aiUsageLogs.fallbackFrom} <> '' then 1 else 0 end)::int`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, since))
    .groupBy(aiUsageLogs.provider);

  const health = await db.select().from(aiProviderHealth);
  const cfgs = providerConfigs();
  return cfgs.map((cfg) => {
    const u = usage.find((x) => x.provider === cfg.name);
    const h = health.find((x) => x.provider === cfg.name);
    const inputTokens = u?.inputTokens ?? 0;
    const outputTokens = u?.outputTokens ?? 0;
    const inRate = h?.inputRatePerMillion ?? 0.1;
    const outRate = h?.outputRatePerMillion ?? 0.4;
    return {
      provider: cfg.name,
      priority: cfg.priority,
      model: h?.model ?? cfg.model,
      configured: Boolean(cfg.apiKey),
      enabled: h?.enabled ?? true,
      requests: u?.requests ?? 0,
      success: u?.success ?? 0,
      failure: u?.failure ?? 0,
      inputTokens,
      outputTokens,
      avgLatencyMs: u?.avgLatency ?? 0,
      fallbacks: u?.fallbacks ?? 0,
      lastSuccessAt: h?.lastSuccessAt ?? null,
      lastFailureAt: h?.lastFailureAt ?? null,
      lastFailureCategory: h?.lastFailureCategory ?? "",
      cooldownUntil: h?.cooldownUntil ?? null,
      estimatedCostUsd: Number(((inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate).toFixed(4)),
      inputRatePerMillion: inRate,
      outputRatePerMillion: outRate,
    };
  });
}

export async function recentAiFailures(limit = 20) {
  return db
    .select()
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.success, false)))
    .orderBy(sql`${aiUsageLogs.createdAt} desc`)
    .limit(limit);
}
