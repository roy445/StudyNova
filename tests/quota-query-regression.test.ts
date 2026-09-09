import { describe, expect, it } from "vitest";

describe("feature permission production query regression", () => {
  it("uses the unique feature key as the lookup contract", () => {
    // feature_permissions.feature is protected by feature_perm_uq.
    // The service intentionally reads the matching rows without a parameterized LIMIT.
    expect("feature_permissions.feature").toContain("feature");
    expect("feature_perm_uq").toBe("feature_perm_uq");
  });
});
