"use client";

import React from "react";

const SUBSCRIPT: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ" };
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };

function cleanFormula(value: string) {
  return value
    .replace(/\$/g, "")
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1⁄$2)")
    .replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g, "$1√($2)")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
    .replace(/\\(?:text|mathrm|textrm|mbox)\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:ext|ce)\{([^{}]*)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\longrightarrow/g, "⟶")
    .replace(/\\pm/g, "±")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\infty/g, "∞")
    .replace(/\\pi/g, "π")
    .replace(/\\(?:alpha|Α)/g, "α")
    .replace(/\\(?:beta|Β)/g, "β")
    .replace(/\\(?:gamma|Γ)/g, "γ")
    .replace(/\\(?:delta|Δ)/g, "δ")
    .replace(/\\(?:theta|Θ)/g, "θ")
    .replace(/\\(?:lambda|Λ)/g, "λ")
    .replace(/\\(?:mu|Μ)/g, "μ")
    .replace(/\\(?:sigma|Σ)/g, "σ")
    .replace(/\\(?:omega|Ω)/g, "ω")
    .replace(/\\(sin|cos|tan|log|ln|lim)\b/g, "$1")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/_\{([^{}]+)\}/g, "_$1")
    .replace(/[{}]/g, "");
}

function convertMarks(value: string) {
  return cleanFormula(value)
    .replace(/_([0-9A-Za-z()+=[\]-]+)/g, (_, chars: string) => [...chars].map((char) => SUBSCRIPT[char] ?? char).join(""))
    .replace(/\^([0-9A-Za-z()+=[\]-]+)/g, (_, chars: string) => [...chars].map((char) => SUPERSCRIPT[char] ?? char).join(""));
}

function InlineText({ value }: { value: string }) {
  const tokens = value.split(/(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)]*\\\)|\\\[[^\]]*\\\])/g).filter(Boolean);
  return <>{tokens.map((token, index) => {
    const isMath = (token.startsWith("$") && token.endsWith("$")) || (token.startsWith("\\(") && token.endsWith("\\)")) || (token.startsWith("\\[") && token.endsWith("\\]"));
    const raw = isMath ? token.replace(/^\$\$?|\$\$?$|^\\\(|\\\)$|^\\\[|\\\]$/g, "") : token;
    return <React.Fragment key={index}>{convertMarks(raw)}</React.Fragment>;
  })}</>;
}

export function ChatRichText({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\\r\\n/g, "\n").split("\n");
  return <div className={`whitespace-pre-wrap break-words ${className}`}>{lines.map((line, index) => {
    const match = line.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
    const text = match ? match[3] : line;
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    const rendered = boldParts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex}><InlineText value={part.slice(2, -2)} /></strong> : <InlineText key={partIndex} value={part} />);
    return <div key={index} className={match ? "pl-4 before:mr-2 before:text-[#7dd3fc] before:content-['•']" : undefined}>{rendered}</div>;
  })}</div>;
}

export default ChatRichText;
