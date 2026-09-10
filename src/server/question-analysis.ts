import type { questions } from "@/db/schema";

export type QuestionRow = typeof questions.$inferSelect;

export type AnalysisResult = {
  understanding: string;
  answer: string;
  approach: string;
  detailedExplanation: string;
  optionAnalysis: Array<{ option: string; reason: string }>;
  coreConcept: string;
  commonErrors: string[];
  memoryTip: string;
  subjectTemplate: string;
};

export function analysisPrompt(question: QuestionRow) {
  const options = question.options.length ? question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n") : "（無選項）";
  const template = question.subject.includes("數") ? "數學：已知條件、求什麼、公式、計算步驟、中間結果、最終答案、檢查、常見錯誤" : question.subject.includes("英") ? "英文：關鍵單字、文法、句型、上下文、正確答案、其他選項錯誤原因" : question.subject.includes("國") ? "國文：文意、關鍵字、修辭／寫作手法、上下文、選項判斷" : question.subject.includes("自然") ? "自然：科學概念、已知條件、圖表／實驗判讀、推理、計算、結論" : question.subject.includes("社會") ? "社會：歷史背景／地理條件／公民概念、關鍵資訊、因果、選項比較" : "依題目實際學科與題型選擇必要分析欄位";
  return `請逐題分析以下題目，不得使用通用模板敷衍，也不得只複製題庫答案。先獨立理解題意並驗證答案，再產生解析。\n學科分析模板：${template}\n題型：${question.type}\n題目：${question.stem}\n選項：\n${options}\n題庫答案：${question.answer.join("、") || "未提供，請標記答案待確認"}\n\n只回傳 JSON：{"understanding":"題目在問什麼","answer":"獨立驗證後的答案；無法確認時寫待確認","approach":"解題思路與步驟","detailedExplanation":"完整且對應本題的解析","optionAnalysis":[{"option":"A","reason":"為什麼對或錯"}],"coreConcept":"核心觀念","commonErrors":["本題常見錯誤"],"memoryTip":"記憶方法","subjectTemplate":"本題實際使用的分析模板"}`;
}

export function qualityGate(result: Partial<AnalysisResult>, question: QuestionRow) {
  const checks = {
    hasAnswer: Boolean(result.answer?.trim()),
    hasApproach: Boolean(result.approach && result.approach.trim().length >= 12),
    hasExplanation: Boolean(result.detailedExplanation && result.detailedExplanation.trim().length >= 24),
    hasCoreConcept: Boolean(result.coreConcept?.trim()),
    hasErrorAnalysis: Array.isArray(result.commonErrors) && result.commonErrors.length > 0,
    correspondsToQuestion: Boolean(question.stem && result.understanding && result.understanding.trim().length >= 12),
    noEmptyOptionReasons: !Array.isArray(result.optionAnalysis) || result.optionAnalysis.every((item) => item.option && item.reason?.trim()),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { passed: failed.length === 0, checks, failed, score: Math.round((Object.values(checks).filter(Boolean).length / Object.values(checks).length) * 100) };
}
