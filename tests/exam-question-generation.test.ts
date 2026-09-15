import { describe, expect, it } from "vitest";
import { qualityCheckDraft } from "../src/server/exam-question-generation";

const requirements = { educationLevel: "senior", schoolName: "", grade: 1, subject: "英文", examNumber: "第一次段考", chapters: [], units: ["Unit 1"], vocabularyRange: [], questionTypes: ["single"], difficulty: "normal" };

describe("exam question generation quality gate", () => {
  it("rejects duplicated choices and missing deep analysis", () => {
    const result = qualityCheckDraft({ subject: "英文", type: "single", stem: "Choose the best answer.", options: ["go", "go", "leave", "stay"], answer: ["go"], explanation: "Explanation", learningPoint: "Context", analysis: {} }, requirements);
    expect(result.passed).toBe(false);
    expect(result.failed).toContain("options_unique");
    expect(result.failed).toContain("deep_analysis");
  });
  it("accepts a scoped, individually analyzed question", () => {
    const result = qualityCheckDraft({ subject: "英文", type: "single", stem: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], answer: ["goes"], explanation: "The third-person singular subject requires goes.", learningPoint: "Subject-verb agreement", analysis: { grammar: "present simple", context: "habit", optionAnalysis: ["go", "going", "gone"] }, difficulty: "normal" }, requirements);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
