import { describe, expect, it } from "vitest";
import { isCorrect } from "@/server/routes/quiz-routes";

describe("quiz answer matching", () => {
  const options = ["第一個選項", "第二個選項", "第三個選項", "第四個選項"];

  it("accepts a submitted C when the stored answer is the full third option", () => {
    expect(isCorrect("single", [options[2]], ["C"], options)).toBe(true);
  });

  it("accepts a full option when the stored answer is C", () => {
    expect(isCorrect("single", ["C"], [options[2]], options)).toBe(true);
  });

  it("accepts 1-based option numbers", () => {
    expect(isCorrect("single", ["C"], ["3"], options)).toBe(true);
  });

  it("compares multiple-choice answers as a set of option positions", () => {
    expect(isCorrect("multiple", ["A", options[2]], [options[0], "C"], options)).toBe(true);
    expect(isCorrect("multiple", ["A", options[2]], ["A"], options)).toBe(false);
  });
});
