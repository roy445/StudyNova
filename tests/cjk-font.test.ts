import { describe, expect, it } from "vitest";
import { runCjkHealth } from "@/server/cjk-health";
import { validateCjkFont } from "@/server/cjk-font";

describe("StudyNova CJK output system", () => {
  it("ships a readable Traditional Chinese font with required glyphs", () => {
    const health = validateCjkFont();
    expect(health.readable).toBe(true);
    expect(health.valid).toBe(true);
    expect(health.missingGlyphs).toEqual([]);
    expect(health.family).toContain("Noto Sans CJK TC");
  });

  it("renders Traditional Chinese through PDF, PNG and SVG paths", async () => {
    const health = await runCjkHealth();
    expect(health.healthy).toBe(true);
    expect(health.pdf.embedded).toBe(true);
    expect(health.image.rendered).toBe(true);
    expect(health.svg.embedded).toBe(true);
  }, 30_000);
});
