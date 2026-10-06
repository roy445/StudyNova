import { describe, expect, it } from "vitest";
import { runCjkHealth } from "@/server/cjk-health";
import { assertCjkGlyphCoverage, assertCjkPdfGlyphCoverage, assertMathGlyphCoverage, findMissingCjkGlyphs, sanitizeTextForCjkPdf, validateCjkFont } from "@/server/cjk-font";
import { VISUAL_NOTE_ICONS } from "@/lib/visual-note-icons";

describe("StudyNova CJK output system", () => {
  it("ships a readable Traditional Chinese font with required glyphs", () => {
    const health = validateCjkFont();
    expect(health.readable).toBe(true);
    expect(health.valid).toBe(true);
    expect(health.missingGlyphs).toEqual([]);
    expect(health.family).toContain("Noto Sans CJK TC");
    expect(findMissingCjkGlyphs(VISUAL_NOTE_ICONS.join(""))).toEqual([]);
    expect(findMissingCjkGlyphs("國\n文\t字")).toEqual([]);
    expect(findMissingCjkGlyphs("💡")).toEqual(["💡"]);
    expect(() => assertCjkGlyphCoverage("💡", "圖片文字")).toThrow(/U\+1F4A1/);
  });

  it("replaces unsupported AI PDF glyphs without changing supported text", () => {
    const mathText = "H₂O、x²、a₃、log₂x、√、∑、∫、≤、≥、∞、ⁿ";
    const result = sanitizeTextForCjkPdf(`💡 本次重點：${mathText} ✅`);
    expect(result.text).toBe(`提示 本次重點：${mathText} 完成`);
    expect(result.replaced).toEqual([
      { from: "💡", to: "提示" },
      { from: "✅", to: "完成" },
    ]);
    expect(() => assertCjkPdfGlyphCoverage(result.text, "AI PDF")).not.toThrow();
    expect(() => assertMathGlyphCoverage(mathText, "AI PDF 數學格式")).not.toThrow();
    expect(result.text).not.toContain("H2O");
    expect(result.text).not.toContain("x2");
    expect(result.text).toContain("log₂x");
  });

  it("renders Traditional Chinese through PDF, PNG and SVG paths", async () => {
    const health = await runCjkHealth();
    expect(health.healthy).toBe(true);
    expect(health.pdf.embedded).toBe(true);
    expect(health.image.rendered).toBe(true);
    expect(health.image.glyphRasterVerified).toBe(true);
    expect(health.image.distinctGlyphRasterChannels).toBeGreaterThan(0);
    expect(health.svg.embedded).toBe(true);
  }, 30_000);
});
