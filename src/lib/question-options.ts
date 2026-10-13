const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function cleanQuestionOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const cleaned = options
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index);
  if (cleaned.length >= 2 && cleaned.every((value) => /^(如原卷選項圖所示|圖例圖示選項|圖例圖示選項，需參照原卷影像|請參照原卷|選項圖片)$/i.test(value))) return [];
  return cleaned;
}

export function optionLabel(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

export function labeledOption(index: number, option: string): string {
  return `${optionLabel(index)}. ${option}`;
}
