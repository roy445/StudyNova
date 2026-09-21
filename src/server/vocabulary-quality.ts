const TEMPLATE_PATTERNS = [
  /\bin the passage\b/i,
  /\bin this passage\b/i,
  /\bthe word\s+["'“”]?[^"'“”]{1,80}["'“”]?\s+(helps?|shows?|means?|is used)\b/i,
  /\bthe writer'?s?\s+(main idea|purpose|argument)\b/i,
  /\bthe author uses\b/i,
  /\bthis sentence (shows|demonstrates|illustrates)\b/i,
  /\bthe meaning of\b/i,
  /\bhelps explain\b/i,
  /\bthe passage\b/i,
];

export type ExampleQuality = { valid: boolean; reasons: string[] };

export function checkNaturalExample(example: string, word: string): ExampleQuality {
  const value = example.trim().replace(/\s+/g, " ");
  const reasons: string[] = [];
  if (!value) reasons.push("例句不可為空");
  if (value.length < 8) reasons.push("例句太短，無法展示自然語境");
  if (value.length > 400) reasons.push("例句過長");
  if (!/[.!?]$/.test(value)) reasons.push("例句需要完整標點");
  if (TEMPLATE_PATTERNS.some((pattern) => pattern.test(value))) reasons.push("疑似文章分析模板，不是自然使用情境");
  const target = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (target && !new RegExp(`\\b${target}\\b`, "i").test(value)) reasons.push("例句沒有實際使用目標單字");
  if (/\b(lorem ipsum|foo bar|placeholder)\b/i.test(value)) reasons.push("包含無效佔位內容");
  return { valid: reasons.length === 0, reasons };
}

export function cleanExampleForDisplay(example: string | null | undefined, word: string) {
  const value = example?.trim() ?? "";
  return checkNaturalExample(value, word).valid ? value : "";
}

export function naturalExamplePrompt() {
  return "例句必須是學生在真實英文中會看到或使用的完整句子，根據目標字的詞性、指定意思、常見搭配與自然情境創作。禁止使用 In the passage、The word X、The writer uses、The author uses、This sentence shows、The meaning of X、X helps explain 等文章分析或解釋單字的模板；不要只把單字塞進固定句型。例句要以句號、問號或驚嘆號結尾，並確實使用目標字。";
}
