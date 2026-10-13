import { runAiJson } from "./ai";
import type { AiPart } from "./ai";
import { getAiPolicy, policyInstructions } from "./ai-policy";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { examPrepImportAssets, examPrepImportJobs, examPrepImportPages, examPrepQuestionDrafts, questions } from "@/db/schema";
import { readObject } from "./storage";
import { cropExamPrepDraftAssets } from "./exam-prep-crops";

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
  imageRegions: Array<{ pageNumber: number; role: "question" | "figure" | "map" | "chart" | "table" | "diagram" | "shared"; bbox: { x: number; y: number; width: number; height: number }; coordinateSpace: "normalized" | "pixels"; confidence: number; sharedGroupId?: string }>;
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
    answerInOptions: !draft.options.length || (draft.answer.length > 0 ? draft.answer : verifiedAnswer).every((answer) => answerMatchesOption(answer, draft.options)),
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

export async function analyzeExamPrepDraft(draft: Draft, userId: string, imageParts: AiPart[] = []) {
  const policy = await getAiPolicy("question_analysis");
  const options = draft.options.length ? draft.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n") : "（非選擇題／無選項）";
  const response = await runAiJson<Partial<DraftAnalysis>>({
    feature: "exam_prep_draft_analysis",
    userId,
    system: `你是 StudyNova 段考題目審核專家。${policyInstructions(policy)}\n你必須重新推導答案，不能盲從原卷答案；若無法確認，verifiedAnswer 輸出空陣列並說明原因。不可捏造題目沒有提供的圖表資訊。只輸出 JSON。`,
    parts: [{ kind: "text", text: `請分析這一題。\n科目：${draft.subject}\n題型：${draft.type}\n題幹：${draft.stem}\n選項：\n${options}\n原始答案：${draft.answer.join("、") || "未提供"}\n原始解析：${draft.explanation || "未提供"}\n\n若圖片中有公式、圖表、幾何圖形或題幹文字，必須以圖片為準補足文字；若原卷沒有答案，請自行推導 verifiedAnswer，並產生可教學的 detailedExplanation。看不清楚時不要猜，請在 answerReason 說明。\n影像區域規則：輸入圖片依序對應到 pageNumber；請回傳 imageRegions。role=question 必須包含題號、題幹與所有選項；地圖、圖表、表格、照片或圖例另回傳 role=map/chart/table/diagram/figure，完整包含圖例、方向、比例尺、座標軸與必要標示。同一圖供多題使用時使用相同 sharedGroupId。bbox 使用該圖片左上為原點的 0 到 1 正規化座標（x,y,width,height），不要回傳整頁，除非題目真的佔滿頁面；信心不足時 imageRegions 輸出空陣列。\nJSON 欄位：understanding、verifiedAnswer(string[])、answerReason、approach、detailedExplanation、optionAnalysis([{option,reason}])、coreConcept、commonErrors(string[])、memoryTip、imageRegions([{pageNumber,role,bbox:{x,y,width,height},coordinateSpace:\"normalized\",confidence,sharedGroupId}])。` }, ...imageParts],
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
    imageRegions: Array.isArray(response.data.imageRegions) ? response.data.imageRegions.map((item) => {
      const bbox = item.bbox && typeof item.bbox === "object" ? item.bbox as Record<string, unknown> : {};
      return { pageNumber: Number(item.pageNumber), role: String(item.role ?? "question") as DraftAnalysis["imageRegions"][number]["role"], bbox: { x: Number(bbox.x), y: Number(bbox.y), width: Number(bbox.width), height: Number(bbox.height) }, coordinateSpace: item.coordinateSpace === "pixels" ? "pixels" as const : "normalized" as const, confidence: Number(item.confidence ?? 0), ...(item.sharedGroupId ? { sharedGroupId: String(item.sharedGroupId) } : {}) };
    }).filter((item) => Number.isInteger(item.pageNumber) && item.pageNumber > 0 && Object.values(item.bbox).every(Number.isFinite)) : [],
  };
  const quality = draftQualityGate(draft, analysis);
  return { analysis, quality, provider: response.meta };
}

export async function processExamPrepDraftAnalysis(draftId: string, userId: string) {
  const draft = (await db.select().from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.id, draftId)).limit(1))[0];
  if (!draft) throw new Error("找不到段考題目草稿");
  const job = (await db.select({ status: examPrepImportJobs.status }).from(examPrepImportJobs).where(eq(examPrepImportJobs.id, draft.jobId)).limit(1))[0];
  if (job?.status === "paused" || job?.status === "cancelled") return { status: job.status, quality: {} };
  const sourceMetadata = draft.sourceMetadata && typeof draft.sourceMetadata === "object" ? draft.sourceMetadata as Record<string, unknown> : {};
  if (draft.analysisStatus === "completed" && draft.quality && (draft.quality as { passed?: boolean }).passed && sourceMetadata.cropStatus === "ready") return { status: draft.analysisStatus, quality: draft.quality };
  await db.update(examPrepQuestionDrafts).set({ analysisStatus: "analyzing", analysisAttempts: draft.analysisAttempts + 1, analysisError: "", updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
  await updateExamPrepAnalysisProgress(draft.jobId);
  try {
    const assets = await db.select({ objectId: examPrepImportAssets.objectId, pageNumber: examPrepImportAssets.pageNumber }).from(examPrepImportAssets).where(and(eq(examPrepImportAssets.jobId, draft.jobId), eq(examPrepImportAssets.assetType, "image")));
    const pageDimensions = await db.select({ pageNumber: examPrepImportPages.pageNumber, width: examPrepImportPages.width, height: examPrepImportPages.height }).from(examPrepImportPages).where(eq(examPrepImportPages.jobId, draft.jobId));
    const imageParts: AiPart[] = [];
    for (const asset of assets.filter((item) => item.pageNumber !== null && (draft.pageStart === null || item.pageNumber >= draft.pageStart) && (draft.pageEnd === null || item.pageNumber <= draft.pageEnd)).slice(0, 3)) {
      try {
        const object = await readObject(asset.objectId);
        if (object.mimeType.startsWith("image/")) {
          const dimensions = pageDimensions.find((page) => page.pageNumber === asset.pageNumber);
          imageParts.push({ kind: "text", text: `下一張頁面影像：原始考卷第 ${asset.pageNumber} 頁，像素尺寸約 ${dimensions?.width ?? "未知"}×${dimensions?.height ?? "未知"}。後續 imageRegions 的 pageNumber 必須使用 ${asset.pageNumber}。` });
          imageParts.push({ kind: "image", mimeType: object.mimeType, base64: object.data.toString("base64") });
        }
      } catch { /* 圖片遺失時仍可用 OCR 文字分析 */ }
    }
    const result = await analyzeExamPrepDraft({ subject: draft.subject, type: draft.type, stem: draft.stem, options: draft.options, answer: draft.answer, explanation: draft.explanation }, userId, imageParts);
    const analysisStatus = result.quality.passed ? "completed" : "quality_failed";
    const reviewStatus = result.quality.passed && !result.quality.answerConflict ? "approved" : "needs_review";
    const verifiedAnswer = result.analysis.verifiedAnswer.length ? result.analysis.verifiedAnswer : draft.answer;
    const explanation = draft.explanation.trim() || result.analysis.detailedExplanation.trim();
    await db.update(examPrepQuestionDrafts).set({ answer: verifiedAnswer, explanation, analysis: result.analysis, quality: { ...result.quality, provider: result.provider, imageCount: imageParts.length }, analysisStatus, status: reviewStatus, analyzedAt: new Date(), updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    try {
      const cropResult = await cropExamPrepDraftAssets(draft.id, userId);
      if (draft.questionId) {
        const currentQuestion = (await db.select({ metadata: questions.metadata }).from(questions).where(eq(questions.id, draft.questionId)).limit(1))[0];
        const currentMetadata = currentQuestion?.metadata && typeof currentQuestion.metadata === "object" ? currentQuestion.metadata as Record<string, unknown> : {};
        await db.update(questions).set({ metadata: { ...currentMetadata, cropStatus: cropResult.status, assetObjectIds: cropResult.assetObjectIds, cropRegions: cropResult.regions }, updatedAt: new Date() }).where(eq(questions.id, draft.questionId));
      }
    } catch (cropError) {
      await db.update(examPrepQuestionDrafts).set({ sourceMetadata: { ...(draft.sourceMetadata ?? {}), cropStatus: "failed", cropError: cropError instanceof Error ? cropError.message : "題目圖片裁切失敗", assetObjectIds: [] }, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    }
    await updateExamPrepAnalysisProgress(draft.jobId);
    return { status: analysisStatus, quality: result.quality };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 題目分析失敗";
    await db.update(examPrepQuestionDrafts).set({ analysisStatus: "failed", analysisError: message, updatedAt: new Date() }).where(eq(examPrepQuestionDrafts.id, draft.id));
    await updateExamPrepAnalysisProgress(draft.jobId);
    throw error;
  }
}

async function updateExamPrepAnalysisProgress(jobId: string) {
  const currentJob = (await db.select({ status: examPrepImportJobs.status }).from(examPrepImportJobs).where(eq(examPrepImportJobs.id, jobId)).limit(1))[0];
  if (currentJob?.status === "paused" || currentJob?.status === "cancelled") return;
  const drafts = await db.select({ analysisStatus: examPrepQuestionDrafts.analysisStatus, questionNumber: examPrepQuestionDrafts.questionNumber, analysisError: examPrepQuestionDrafts.analysisError, quality: examPrepQuestionDrafts.quality }).from(examPrepQuestionDrafts).where(eq(examPrepQuestionDrafts.jobId, jobId));
  const total = drafts.length;
  const processed = drafts.filter((draft) => ["completed", "quality_failed", "failed"].includes(draft.analysisStatus)).length;
  const progress = total ? Math.round((processed / total) * 100) : 0;
  const current = drafts.find((draft) => draft.analysisStatus === "analyzing") ?? drafts.find((draft) => draft.analysisStatus === "queued");
  const problems = drafts.filter((draft) => draft.analysisStatus === "failed" || draft.analysisStatus === "quality_failed").slice(-3).map((draft) => {
    const failed = Array.isArray((draft.quality as { failed?: unknown } | null)?.failed) ? ((draft.quality as { failed: unknown[] }).failed).join("、") : "品質檢查未通過";
    return `第${draft.questionNumber ?? "?"}題：${draft.analysisError || failed}`;
  });
  await db.update(examPrepImportJobs).set({ status: processed === total ? "pending_review" : "processing", stage: current ? `ai_analysis_question_${current.questionNumber ?? "?"}` : "ai_analysis_done", progress, errorMessage: problems.join("；"), updatedAt: new Date(), ...(processed === total ? { completedAt: new Date() } : {}) }).where(eq(examPrepImportJobs.id, jobId));
}
