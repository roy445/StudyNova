import { runAiJson } from "./ai";
import { getAiPolicy, policyInstructions } from "./ai-policy";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examPrepQuestionDrafts } from "@/db/schema";

type Draft = {
  subject: string;
  type: string;
  stem: string;
  options: string[];
  answer: string[];
  explanation: string;
};

export type DraftAnalysis = {
  understanding: string;
  verifiedAnswer: string[];
  answerReason: string;
  approach: string;
  detailedExplanation: string;
  optionAnalysis: Array<{ option: string; reason: string }>;
  coreConcept: string;
  commonErrors: string[];
  memoryTip: string;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s「」『』“”"‘’'.,，。！？!?：:；;（）()【】[\]、]/g, "");
}

function answerMatchesOption(answer: string, options: string[]) {
  return optionIndex(answer, options) !== null;
}

function optionIndex(answer: string, options: string[]) {
  const clean = normalized(answer);
  const exact = options.findIndex((option) => clean === normalized(option));
  if (exact >= 0) return exact;
  if (/^[a-z]$/.test(clean)) {
    const letterIndex = clean.charCodeAt(0) - 97;
    return letterIndex >= 0 && letterIndex < options.length ? letterIndex : null;
  }
  if (/^\d+$/.test(clean)) {
    const numericIndex = Number(clean) - 1;
    return numericIndex >= 0 && numericIndex < options.length ? numericIndex : null;
  }
  return null;
}

export function draftQualityGate(draft: Draft, analysis: Partial<DraftAnalysis>) {
  const verifiedAnswer = analysis.verifiedAnswer ?? [];
  const understanding = analysis.understanding ?? "";
  const approach = analysis.approach ?? "";
  const detailedExplanation = analysis.detailedExplanation ?? "";
  const answerConflict = draft.answer.length > 0 && verifiedAnswer.length > 0 && verifiedAnswer.some((value) => !draft.answer.some((expected) => normalized(expected) === normalized(value) || (optionIndex(value, draft.options) !== null && optionIndex(value, draft.options) === optionIndex(expected, draft.options))));
  const checks = {
    hasStem: draft.stem.trim().length >= 4,
    hasOptions: draft.type === "fill" || draft.type === "short" || draft.type === "essay" || draft.options.length >= 2,
    answerPresent: Boolean(draft.answer.length || analysis.verifiedAnswer?.length),
    answerInOptions: !draft.options.length || (draft.answer.length > 0 && draft.answer.every((answer) => answerMatchesOption(answer, draft.options))),
    hasUnderstanding: understanding.trim().length >= 12,
    hasApproach: approach.trim().length >= 12,
    hasExplanation: detailedExplanation.trim().length >= 24,
    hasConcept: Boolean(analysis.coreConcept?.trim()),
    hasErrors: Boolean(analysis.commonErrors?.length),
    hasOptionAnalysis: !draft.options.length || Boolean(analysis.optionAnalysis?.length === draft.options.length),
    noAnswerConflict: !answerConflict,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { passed: failed.length === 0, score: Math.round((Object.values(checks).filter(Boolean).length / Object.values(checks).length) * 100), checks, failed, answerConflict, answerConflictStatus: answerConflict ? "ANSWER_CONFLICT" : "MATCHED" };
}

export async function analyzeExamPrepDraft(draft: Draft, userId: string) {
  const policy = await getAiPolicy("question_analysis");
  const options = draft.options.length ? draft.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n") : "（非選擇題／無選項）";
  const response = await runAiJson<Partial<DraftAnalysis>>({
    feature: "exam_prep_draft_analysis",
    userId,
    system: `你是 StudyNova 段考題目審核專家。${policyInstructions(policy)}\n你必須重新推導答案，不能盲從原卷答案；若無法確認，verifiedAnswer 輸出空陣列並說明原因。不可捏造題目沒有提供的圖表資訊。只輸出 JSON。`,
    parts: [{ kind: "text", text: `請分析這一題。\n科目：${draft.subject}\n題型：${draft.type}\n題幹：${draft.stem}\n選項：\n${options}\n原始答案：${draft.answer.join("、") || "未提供"}\n原始解析：${draft.explanation || "未提供"}\n\nJSON 欄位：understanding、verifiedAnswer(string[])、answerReason、approach、detailedExplanation、optionAnalysis([{option,reason}])、coreConcept、commonErrors(string[])、memoryTip。` }],
    maxOutputTokens: 3200,
    temperature: 0.1,
  }, {});
  const analysis: DraftAnalysis = {
    understanding: String(response.data.understanding ?? ""),
    verifiedAnswer: Array.isArray(response.data.verifiedAnswer) ? response.data.verifiedAnswer.map(String) : [],
    answerReason: String(response.data.answerReason ?? ""),
    approach: String(response.data.approach ?? ""),
    detailedExplanation: String(response.data.detailedExplanation ?? ""),
    optionAnalysis: Array.isArray(response.data.optionAnalysis) ? response.data.optionAnalysis.filter((item): item is { option: string; reason: string } => Boolean(item && typeof item === "object")).map((item) => ({ option: String(item.option ?? ""), reason: String(item.reason ?? "") })) : [],
    coreConcept: String(response.data.coreConcept ?? ""),
    commonErrors: Array.isArray(response.data.commonErrors) ? response.data.commonErrors.map(String) : [],
    memoryTip: String(response.data.memoryTip ?? ""),
  };
  const quality = draftQualityGate(draft, analysis);
  return { analysis, quality, provider: response.meta };
}

export async function processExamPrepDraftAnalysis(draftId: string, userId: string) {
  const draft = (await db.select().from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.id, draftId)).limit(1))[0];
  if (!draft) throw new Error("找不到段考題目草稿");
  if (draft.analysisStatus === "completed" && draft.quality && (draft.quality as { passed?: boolean }).passed) return { status: draft.analysisStatus, quality: draft.quality };
  await db.update(examPrepQuestionDrafts).set({ analysisStatus: "analyzing", analysisAttempts: draft.analysisAttempts + 1, analysisError: "", updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
  try {
    const result = await analyzeExamPrepDraft({ subject: draft.subject, type: draft.type, stem: draft.stem, options: draft.options, answer: draft.answer, explanation: draft.explanation }, userId);
    const analysisStatus = result.quality.passed ? "completed" : "quality_failed";
    await db.update(examPrepQuestionDrafts).set({ analysis: result.analysis, quality: { ...result.quality, provider: result.provider }, analysisStatus, analyzedAt: new Date(), updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    return { status: analysisStatus, quality: result.quality };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 題目分析失敗";
    await db.update(examPrepQuestionDrafts).set({ analysisStatus: "failed", analysisError: message, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    throw error;
  }
}
