import { describe, expect, it } from "vitest";
import { normalizeMathMarkup } from "@/server/math-markup";

describe("math markup normalization", () => {
  it("removes dollar delimiters and converts common LaTeX commands", () => {
    expect(normalizeMathMarkup("若 $10^x = 5$，則 $x = \\log 5$。\na = b \\times 10^n，1 \\le b < 10")).toBe(
      "若 10^x = 5，則 x = log 5。\na = b × 10^n，1 ≤ b < 10",
    );
  });

  it("does not expose TeX braces or backslashes", () => {
    const output = normalizeMathMarkup("-$    ^{\\log_a b} = b$");
    expect(output).toBe("- a^(log_a b) = b");
    expect(output).not.toMatch(/[${}\\]/);
  });
});
