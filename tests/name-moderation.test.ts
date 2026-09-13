import { describe, expect, it } from "vitest";
import { checkDisplayName } from "@/server/name-moderation";

describe("display name moderation", () => {
  it("rejects common Chinese and English profanity", () => {
    expect(checkDisplayName("他媽的學生").ok).toBe(false);
    expect(checkDisplayName("f.u.c.k").ok).toBe(false);
  });
  it("rejects leetspeak and contact links", () => {
    expect(checkDisplayName("f4ck").ok).toBe(false);
    expect(checkDisplayName("https://example.com").ok).toBe(false);
  });
  it("accepts ordinary multilingual names", () => {
    expect(checkDisplayName("王小明").ok).toBe(true);
    expect(checkDisplayName("Élodie Chen").ok).toBe(true);
  });
});
