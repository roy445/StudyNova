import { describe, expect, it } from "vitest";
import { normalizeQuizOption, validateQuizOptionPool } from "../src/server/routes/quiz-routes";

describe("quiz option diversity", () => {
  it("normalizes case, whitespace, punctuation, and full-width text", () => {
    expect(normalizeQuizOption("  BEAUTIFUL! ")).toBe("beautiful");
    expect(normalizeQuizOption("ｄｉｆｆｉｃｕｌｔ")).toBe("difficult");
  });

  it("counts all options across the complete quiz and detects same-question duplicates", () => {
    const result = validateQuizOptionPool([
      { stem: "1", answer: ["difficult"], options: ["difficult", "easy", "simple", "hard"] },
      { stem: "2", answer: ["complex"], options: ["difficult", "complicated", "easy", "complex"] },
      { stem: "3", answer: ["challenging"], options: ["hard", "difficult", "simple", "challenging"] },
    ]);
    expect(result.totalOptions).toBe(12);
    expect(result.uniqueOptions).toBe(7);
    expect(result.optionUsageCount.difficult).toBe(3);
    expect(result.optionUsageCount.easy).toBe(2);
    expect(result.repeatedOccurrences).toBe(5);
    expect(result.excessiveCrossQuestionDuplicates).toBe(true);
    expect(result.sameQuestionDuplicate).toBe(false);
  });

  it("flags duplicates inside one question even when the quiz pool is small", () => {
    const result = validateQuizOptionPool([{ stem: "1", answer: ["clean"], options: ["clean", "dirty", "CLEAN", "large"] }]);
    expect(result.sameQuestionDuplicate).toBe(true);
    expect(result.duplicateQuestionIndexes).toEqual([0]);
  });
});
