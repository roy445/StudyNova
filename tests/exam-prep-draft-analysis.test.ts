import { describe, expect, it } from "vitest";
import { draftQualityGate } from "../src/server/exam-prep-draft-analysis";

const baseDraft = {
  subject: "數學",
  type: "single",
  stem: "若 x + 1 = 2，x 為何？",
  options: ["0", "1", "2", "3"],
  answer: ["B"],
  explanation: "",
};

const goodAnalysis = {
  understanding: "題目要求解出一次方程式的未知數。",
  verifiedAnswer: ["1"],
  answerReason: "兩邊同減 1 可得 x = 1。",
  approach: "先將等式兩邊同時減去 1，再檢查答案。",
  detailedExplanation: "x + 1 = 2，兩邊同時減去 1，因此 x = 1；代回原式可驗證 1 + 1 = 2。",
  optionAnalysis: ["0", "1", "2", "3"].map((option) => ({ option, reason: option === "1" ? "符合推導結果。" : "代回原式不成立。" })),
  coreConcept: "一次方程式的等式運算。",
  commonErrors: ["忘記將常數項移項。"],
  memoryTip: "等式兩邊要做相同運算。",
};

describe("exam prep draft analysis quality gate", () => {
  it("treats option letter and full option text as the same answer", () => {
    const result = draftQualityGate(baseDraft, goodAnalysis);
    expect(result.answerConflict).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("blocks an independently verified conflicting answer", () => {
    const result = draftQualityGate(baseDraft, { ...goodAnalysis, verifiedAnswer: ["C"] });
    expect(result.answerConflict).toBe(true);
    expect(result.failed).toContain("noAnswerConflict");
    expect(result.passed).toBe(false);
  });

  it("blocks missing explanation and option analysis", () => {
    const result = draftQualityGate(baseDraft, { ...goodAnalysis, detailedExplanation: "", optionAnalysis: [] });
    expect(result.passed).toBe(false);
    expect(result.failed).toContain("hasExplanation");
    expect(result.failed).toContain("hasOptionAnalysis");
  });
});
