export type BrowserSpeechLanguage = "auto" | "en-US" | "zh-TW" | "ru-RU";

export function inferSpeechLanguage(text: string): Exclude<BrowserSpeechLanguage, "auto"> {
  if (/[\u3400-\u9fff\u3040-\u30ff]/u.test(text)) return "zh-TW";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru-RU";
  return "en-US";
}

/** Split long passages into short utterances to avoid browser/mobile TTS cutoffs. */
export function splitSpeechText(text: string, maxLength = 220): string[] {
  if (!Number.isInteger(maxLength) || maxLength < 1) throw new RangeError("maxLength must be a positive integer");
  const remaining = Array.from(text.replace(/\r\n?/gu, "\n").trim());
  const chunks: string[] = [];

  while (remaining.length) {
    let cut = Math.min(maxLength, remaining.length);
    if (remaining.length > maxLength) {
      const minCut = Math.floor(maxLength * 0.55);
      for (let index = cut; index > minCut; index -= 1) {
        const previous = remaining[index - 1];
        if (/\s/u.test(previous) || /[.!?;:。！？；：]/u.test(previous)) {
          cut = index;
          break;
        }
      }
    }
    const chunk = remaining.splice(0, cut).join("").trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}
