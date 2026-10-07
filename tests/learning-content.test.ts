import { describe, expect, it } from "vitest";
import { learningCurriculum, learningSubjects, mathChapter, mathLessons } from "@/content/learning/ch1";

describe("高中數學常用對數線上課程", () => {
  it("在學習專區中已公開高中數學", () => {
    expect(learningSubjects.find((subject) => subject.slug === "math")).toMatchObject({
      status: "PUBLISHED",
      title: "高中數學",
    });
    expect(learningCurriculum.math.chapter).toEqual(mathChapter);
  });

  it("包含四個按講義範圍拆分的學習單元", () => {
    expect(mathLessons).toHaveLength(4);
    expect(mathLessons.map((lesson) => lesson.title)).toEqual([
      "科學記號、有效數字與位數",
      "常用對數的定義與計算機",
      "對數的運算與方程式",
      "常用對數的生活與科學應用",
    ]);
    expect(mathLessons.every((lesson) => lesson.details.length >= 3)).toBe(true);
    expect(mathLessons.every((lesson) => lesson.sourcePages.length > 0)).toBe(true);
  });

  it("每節都有重點、公式、常見錯誤與隨堂題", () => {
    for (const lesson of mathLessons) {
      expect(lesson.concepts.length).toBeGreaterThanOrEqual(3);
      expect(lesson.formulas.length).toBeGreaterThanOrEqual(2);
      expect(lesson.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(lesson.quiz.options).toHaveLength(4);
      expect(lesson.quiz.answer).toBeGreaterThanOrEqual(0);
      expect(lesson.quiz.answer).toBeLessThan(lesson.quiz.options.length);
    }
  });
});
