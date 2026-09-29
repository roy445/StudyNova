export type PackageOutput = {
  summary?: string;
  keyPoints: string[];
  vocabulary: Array<{ word: string; meaning: string; partOfSpeech: string; example: string; exampleZh: string }>;
  questions: Array<{ stem: string; options: string[]; answer: string[]; explanation: string; type?: string }>;
};

export function normalizePackageOutput(value: unknown): PackageOutput {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const asText = (item: unknown) => typeof item === "string" ? item.trim() : "";
  const keyPoints = Array.isArray(raw.keyPoints) ? raw.keyPoints.map(asText).filter(Boolean).slice(0, 30) : [];
  const vocabulary = Array.isArray(raw.vocabulary) ? raw.vocabulary.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const word = asText((item as Record<string, unknown>).word);
    const meaning = asText((item as Record<string, unknown>).meaning);
    if (!word || !meaning) return [];
    const entry = item as Record<string, unknown>;
    return [{ word, meaning, partOfSpeech: asText(entry.partOfSpeech), example: asText(entry.example), exampleZh: asText(entry.exampleZh) }];
  }).slice(0, 30) : [];
  const questions = Array.isArray(raw.questions) ? raw.questions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const stem = asText(entry.stem);
    const options = Array.isArray(entry.options) ? entry.options.map(asText).filter(Boolean).slice(0, 8) : [];
    const answer = Array.isArray(entry.answer) ? entry.answer.map(asText).filter(Boolean).slice(0, 4) : typeof entry.answer === "string" && entry.answer.trim() ? [entry.answer.trim()] : [];
    if (!stem || !answer.length) return [];
    return [{ stem, options, answer, explanation: asText(entry.explanation), type: asText(entry.type) || "single" }];
  }).slice(0, 20) : [];
  return { summary: asText(raw.summary), keyPoints, vocabulary, questions };
}

export function packageProgress(steps: string[], results: Record<string, unknown>) {
  if (!steps.length) return 0;
  const completed = steps.filter((step) => Boolean((results[step] as Record<string, unknown> | undefined)?.completedAt)).length;
  return Math.round((completed / steps.length) * 100);
}
