import { describe, expect, it } from "vitest";
import { validateTemplateStructure } from "../src/server/weekly-template-validation";

describe("weekly exam template validation", () => {
  const valid = {
    totalQuestions: 14,
    totalScore: 100,
    sections: [
      { key: "vocabulary", name: "Vocabulary", type: "vocabulary", questionCount: 8, percentage: 40, pointsPerQuestion: 5, questionLogic: "依本次 Unit 單字判斷詞義與語境" },
      { key: "cloze", name: "Sentence Cloze", type: "sentence_cloze", questionCount: 4, percentage: 40, pointsPerQuestion: 10, questionLogic: "依來源文章上下文與文法挖空" },
      { key: "translation", name: "Translation", type: "translation", questionCount: 2, percentage: 20, pointsPerQuestion: 10, questionLogic: "依本次句型、片語與文法中翻英" },
    ],
  };

  it("accepts dynamic structures without relying on a fixed Unit 2 format", () => {
    expect(validateTemplateStructure(valid)).toEqual([]);
    expect(validateTemplateStructure({ ...valid, totalQuestions: 10, sections: [{ ...valid.sections[0], questionCount: 10, percentage: 100, pointsPerQuestion: 10 }] })).toEqual([]);
  });

  it("rejects mismatched question counts, scores, and percentages", () => {
    const errors = validateTemplateStructure({ ...valid, totalQuestions: 13, totalScore: 90, sections: valid.sections.map((section) => ({ ...section, percentage: 30 })) });
    expect(errors).toEqual(expect.arrayContaining(["totalQuestions 不等於各大題 questionCount 總和", "各題配分總和不等於 totalScore", "各大題百分比總和必須為 100%"]));
  });

  it("rejects sections without actual question logic", () => {
    const errors = validateTemplateStructure({ ...valid, sections: [{ ...valid.sections[0], questionLogic: "" }, ...valid.sections.slice(1)] });
    expect(errors).toContain("第 1 大題缺少題型規則");
  });
});
