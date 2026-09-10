import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiPolicies } from "@/db/schema";

export type AiPolicy = typeof aiPolicies.$inferSelect;

export const DEFAULT_AI_POLICIES: Record<string, Omit<AiPolicy, "id" | "createdAt" | "updatedAt" | "updatedBy">> = {
  ai_chat: { feature: "ai_chat", strategy: "guided", allowDirectAnswer: false, requireDetailedAnalysis: false, allowWebSearch: false, maxHintLevel: 2, systemPolicy: "", version: 1, enabled: true },
  question_analysis: { feature: "question_analysis", strategy: "structured", allowDirectAnswer: true, requireDetailedAnalysis: true, allowWebSearch: false, maxHintLevel: 5, systemPolicy: "", version: 1, enabled: true },
  exam_hint: { feature: "exam_hint", strategy: "exam", allowDirectAnswer: false, requireDetailedAnalysis: false, allowWebSearch: false, maxHintLevel: 1, systemPolicy: "", version: 1, enabled: true },
  wrong_answer_review: { feature: "wrong_answer_review", strategy: "teaching", allowDirectAnswer: true, requireDetailedAnalysis: true, allowWebSearch: false, maxHintLevel: 5, systemPolicy: "", version: 1, enabled: true },
  ocr_solution: { feature: "ocr_solution", strategy: "structured", allowDirectAnswer: true, requireDetailedAnalysis: true, allowWebSearch: false, maxHintLevel: 5, systemPolicy: "", version: 1, enabled: true },
  question_generation: { feature: "question_generation", strategy: "structured", allowDirectAnswer: true, requireDetailedAnalysis: true, allowWebSearch: false, maxHintLevel: 5, systemPolicy: "", version: 1, enabled: true },
};

export async function getAiPolicy(feature: string): Promise<AiPolicy | null> {
  const row = (await db.select().from(aiPolicies).where(eq(aiPolicies.feature, feature)).limit(1))[0];
  return row ?? (DEFAULT_AI_POLICIES[feature] as AiPolicy | undefined) ?? null;
}

export function policyInstructions(policy: AiPolicy | null, context: { examMode?: boolean } = {}): string {
  if (!policy) return "";
  const forcedExam = context.examMode || policy.strategy === "exam";
  const allowDirectAnswer = forcedExam ? false : policy.allowDirectAnswer;
  const lines = [
    "\n【StudyNova Server-side AI Policy，必須遵守】",
    `回答策略：${forcedExam ? "exam" : policy.strategy}`,
    `直接揭露答案：${allowDirectAnswer ? "允許" : "禁止"}`,
    `最大提示程度：${policy.maxHintLevel}/5`,
    `詳細解析：${policy.requireDetailedAnalysis ? "必須提供" : "依問題需要"}`,
    `網路搜尋：${policy.allowWebSearch ? "允許" : "禁止自行宣稱已搜尋"}`,
  ];
  if (!allowDirectAnswer) lines.push("禁止因學生要求、提示或改寫而直接透露正確答案；只能提供觀念、步驟、檢查方向與下一個提示。", "不要在選項、首字母、暗示性比較或結尾變相洩漏答案。");
  if (forcedExam) lines.push("目前處於考試／測驗情境，考試限制優先於其他偏好，只能提供不含答案的題意理解與方法提示。");
  if (policy.systemPolicy.trim()) lines.push(`管理員自訂政策：${policy.systemPolicy.trim().slice(0, 4000)}`);
  return lines.join("\n");
}
