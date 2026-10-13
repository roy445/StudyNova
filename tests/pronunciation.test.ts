import { describe, expect, it } from "vitest";
import { normalizeKkPhonetic } from "../src/server/pronunciation";

describe("KK pronunciation normalisation", () => {
  it("keeps valid Unicode KK/IPA symbols", () => {
    expect(normalizeKkPhonetic("[ˈæpəl]")).toBe("[ˈæpəl]");
    expect(normalizeKkPhonetic("/kæt/")).toBe("/kæt/");
  });

  it("removes common labels without damaging the pronunciation", () => {
    expect(normalizeKkPhonetic("KK 音標：[ˈæpəl]")).toBe("[ˈæpəl]");
    expect(normalizeKkPhonetic("pronunciation: /kæt/")).toBe("/kæt/");
  });

  it("rejects mojibake, replacement characters, and uncertain output", () => {
    expect(normalizeKkPhonetic("Ã¦pÉ™l")).toBe("");
    expect(normalizeKkPhonetic("[�æpəl]")).toBe("");
    expect(normalizeKkPhonetic("待確認")).toBe("");
    expect(normalizeKkPhonetic("\\u02C8æpəl")).toBe("");
  });

  it("does not allow a CJK explanation to appear as pronunciation", () => {
    expect(normalizeKkPhonetic("蘋果的音標是 [ˈæpəl]")).toBe("");
  });
});
