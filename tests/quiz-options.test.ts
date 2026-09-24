import { describe, expect, it } from "vitest";
import { normalizeQuizOption, validateEnglishQuizOptions, validateQuizOptionPool } from "../src/server/routes/quiz-routes";

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

  it("requires four unique options and exactly one answer for English questions", () => {
    expect(validateEnglishQuizOptions([
      { type: "single", stem: "The company plans to ___ its business.", options: ["expand", "extend", "expose", "expect"], answer: ["expand"] },
      { type: "single", stem: "If I ___ about it, I would have told you.", options: ["know", "knew", "had known", "have known"], answer: ["had known"] },
    ]).valid).toBe(true);

    const invalid = validateEnglishQuizOptions([
      { type: "single", stem: "Choose a word.", options: ["go", "went", "go", "gone"], answer: ["go", "went"] },
    ]);
    expect(invalid.valid).toBe(false);
    expect(invalid.invalidQuestionIndexes).toEqual([0]);
  });

  it("rejects reusing the same complete option combination across questions", () => {
    const result = validateEnglishQuizOptions([
      { stem: "1", options: ["expand", "extend", "expose", "expect"], answer: ["expand"] },
      { stem: "2", options: ["expect", "expand", "extend", "expose"], answer: ["expect"] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.duplicateOptionSetIndexes).toEqual([0, 1]);
  });
});
