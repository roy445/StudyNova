import { describe, expect, it } from "vitest";
import { compareSemVer, isValidSemVer, parseSemVer } from "@/lib/semver";

describe("SemVer helpers", () => {
  it("parses stable major.minor.patch versions", () => {
    expect(parseSemVer("1.5.0")).toEqual([1, 5, 0]);
    expect(isValidSemVer("0.0.1")).toBe(true);
  });

  it("compares all version components numerically", () => {
    expect(compareSemVer("1.10.0", "1.9.9")).toBe(1);
    expect(compareSemVer("2.0.0", "2.0.1")).toBe(-1);
    expect(compareSemVer("1.2.3", "1.2.3")).toBe(0);
  });

  it("rejects malformed versions, leading zeroes and unsafe integer components", () => {
    for (const value of ["1.2", "v1.2.3", "01.2.3", "1.2.3-beta", "99999999999999999999.0.0", ""]) {
      expect(isValidSemVer(value)).toBe(false);
    }
    expect(() => compareSemVer("bad", "1.0.0")).toThrow(TypeError);
  });
});
