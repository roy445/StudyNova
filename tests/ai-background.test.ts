import { describe, expect, it } from "vitest";
import { classifyAiBackgroundError, retryDelayMs } from "@/server/ai-background";

describe("AI background job retry policy", () => {
  it("retries rate limits, server failures, timeout and network errors", () => {
    expect(classifyAiBackgroundError(new Error("HTTP 429 from provider")).retryable).toBe(true);
    expect(classifyAiBackgroundError(new Error("HTTP 503 service unavailable")).retryable).toBe(true);
    expect(classifyAiBackgroundError(new Error("request timeout")).retryable).toBe(true);
    expect(classifyAiBackgroundError(new Error("ECONNRESET")).retryable).toBe(true);
  });

  it("does not retry client or authorization errors", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const result = classifyAiBackgroundError(new Error(`HTTP ${status}`));
      expect(result.retryable, `HTTP ${status}`).toBe(false);
      expect(result.code).toBe(`HTTP_${status}`);
    }
  });

  it("uses bounded exponential backoff", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(8)).toBe(128_000);
    expect(retryDelayMs(99)).toBe(128_000);
  });
});
