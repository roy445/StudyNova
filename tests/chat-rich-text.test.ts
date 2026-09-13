import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRichText } from "@/components/ChatRichText";

describe("ChatRichText chemistry formulas", () => {
  it("renders LaTeX-like chemistry as Unicode marks without dollar signs", () => {
    const html = renderToStaticMarkup(React.createElement(ChatRichText, { content: "水是 $H_2O$，二氧化碳是 $CO_2$，臭氧是 $O_3$，硫酸根是 $SO_4^{2-}$。" }));
    expect(html).toContain("H₂O");
    expect(html).toContain("CO₂");
    expect(html).toContain("O₃");
    expect(html).toContain("SO₄²⁻");
    expect(html).not.toContain("$");
  });

  it("renders common mathematics without raw LaTeX commands", () => {
    const html = renderToStaticMarkup(React.createElement(ChatRichText, { content: "公式：\\frac{a}{b}、\\sqrt{x}、x^2、\\pi、\\leq、\\sin θ。" }));
    expect(html).toContain("a⁄b");
    expect(html).toContain("√(x)");
    expect(html).toContain("x²");
    expect(html).toContain("π");
    expect(html).toContain("≤");
    expect(html).not.toContain("\\frac");
    expect(html).not.toContain("\\sqrt");
  });
});
