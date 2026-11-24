import { describe, expect, it } from "vitest";
import { evaluateQuota, serverDefaultForFeature } from "@/server/quota-policy";

describe("essay grading quota policy", () => {
  const policy = serverDefaultForFeature("essay_grading")!;

  it("uses the confirmed Free, Pro, and Nova overage rules", () => {
    expect(policy).toMatchObject({
      freeDailyLimit: 1,
      proDailyLimit: 5,
      monthlyLimit: -1,
      novaCost: 50,
      enabled: true,
    });
  });

  it("allows the first Free grading and blocks the next daily quota unit", () => {
    expect(evaluateQuota(policy, { isPro: false, used: 0, monthlyUsed: 0 })).toMatchObject({ allowed: true, remaining: 0, monthlyLimit: -1 });
    expect(evaluateQuota(policy, { isPro: false, used: 1, monthlyUsed: 1 })).toMatchObject({ allowed: false, reason: "daily_exhausted", monthlyLimit: -1 });
  });

  it("allows five Pro gradings and does not impose an extra monthly cap", () => {
    expect(evaluateQuota(policy, { isPro: true, used: 4, monthlyUsed: 120 })).toMatchObject({ allowed: true, remaining: 0, monthlyLimit: -1 });
    expect(evaluateQuota(policy, { isPro: true, used: 5, monthlyUsed: 121 })).toMatchObject({ allowed: false, reason: "daily_exhausted", monthlyLimit: -1 });
  });
});
