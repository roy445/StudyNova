import { runAiJson } from "./ai";
import { subjectStrategy } from "./subject-strategies";

export type ExamGenerationRequirements = {
  educationLevel: string;
  schoolName: string;
  grade: number;
  subject: string;
  examNumber: string;
  chapters: string[];
  units: string[];
  vocabularyRange: string[];
  questionTypes: string[];
  difficulty: string;
};

export type ExamQuestionDraft = {
  subject: string;
  type: string;
  stem: string;
  options: string[];
  answer: string[];
  acceptedAnswers: string[];
  synonyms: string[];
  variants: string[];
  acceptableTranslations: string[];
  explanation: string;
  difficulty: string;
  topic: string;
  chapter: string;
  unit: string;
  learningPoint: string;
  aiConfidence: number;
  sourceType: string;
  sourceMetadata: Record<string, unknown>;
  analysis: Record<string, unknown>;
};

function optionLetters(count: number) {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

export function qualityCheckDraft(draft: Partial<ExamQuestionDraft>, requirements: ExamGenerationRequirements, existingStems: string[] = []) {
  const options = Array.isArray(draft.options) ? draft.options.map(String).map((x) => x.trim()).filter(Boolean) : [];
  const normalizedOptions = options.map((x) => x.toLocaleLowerCase().replace(/\s+/g, " "));
  const duplicateOptions = new Set(normalizedOptions).size !== normalizedOptions.length;
  const answer = Array.isArray(draft.answer) ? draft.answer.map(String).filter(Boolean) : [];
  const answerExists = answer.length > 0 && answer.every((item) => options.includes(item) || optionLetters(options.length).includes(item) || Boolean(draft.acceptedAnswers?.includes(item)));
  const stem = String(draft.stem ?? "").trim();
  const normalizedStem = stem.toLocaleLowerCase().replace(/\s+/g, " ");
  const duplicateQuestion = existingStems.some((item) => item.toLocaleLowerCase().replace(/\s+/g, " ") === normalizedStem);
  const qualitySignals = [
    ["complete", Boolean(stem && draft.explanation?.trim() && draft.learningPoint?.trim())],
    ["answer_present", answer.length > 0 || (draft.acceptedAnswers?.length ?? 0) > 0],
    ["answer_exists", answer.length === 0 || answerExists],
    ["options_unique", !duplicateOptions],
    ["option_count", draft.type === "single" ? options.length >= 4 : true],
    ["scope_subject", draft.subject === requirements.subject],
    ["scope_difficulty", !draft.difficulty || draft.difficulty === requirements.difficulty],
    ["not_duplicate", !duplicateQuestion],
    ["not_template", !/這題考察|單字理解能力|根據題目可知/.test(`${draft.analysis?.summary ?? ""}${draft.explanation ?? ""}`)],
    ["deep_analysis", Boolean(draft.analysis && Object.keys(draft.analysis).length >= 3)],
  ] as const;
  const failed = qualitySignals.filter(([, passed]) => !passed).map(([name]) => name);
  const answerConflict = Boolean(draft.analysis && String(draft.analysis.answerConflict ?? "") === "ANSWER_CONFLICT");
  return { passed: failed.length === 0 && !answerConflict, failed, answerConflict, duplicateOptions, duplicateQuestion, score: Math.round((qualitySignals.filter(([, passed]) => passed).length / qualitySignals.length) * 100), checks: Object.fromEntries(qualitySignals) };
}

export async function generateExamQuestion(params: { requirements: ExamGenerationRequirements; itemIndex: number; candidates: Array<Record<string, unknown>>; materialText: string; userId: string; sourcePolicy: Record<string, unknown> }) {
  const { requirements, itemIndex, candidates, materialText, userId, sourcePolicy } = params;
  const candidateText = candidates.length ? candidates.map((item, index) => `${index + 1}. ${String(item.stem ?? "")}｜答案：${JSON.stringify(item.answer ?? [])}`).join("\n") : "（沒有可引用的既有題目）";
  const prompt = `你是 StudyNova 段考命題與品質審查專家。這是第 ${itemIndex + 1} 題，必須依正式範圍命題，不得把干擾選項當正式範圍。\n正式範圍：${JSON.stringify(requirements)}\n來源策略：${JSON.stringify(sourcePolicy)}\n可引用總題庫題目（只能引用、改寫或避開重複，不可假造來源）：\n${candidateText.slice(0, 12000)}\n上傳材料（只可使用提供內容）：\n${materialText.slice(0, 12000)}\n${subjectStrategy(requirements.subject)}\n請生成一題真正對應範圍的題目。選擇題至少四個自然且合理的選項，不能只是同義詞替換，不能重複，不能有明顯答案提示。英文題必須填 acceptedAnswers、synonyms、variants、acceptableTranslations；中文翻譯不能只接受單一固定答案。請為本題個別深度分析，不得使用通用模板：數學必須分析公式、步驟、計算、驗算與常見錯誤；英文分析文法、語境、詞性、搭配、干擾選項；自然分析概念、原理、因果、實驗或圖表；社會分析歷史／地理／公民資料；國文分析字詞、文意、修辭或閱讀理解。若題庫答案與獨立推導答案衝突，analysis.answerConflict 必須為 ANSWER_CONFLICT，絕對不要覆蓋既有答案。只輸出 JSON。`;
  const response = await runAiJson<Partial<ExamQuestionDraft>>({
    feature: "exam_question_generation",
    userId,
    system: "你負責產生待管理員審核的段考題目，絕不發布。輸出必須是合法 JSON。",
    parts: [{ kind: "text", text: prompt }],
    maxOutputTokens: 2600,
    temperature: 0.25,
  }, {});
  const draft = { ...response.data, sourceType: response.data.sourceType || "ai_generated", sourceMetadata: { ...(response.data.sourceMetadata ?? {}), provider: response.meta.provider, model: response.meta.model, itemIndex } };
  const quality = qualityCheckDraft(draft, requirements, candidates.map((item) => String(item.stem ?? "")));
  return { draft, quality, provider: response.meta.provider, model: response.meta.model };
}
