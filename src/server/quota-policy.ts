export const AI_SOLUTION_FEATURE = "ai_solution" as const;

export type FeaturePermissionPolicy = {
  feature: string;
  label: string;
  enabled: boolean;
  proOnly: boolean;
  freeDailyLimit: number;
  proDailyLimit: number;
  monthlyLimit: number;
  novaCost: number;
};

/**
 * Server-owned defaults are used only when the feature row is genuinely absent.
 * They are not used to hide database/schema/connection failures.
 */
export const SERVER_FEATURE_DEFAULTS: readonly FeaturePermissionPolicy[] = [
  { feature: "ai_context", label: "情境 AI", enabled: true, proOnly: false, freeDailyLimit: 12, proDailyLimit: 80, monthlyLimit: 0, novaCost: 0 },
  { feature: "ai_practice", label: "AI 練習出題", enabled: true, proOnly: false, freeDailyLimit: 3, proDailyLimit: 15, monthlyLimit: 0, novaCost: 0 },
  { feature: "material_organize", label: "教材整理", enabled: true, proOnly: false, freeDailyLimit: 3, proDailyLimit: 15, monthlyLimit: 0, novaCost: 0 },
  { feature: "ai_study_plan", label: "AI 讀書計畫", enabled: true, proOnly: false, freeDailyLimit: 0, proDailyLimit: 5, monthlyLimit: 0, novaCost: 0 },
  { feature: "wrong_review_ai", label: "錯題 AI 複習", enabled: true, proOnly: false, freeDailyLimit: 5, proDailyLimit: 30, monthlyLimit: 0, novaCost: 0 },
  { feature: "ai_speech", label: "AI 朗讀／語音分析", enabled: true, proOnly: false, freeDailyLimit: 0, proDailyLimit: 20, monthlyLimit: 0, novaCost: 0 },
  { feature: "ai_visual", label: "AI 重點心智圖", enabled: true, proOnly: false, freeDailyLimit: 3, proDailyLimit: 20, monthlyLimit: 0, novaCost: 0 },
  { feature: "image_ocr", label: "圖片辨識", enabled: true, proOnly: false, freeDailyLimit: 5, proDailyLimit: 50, monthlyLimit: 0, novaCost: 0 },
  { feature: "multi_image_ocr", label: "多圖片辨識", enabled: true, proOnly: false, freeDailyLimit: 0, proDailyLimit: 10, monthlyLimit: 0, novaCost: 0 },
  { feature: AI_SOLUTION_FEATURE, label: "AI 解題初次分析", enabled: true, proOnly: false, freeDailyLimit: 3, proDailyLimit: 30, monthlyLimit: 0, novaCost: 10 },
  { feature: "essay_grading", label: "英文作文批改", enabled: true, proOnly: false, freeDailyLimit: 1, proDailyLimit: 10, monthlyLimit: 30, novaCost: 10 },
];

export function serverDefaultForFeature(feature: string) {
  return SERVER_FEATURE_DEFAULTS.find((item) => item.feature === feature);
}

export type QuotaDatabaseErrorCategory = "schema_migration" | "permission_denied" | "connection" | "query_error";

export function classifyQuotaDatabaseError(error: unknown): QuotaDatabaseErrorCategory {
  const raw = error instanceof Error ? error.message : String(error);
  if (/does not exist|undefined column|relation .* does not exist|column .* does not exist/i.test(raw)) return "schema_migration";
  if (/permission denied|not authorized/i.test(raw)) return "permission_denied";
  if (/timeout|connection|connect|ECONN|ENOTFOUND/i.test(raw)) return "connection";
  return "query_error";
}

export type QuotaEvaluation = {
  allowed: boolean;
  limit: number;
  monthlyLimit: number;
  remaining: number;
  monthlyRemaining: number;
  reason: "ok" | "disabled" | "pro_only" | "not_in_plan" | "daily_exhausted" | "monthly_exhausted";
};

export function evaluateQuota(policy: FeaturePermissionPolicy, params: { isPro: boolean; used: number; monthlyUsed: number; units?: number }): QuotaEvaluation {
  const units = Math.max(1, params.units ?? 1);
  const limit = params.isPro ? policy.proDailyLimit : policy.freeDailyLimit;
  const monthlyLimit = policy.monthlyLimit > 0 ? policy.monthlyLimit : limit > 0 ? limit * 30 : 0;
  const monthlyRemaining = monthlyLimit <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, monthlyLimit - params.monthlyUsed);
  if (!policy.enabled) return { allowed: false, limit, monthlyLimit, remaining: Math.max(0, limit - params.used), monthlyRemaining, reason: "disabled" };
  if (policy.proOnly && !params.isPro) return { allowed: false, limit, monthlyLimit, remaining: 0, monthlyRemaining, reason: "pro_only" };
  if (limit <= 0) return { allowed: false, limit, monthlyLimit, remaining: 0, monthlyRemaining, reason: "not_in_plan" };
  if (monthlyLimit > 0 && params.monthlyUsed + units > monthlyLimit) return { allowed: false, limit, monthlyLimit, remaining: Math.max(0, limit - params.used), monthlyRemaining, reason: "monthly_exhausted" };
  if (params.used + units > limit) return { allowed: false, limit, monthlyLimit, remaining: Math.max(0, limit - params.used), monthlyRemaining, reason: "daily_exhausted" };
  return { allowed: true, limit, monthlyLimit, remaining: Math.max(0, limit - params.used - units), monthlyRemaining: Math.max(0, monthlyRemaining - units), reason: "ok" };
}
