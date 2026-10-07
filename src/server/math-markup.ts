/** Convert common Markdown/LaTeX math delimiters into readable plain-text math for exports. */
export function normalizeMathMarkup(input: string): string {
  let text = input.replace(/\r/g, "");

  // Common commands that have a clear plain-text or Unicode equivalent.
  const replacements: Array<[RegExp, string]> = [
    [/\\times\b/g, "×"],
    [/\\cdot\b/g, "·"],
    [/\\leq?\b/g, "≤"],
    [/\\geq?\b/g, "≥"],
    [/\\neq\b/g, "≠"],
    [/\\pm\b/g, "±"],
    [/\\to\b/g, "→"],
    [/\\Rightarrow\b/g, "⇒"],
    [/\\Leftrightarrow\b/g, "⇔"],
    [/\\log\b/g, "log"],
    [/\\ln\b/g, "ln"],
    [/\\sqrt\s*\{([^{}]*)\}/g, "√($1)"],
    [/\\text\s*\{([^{}]*)\}/g, "$1"],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);

  // Make grouped powers/subscripts readable without exposing TeX braces.
  text = text.replace(/\^\s*\{([^{}]*)\}/g, "^($1)");
  text = text.replace(/_\s*\{([^{}]*)\}/g, "_($1)");

  // Remove inline/display math delimiters and any remaining TeX grouping braces.
  text = text.replace(/\${1,2}/g, "").replace(/[{}]/g, "");
  text = text.replace(/\\/g, "");

  // A frequent malformed AI identity: the base is lost before ^{log_a b}.
  text = text.replace(/(^|\n)\s*-\s*\^\s*\(?\s*log_a\s*b\s*\)?\s*=\s*b\s*(?=\n|$)/gi, "$1- a^(log_a b) = b");

  // Avoid the awkward dangling dash produced when a malformed formula starts with it.
  text = text.replace(/(^|\n)-\s{2,}(?=\^|log\b)/g, "$1");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
