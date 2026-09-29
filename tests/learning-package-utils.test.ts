import { describe, expect, it } from "vitest";
import { normalizePackageOutput, packageProgress } from "@/server/learning-package-utils";

describe("learning package output helpers", () => {
  it("normalizes missing or malformed AI output to empty arrays instead of fake content", () => {
    expect(normalizePackageOutput(null)).toEqual({ summary: "", keyPoints: [], vocabulary: [], questions: [] });
    expect(normalizePackageOutput({ keyPoints: ["  重點一  ", 4], vocabulary: [{ word: "  ", meaning: "空白" }, { word: "focus", meaning: "專注" }], questions: [{ stem: "無答案" }, { stem: "題目", options: [" A ", null], answer: "A" }] })).toEqual({
      summary: "",
      keyPoints: ["重點一"],
      vocabulary: [{ word: "focus", meaning: "專注", partOfSpeech: "", example: "", exampleZh: "" }],
      questions: [{ stem: "題目", options: ["A"], answer: ["A"], explanation: "", type: "single" }],
    });
  });

  it("calculates progress only from persisted completed steps", () => {
    const steps = ["notes", "key_points", "vocabulary", "quiz", "flashcards", "review"];
    expect(packageProgress(steps, {})).toBe(0);
    expect(packageProgress(steps, { notes: { completedAt: "now" } })).toBe(17);
    expect(packageProgress(steps, { notes: { completedAt: "now" }, key_points: { completedAt: "now" }, vocabulary: { completedAt: "now" } })).toBe(50);
    expect(packageProgress(steps, Object.fromEntries(steps.map((step) => [step, { completedAt: "now" }])))).toBe(100);
    expect(packageProgress([], {})).toBe(0);
  });
});
