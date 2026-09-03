export type QualityValue = "good" | "warning" | "poor" | "unknown";

export type VisionQuality = Partial<Record<"resolution" | "blur" | "brightness" | "contrast" | "glare" | "skew" | "textSize" | "occlusion" | "shadow" | "background" | "readability", QualityValue>>;

export function qualityNeedsRetake(quality: VisionQuality | null | undefined): boolean {
  if (!quality) return false;
  return Object.values(quality).some((value) => value === "poor");
}

export function shouldShowUncertainty(confidence: unknown, certainty?: unknown): boolean {
  const score = typeof confidence === "number" ? confidence : Number(confidence);
  return certainty === "uncertain" || certainty === "not-found" || !Number.isFinite(score) || score < 0.72;
}

export function chooseVisionItems<T extends { id?: string }>(items: T[], selectedIds?: string[]): T[] {
  if (!selectedIds?.length) return items;
  const selected = new Set(selectedIds);
  return items.filter((item) => item.id && selected.has(item.id));
}

export function normalizeVocabularyWord(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
