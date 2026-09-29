import { describe, expect, it } from "vitest";
import { inferSpeechLanguage, splitSpeechText } from "@/lib/browser-speech";

describe("browser speech helpers", () => {
  it("infers Chinese, Russian, and English from lesson text", () => {
    expect(inferSpeechLanguage("這是一段課文" )).toBe("zh-TW");
    expect(inferSpeechLanguage("Это урок русского языка")).toBe("ru-RU");
    expect(inferSpeechLanguage("This is an English lesson.")).toBe("en-US");
  });

  it("splits long passages into bounded chunks without losing words", () => {
    const text = "This is a long English lesson with several sentences. It should be split near natural word boundaries without losing text.";
    const chunks = splitSpeechText(text, 24);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 24)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/gu, " ").trim()).toBe(text);
  });

  it("splits CJK text by code points and normalizes line endings", () => {
    const text = "課文第一段。課文第二段！";
    const chunks = splitSpeechText(text, 5);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 5)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  it("rejects an invalid chunk size", () => {
    expect(() => splitSpeechText("text", 0)).toThrow(RangeError);
  });
});
