export type BrowserSpeechLanguage = "auto" | "en-US" | "zh-TW" | "ru-RU";

export function inferSpeechLanguage(text: string): Exclude<BrowserSpeechLanguage, "auto"> {
  if (/[\u3400-\u9fff\u3040-\u30ff]/u.test(text)) return "zh-TW";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru-RU";
  return "en-US";
}

const ENGLISH_LETTER_NAMES: Record<string, string> = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "gee", H: "aitch", I: "eye",
  J: "jay", K: "kay", L: "ell", M: "em", N: "en", O: "oh", P: "pee", Q: "cue", R: "ar",
  S: "ess", T: "tee", U: "you", V: "vee", W: "double-you", X: "ex", Y: "why", Z: "zee",
};

/** Remove labeled KK/IPA fields and clearly bracketed IPA so lesson text is not read as a word. */
export function stripPronunciationAnnotations(text: string): string {
  const labels = /(?:\bKK(?:\s*(?:音標|phonetic|pronunciation))?|音標|IPA)\s*[:：=]?\s*(?:\/[^/\n]+\/|\[[^\]\n]+\]|\([^)\n]+\)|[^\s,，;；|]+)/giu;
  return text
    .replace(/^[ \t]*(?:(?:KK(?:[ \t]*(?:音標|phonetic|pronunciation))?)|音標|IPA)[ \t]*[:：=][ \t]*.*(?:\r?\n|$)/gimu, "")
    .replace(labels, " ")
    .replace(/\/(?=[^/\n]{0,60}[ˈˌːɑæɪɔəʊʌɜɒθðŋʃʒɹɡɾ])[^/\n]{1,100}\//gu, " ")
    .replace(/\[(?=[^\]\n]{0,60}[ˈˌːɑæɪɔəʊʌɜɒθðŋʃʒɹɡɾ])[^\]\n]{1,100}\]/gu, " ")
    .replace(/\s+([,.;:!?，。；：！？])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Read a stand-alone alphabet letter by its name; keep ordinary vocabulary as a whole word. */
export function speechTextForVocabularyWord(word: string, partOfSpeech = "", meaning = ""): string {
  const text = stripPronunciationAnnotations(word);
  const context = `${partOfSpeech} ${meaning}`;
  const explicitLetter = /(?:\bletter\b|\balphabet\b|字母|字母表)/iu.test(context);
  const article = /(?:\barticle\b|冠詞|一個|某個)/iu.test(context);
  const abbreviation = /(?:\babbr(?:eviation)?\b|\bacronym\b|\binitialism\b|縮寫|簡稱)/iu.test(context);
  if (/^[A-Za-z]$/u.test(text)) {
    const letter = text.toUpperCase();
    if (letter === "A" && article && !explicitLetter) return "uh";
    if (explicitLetter || text === letter || letter !== "A") return ENGLISH_LETTER_NAMES[letter];
    return "uh";
  }
  if (/^[A-Z]{2,6}$/u.test(text) && abbreviation) {
    return Array.from(text).map((letter) => ENGLISH_LETTER_NAMES[letter]).join(", ");
  }
  return text;
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
