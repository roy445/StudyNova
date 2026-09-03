import { describe, expect, it } from "vitest";
import vocabulary from "@/data/vocabulary.json";

describe("PDF vocabulary catalog", () => {
  it("contains the junior and senior tracks", () => {
    const junior = vocabulary.filter((item) => item.track === "junior");
    const senior = vocabulary.filter((item) => item.track === "senior");
    expect(junior.length).toBeGreaterThan(1900);
    expect(senior.length).toBeGreaterThan(5900);
    expect(junior.every((item) => item.meaning.length > 0)).toBe(true);
    expect(senior.every((item) => item.word.length > 0 && item.partOfSpeech.length > 0)).toBe(true);
  });

  it("does not contain duplicate words inside a track", () => {
    const keys = vocabulary.map((item) => `${item.track}:${item.word}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
