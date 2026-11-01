import { describe, expect, it } from "vitest";
import { categorizeProviderResponse, providerRetryDelayMs } from "../src/server/ai";
import { draftQualityGate } from "../src/server/exam-prep-draft-analysis";

const draft = {
  subject: "英文",
  type: "single",
  stem: "Choose the correct answer.",
  options: ["A", "B", "C", "D"],
  answer: ["B"],
  explanation: "",
};

describe("AI provider resilience", () => {
  it("classifies timeout, rate limit, and gateway failures separately", () => {
    expect(categorizeProviderResponse(429, "too many requests")).toBe("rate_limited");
    expect(categorizeProviderResponse(429, "quota exceeded")).toBe("quota_exhausted");
    expect(categorizeProviderResponse(502, "bad gateway")).toBe("bad_gateway");
    expect(categorizeProviderResponse(503, "temporarily unavailable")).toBe("service_unavailable");
    expect(categorizeProviderResponse(504, "gateway timeout")).toBe("gateway_timeout");
  });

  it("uses bounded exponential backoff with jitter", () => {
    expect(providerRetryDelayMs(0, () => 0)).toBe(263);
    expect(providerRetryDelayMs(1, () => 1)).toBe(875);
    expect(providerRetryDelayMs(20, () => 0.5)).toBe(4000);
  });

  it("keeps the fallback contract strict when a generated answer is incomplete", () => {
    const result = draftQualityGate(draft, {
      understanding: "這題要判斷句子的正確用法。",
      verifiedAnswer: ["B"],
      approach: "逐一檢查每個選項的文法與語意。",
      detailedExplanation: "B 符合題幹要求，其他選項在語意或文法上不符合。",
      optionAnalysis: [{ option: "B", reason: "符合題意。" }],
      coreConcept: "英文句型與語意判斷。",
      commonErrors: ["只看單字而忽略句意。"],
      memoryTip: "先讀完整句子再判斷。",
    });
    expect(result.passed).toBe(false);
    expect(result.failed).toContain("hasOptionAnalysis");
    expect(result.answerConflict).toBe(false);
  });
});
