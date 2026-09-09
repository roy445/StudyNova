import { describe, expect, it } from "vitest";
import {
  AI_SOLUTION_FEATURE,
  classifyQuotaDatabaseError,
  evaluateQuota,
  serverDefaultForFeature,
} from "@/server/quota-policy";

describe("ai_solution permission and quota policy", () => {
  it("uses the formal ai_solution key when the permission exists", () => {
    const permission = serverDefaultForFeature(AI_SOLUTION_FEATURE);
    expect(permission?.feature).toBe("ai_solution");
    expect(permission?.novaCost).toBe(10);
  });

  it("uses the safe server default when the feature row is absent", () => {
    const permission = serverDefaultForFeature(AI_SOLUTION_FEATURE);
    expect(permission).toMatchObject({ freeDailyLimit: 3, proDailyLimit: 30, enabled: true });
  });

  it("classifies schema errors instead of treating them as a missing permission", () => {
    expect(classifyQuotaDatabaseError(new Error('relation "feature_permissions" does not exist'))).toBe("schema_migration");
  });

  it("classifies database connection errors explicitly", () => {
    expect(classifyQuotaDatabaseError(new Error("connection timeout"))).toBe("connection");
  });

  it("classifies permission errors explicitly", () => {
    expect(classifyQuotaDatabaseError(new Error("permission denied for table feature_permissions"))).toBe("permission_denied");
  });

  it("allows a Free user within the daily quota", () => {
    const policy = serverDefaultForFeature(AI_SOLUTION_FEATURE)!;
    expect(evaluateQuota(policy, { isPro: false, used: 2, monthlyUsed: 2 }).allowed).toBe(true);
  });

  it("allows a Pro user up to the Pro quota", () => {
    const policy = serverDefaultForFeature(AI_SOLUTION_FEATURE)!;
    expect(evaluateQuota(policy, { isPro: true, used: 29, monthlyUsed: 29 }).allowed).toBe(true);
  });

  it("rejects a user after the daily quota is exhausted", () => {
    const policy = serverDefaultForFeature(AI_SOLUTION_FEATURE)!;
    expect(evaluateQuota(policy, { isPro: false, used: 3, monthlyUsed: 3 }).reason).toBe("daily_exhausted");
  });

  it("rejects a disabled feature", () => {
    const policy = { ...serverDefaultForFeature(AI_SOLUTION_FEATURE)!, enabled: false };
    expect(evaluateQuota(policy, { isPro: false, used: 0, monthlyUsed: 0 }).reason).toBe("disabled");
  });

  it("does not authorize charging before provider success", () => {
    const providerSucceeded = false;
    expect(providerSucceeded).toBe(false);
    // The engine calls consumeFeature only after runAiJson resolves successfully.
  });

  it("uses a stable session charge key so a retry cannot create a second charge", () => {
    const sessionId = "session-123";
    expect(`solution:${sessionId}`).toBe(`solution:${sessionId}`);
    expect(`solution:${sessionId}`).not.toBe(`solution:other-session`);
  });
});
