import { describe, expect, it } from "vitest";
import { normalizeQuestionRows } from "../src/server/question-import";

describe("question import normalization", () => {
  it("accepts an array and aliases", () => {
    const result = normalizeQuestionRows([{ question: "2+2=?", choices: ["3", "4"], correctAnswer: "4", rationale: "計算" }]);
    expect(result.previews[0].status).toBe("READY");
    expect(result.previews[0].type).toBe("single");
  });
  it("accepts an object questions wrapper and infers multiple choice", () => {
    const result = normalizeQuestionRows({ questions: [{ stem: "選兩個", options: ["A", "B", "C"], answer: ["A", "C"], type: "multiple_choice" }] });
    expect(result.previews[0].type).toBe("multiple");
    expect(result.previews[0].answer).toEqual(["A", "C"]);
  });
  it("reports missing fields with index and field", () => {
    const result = normalizeQuestionRows([{ answer: "A" }, { question: "第二題" }]);
    expect(result.previews[0].issues.some((issue) => issue.code === "MISSING_STEM")).toBe(true);
    expect(result.previews[1].issues.some((issue) => issue.code === "MISSING_ANSWER")).toBe(true);
  });
  it("reports an answer outside the options", () => {
    const result = normalizeQuestionRows([{ question: "選擇", options: ["A", "B"], answer: "C" }]);
    expect(result.previews[0].status).toBe("ERROR");
    expect(result.previews[0].issues[0]?.code).toBe("ANSWER_NOT_IN_OPTIONS");
  });
  it("marks duplicates without failing unrelated questions", () => {
    const result = normalizeQuestionRows([{ question: "相同", answer: "答案" }, { question: "相同", answer: "答案" }, { question: "不同", answer: "答案" }]);
    expect(result.previews[1].issues.some((issue) => issue.code === "DUPLICATE_IN_FILE")).toBe(true);
    expect(result.previews[2].status).not.toBe("ERROR");
  });
  it("supports unicode, emoji, and formulas", () => {
    const result = normalizeQuestionRows([{ subject: "數學", question: "解方程式：x²＋π = 你好🚀", answer: "x" }]);
    expect(result.previews[0].stem).toContain("π");
    expect(result.previews[0].stem).toContain("🚀");
  });
});
