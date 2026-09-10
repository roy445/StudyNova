import { fingerprint } from "./core";

export type NormalizedQuestion = {
  subject: string;
  topic: string;
  bankCategory: string;
  sourceLabel: string;
  level: "junior" | "senior";
  difficulty: "easy" | "normal" | "hard" | "exam" | "advanced";
  type: string;
  stem: string;
  options: string[];
  answer: string[];
  explanation: string;
  metadata: Record<string, unknown>;
  fingerprint: string;
};

export type ImportIssue = { index: number; field?: string; code: string; message: string; severity: "error" | "warning" };
export type ImportPreview = NormalizedQuestion & { index: number; status: "READY" | "WARNING" | "ERROR" | "DUPLICATE"; issues: ImportIssue[] };

const MAX_ITEMS = 5000;
const MAX_STRING = 20000;
const text = (value: unknown, max = MAX_STRING) => typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, max) : "";
const first = (row: Record<string, unknown>, keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== "");
const asArray = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((item) => typeof item === "object" && item ? [text((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).label)] : [text(item)]).filter(Boolean).slice(0, 20) : value === undefined || value === null || value === "" ? [] : [text(value)];

function inferType(row: Record<string, unknown>, options: string[], answer: string[]) {
  const supplied = text(first(row, ["type", "questionType", "kind"])).toLowerCase().replace(/[ -]/g, "_");
  if (supplied) return ({ single_choice: "single", multiple_choice: "multiple", true_false: "truefalse", fill_blank: "fill", short_answer: "short", essay: "essay", reading_group: "reading", calculation: "calculation", multi_step: "calculation", vocabulary: "vocabulary", cloze: "cloze", grammar: "grammar" } as Record<string, string>)[supplied] ?? supplied.slice(0, 40);
  if (options.length > 0) return answer.length > 1 ? "multiple" : "single";
  if (answer.length === 1 && /^(true|false|是|否|對|錯)$/i.test(answer[0])) return "truefalse";
  return "fill";
}

export function parseQuestionPayload(payload: unknown): { rows: Record<string, unknown>[]; error?: string } {
  if (Array.isArray(payload)) return { rows: payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) };
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    for (const key of ["questions", "items", "data", "results"]) if (Array.isArray(root[key])) return { rows: root[key].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) };
    return { rows: [root] };
  }
  return { rows: [], error: "JSON 必須是題目陣列或包含 questions/items/data/results 陣列的物件" };
}

export function normalizeQuestionRows(payload: unknown, defaults: Partial<Pick<NormalizedQuestion, "subject" | "bankCategory" | "sourceLabel" | "level" | "difficulty">> = {}) {
  const parsed = parseQuestionPayload(payload);
  if (parsed.error) return { previews: [] as ImportPreview[], issues: [{ index: 0, code: "INVALID_ROOT", message: parsed.error, severity: "error" as const }], truncated: false };
  const truncated = parsed.rows.length > MAX_ITEMS;
  const previews: ImportPreview[] = [];
  const seen = new Set<string>();
  parsed.rows.slice(0, MAX_ITEMS).forEach((row, index) => {
    const stem = text(first(row, ["question", "stem", "content", "title", "prompt"]));
    const options = asArray(first(row, ["options", "choices", "alternatives"]));
    const rawAnswer = first(row, ["answer", "correctAnswer", "correct", "solution"]);
    const answer = asArray(rawAnswer);
    const explanation = text(first(row, ["explanation", "analysis", "rationale", "solution"]));
    const type = inferType(row, options, answer);
    const item: NormalizedQuestion = {
      subject: text(first(row, ["subject", "科目"])) || defaults.subject || "其他",
      topic: text(first(row, ["topic", "chapter", "unit", "section"])) ,
      bankCategory: text(first(row, ["bankCategory", "bank", "category"])) || defaults.bankCategory || "general",
      sourceLabel: text(first(row, ["sourceLabel", "source", "來源"])) || defaults.sourceLabel || "JSON 匯入",
      level: (text(first(row, ["level", "grade", "educationLevel"])) === "senior" ? "senior" : defaults.level ?? "junior"),
      difficulty: (["easy", "normal", "hard", "exam", "advanced"].includes(text(first(row, ["difficulty", "難度"]))) ? text(first(row, ["difficulty", "難度"])) : defaults.difficulty ?? "normal") as NormalizedQuestion["difficulty"],
      type, stem, options, answer, explanation,
      metadata: { originalIndex: index, originalType: row.type ?? null, tags: asArray(row.tags), estimatedSeconds: Number(row.estimatedSeconds ?? 0) || 0, points: Number(row.points ?? 1) || 1 },
      fingerprint: fingerprint(text(first(row, ["subject", "科目"])) || defaults.subject || "其他", stem, answer.join("|")),
    };
    const issues: ImportIssue[] = [];
    if (!stem) issues.push({ index, field: "question", code: "MISSING_STEM", message: "缺少 question／stem／content／title／prompt 題目欄位。", severity: "error" });
    if (!answer.length) issues.push({ index, field: "answer", code: "MISSING_ANSWER", message: "缺少 answer／correctAnswer／correct／solution 答案欄位。", severity: "error" });
    if ((type === "single" || type === "multiple") && !options.length) issues.push({ index, field: "options", code: "MISSING_OPTIONS", message: `${type} 題必須提供 options。`, severity: "error" });
    if ((type === "single" || type === "multiple") && options.length && !answer.every((value) => options.includes(value) || options.some((option, optionIndex) => value === String.fromCharCode(65 + optionIndex)))) issues.push({ index, field: "answer", code: "ANSWER_NOT_IN_OPTIONS", message: `答案不在選項內；目前答案：${answer.join("、")}；選項：${options.join("、")}`, severity: "error" });
    if (type === "multiple" && answer.length < 2) issues.push({ index, field: "answer", code: "MULTIPLE_NEEDS_ARRAY", message: "multiple_choice 題型的 answer 必須包含至少兩個答案。", severity: "warning" });
    if (!explanation) issues.push({ index, field: "explanation", code: "MISSING_EXPLANATION", message: "尚未提供解析，匯入後標記為待補解析。", severity: "warning" });
    if (seen.has(item.fingerprint)) issues.push({ index, code: "DUPLICATE_IN_FILE", message: "與本次檔案中的另一題重複。", severity: "warning" });
    seen.add(item.fingerprint);
    const hasError = issues.some((issue) => issue.severity === "error");
    previews.push({ ...item, index, issues, status: hasError ? "ERROR" : issues.length ? "WARNING" : "READY" });
  });
  return { previews, issues: truncated ? [{ index: MAX_ITEMS, code: "MAX_ITEMS", message: `單次最多處理 ${MAX_ITEMS} 題，超出部分未納入預覽。`, severity: "warning" as const }] : [], truncated };
}
