import { fingerprint } from "./core";

export type PkQuestionBlueprint = {
  type: string;
  stem: string;
  options: string[];
  answer: string;
  explanation?: string;
  sourceLabel?: string;
  unit?: string;
  subject?: string;
};

export function normalizePkText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** A match fingerprint includes every semantic input that can make a question feel repeated. */
export function pkQuestionFingerprint(question: PkQuestionBlueprint) {
  return fingerprint(
    "online-pk-question",
    question.stem,
    question.answer,
    question.options.map(normalizePkText).sort().join("|"),
    question.type,
    question.sourceLabel ?? "",
    question.unit ?? "",
    question.subject ?? "",
  );
}

function seedNumber(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Deterministic per-player order: same question, different player order, no client authority. */
export function pkOptionOrder(options: string[], seed: string) {
  const result = [...options];
  let state = seedNumber(seed) || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = Math.imul(state ^ (state >>> 13), 1597334677) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function ensureDifferentOptionOrder(options: string[], firstSeed: string, secondSeed: string) {
  const first = pkOptionOrder(options, firstSeed);
  const second = pkOptionOrder(options, secondSeed);
  if (options.length > 1 && first.join("\u0000") === second.join("\u0000")) {
    [second[0], second[1]] = [second[1], second[0]];
  }
  return { first, second };
}

export function matchPlayerCount(mode: string, customCount?: number) {
  if (mode === "1v1") return 2;
  if (mode === "2v2") return 4;
  if (mode === "3v3") return 6;
  if (mode === "多人" || mode === "multiplayer") return Math.max(3, Math.min(12, customCount ?? 6));
  return Math.max(2, Math.min(12, customCount ?? 2));
}

export function calculatePkScore(input: { correct: boolean; elapsedMs: number; comboBefore: number; questionTimeSec: number }) {
  if (!input.correct) return { points: 0, combo: 0 };
  const safeElapsed = Math.max(0, Math.min(input.elapsedMs, input.questionTimeSec * 1000));
  const speedBonus = Math.max(0, Math.round((input.questionTimeSec * 1000 - safeElapsed) / 100));
  const combo = input.comboBefore + 1;
  const comboBonus = Math.min(50, Math.max(0, combo - 1) * 5);
  return { points: 100 + speedBonus + comboBonus, combo };
}

export function calculateRanks<T extends { score: number; answeredCount: number; totalResponseMs: number }>(players: T[]) {
  return [...players]
    .sort((a, b) => b.score - a.score || b.answeredCount - a.answeredCount || a.totalResponseMs - b.totalResponseMs)
    .map((player, index) => ({ player, rank: index + 1 }));
}

export function optionUsagePriority(questions: PkQuestionBlueprint[], used: Set<string>) {
  return questions.map((question) => {
    const fresh = question.options.filter((option) => !used.has(normalizePkText(option)));
    return { question, freshCount: fresh.length, options: fresh.length >= 2 ? fresh : question.options };
  }).sort((a, b) => b.freshCount - a.freshCount);
}
