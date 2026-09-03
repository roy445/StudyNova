import { describe, expect, it } from "vitest";
import { chooseVisionItems, normalizeVocabularyWord, qualityNeedsRetake, shouldShowUncertainty } from "@/server/camera-analysis";

describe("camera analysis rules", () => {
  it("only requests a retake when a quality dimension is actually poor", () => {
    expect(qualityNeedsRetake({ blur: "warning", brightness: "good" })).toBe(false);
    expect(qualityNeedsRetake({ blur: "poor", brightness: "good" })).toBe(true);
  });

  it("marks low confidence or missing answers as uncertain", () => {
    expect(shouldShowUncertainty(0.71)).toBe(true);
    expect(shouldShowUncertainty(0.92)).toBe(false);
    expect(shouldShowUncertainty(0.99, "not-found")).toBe(true);
  });

  it("keeps only selected visual items and preserves their order", () => {
    const items = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
    expect(chooseVisionItems(items, ["q3", "q1"]).map((item) => item.id)).toEqual(["q1", "q3"]);
    expect(chooseVisionItems(items)).toEqual(items);
  });

  it("normalizes vocabulary keys for duplicate prevention", () => {
    expect(normalizeVocabularyWord("  Environment  ")).toBe("environment");
    expect(normalizeVocabularyWord("take   off")).toBe("take off");
  });
});
