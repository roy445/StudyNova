import { describe, expect, it } from "vitest";
import { cleanItems, DEFAULT_CONVERTER_CONFIG } from "@/server/ai-question-converter";

describe("AI question converter quality gate", () => {
  const base = { ordinal: 1, pageNumber: 2, type: "single" as const, stem: "Which word is correct?", options: ["A", "B", "C", "D"], answer: ["A"], originalExplanation: "官方解答：A", aiExplanation: "", skipReason: "", sourceText: "Question 1", confidence: 0.95 };
  it("keeps a reliable objective question", () => {
    const [item] = cleanItems([base], DEFAULT_CONVERTER_CONFIG.allowedTypes, 100);
    expect(item.status).toBe("interactive");
    expect(item.answer).toEqual(["A"]);
  });
  it("skips questions without an answer instead of guessing", () => {
    const [item] = cleanItems([{ ...base, answer: [] }], DEFAULT_CONVERTER_CONFIG.allowedTypes, 100);
    expect(item.status).toBe("skipped");
    expect(item.skipReason).toContain("答案");
  });
  it("skips image and written questions", () => {
    const [image, written] = cleanItems([
      { ...base, ordinal: 2, type: "image_question", confidence: 0.99 },
      { ...base, ordinal: 3, type: "essay", confidence: 0.99 },
    ], DEFAULT_CONVERTER_CONFIG.allowedTypes, 100);
    expect(image.skipReason).toContain("圖片");
    expect(written.skipReason).toContain("簡答");
  });
  it("skips low-confidence OCR", () => {
    const [item] = cleanItems([{ ...base, confidence: 0.4 }], DEFAULT_CONVERTER_CONFIG.allowedTypes, 100);
    expect(item.status).toBe("skipped");
    expect(item.skipReason).toContain("信心");
  });
  it("enforces the administrator maximum question count", () => {
    const items = cleanItems([base, { ...base, ordinal: 2 }], DEFAULT_CONVERTER_CONFIG.allowedTypes, 1);
    expect(items).toHaveLength(1);
  });
});
