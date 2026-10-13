const MOJIBAKE_MARKERS = /(?:Ã.|Â.|â.|ð.|�|鈥|譁|锟)/u;
const INVALID_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function repairMojibake(value: string) {
  if (!MOJIBAKE_MARKERS.test(value)) return value;
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    if (repaired && !MOJIBAKE_MARKERS.test(repaired) && !repaired.includes("�")) return repaired;
  } catch {
    // Keep the original so the validator can reject it safely.
  }
  return value;
}

function stripLabels(value: string) {
  return value
    .replace(/^\s*(?:KK\s*(?:音標|phonetic|pronunciation)?|音標|發音|pronunciation)\s*[:：=]\s*/iu, "")
    .replace(/^\s*(?:KK|IPA)\s*[:：=]\s*/iu, "")
    .replace(/^\s*[「『"']|[」』"']\s*$/gu, "")
    .trim();
}

/**
 * Normalise AI pronunciation output without inventing a pronunciation.
 * Empty string means the model output was not reliable enough to display.
 */
export function normalizeKkPhonetic(value: unknown): string {
  let text = repairMojibake(String(value ?? "").normalize("NFC")).trim();
  if (!text || INVALID_CONTROL.test(text) || text.includes("�") || /(?:undefined|null|unknown|不確定|看不清|待確認)/iu.test(text)) return "";
  text = stripLabels(text)
    .replace(/[［］]/gu, (character) => character === "［" ? "[" : "]")
    .replace(/[／]/gu, "/")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text || text.length > 160) return "";

  // KK/IPA uses Latin letters, IPA extensions, combining marks, stress marks,
  // brackets and a small set of Taiwanese pronunciation symbols. Rejecting
  // everything else prevents CJK labels and mojibake from reaching students.
  const invalid = Array.from(text).find((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (/\s|[A-Za-z0-9'.,;:!?()\[\]\/\-+]/u.test(character)) return false;
    if (codePoint >= 0x00c0 && codePoint <= 0x02ff) return false;
    if (codePoint >= 0x0300 && codePoint <= 0x036f) return false;
    if (codePoint >= 0x3105 && codePoint <= 0x312f) return false;
    return !"ˈˌːˑ˥˦˧˨˩ʔ·".includes(character);
  });
  return invalid ? "" : text;
}

export function isReliableKkPhonetic(value: unknown) {
  return normalizeKkPhonetic(value).length > 0;
}
