const BANNED_TERMS = [
  "fuck", "fuk", "f4ck", "fack", "shit", "bitch", "asshole", "dick", "cock", "pussy", "whore", "slut", "cunt", "nigger", "nigga", "rape",
  "puta", "puto", "coño", "merde", "putain", "scheisse", "arschloch", "блядь", "сука", "хуй", "пизда", "ебать", "еблан",
  "くそ", "しね", "ちんこ", "まんこ", "きちがい", "시발", "씨발", "개새끼", "년", "幹", "幹你娘", "肏", "操你", "媽的", "他媽", "他媽的", "機掰", "雞巴", "屌", "婊子", "妓女", "色情", "做愛", "亂倫", "畜生", "王八蛋",
];
const LEET_MAP: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", "$": "s", "7": "t" };

export type NameCheck = { ok: true; normalized: string } | { ok: false; reason: string; normalized: string };

export function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "").toLocaleLowerCase().split("").map((char) => LEET_MAP[char] ?? char).join("").replace(/[\s._\-]+/g, "").trim();
}

export function checkDisplayName(value: string): NameCheck {
  const trimmed = value.normalize("NFKC").trim();
  const normalized = normalizeName(trimmed);
  if (trimmed.length < 1) return { ok: false, reason: "名稱不可為空白。", normalized };
  if (trimmed.length > 40) return { ok: false, reason: "名稱最多 40 個字元。", normalized };
  if (/https?:\/\/|www\.|@/.test(trimmed)) return { ok: false, reason: "名稱不可包含網址或聯絡方式。", normalized };
  if (/([\p{So}\p{Cn}])\1{3,}/u.test(trimmed)) return { ok: false, reason: "名稱包含過多特殊符號。", normalized };
  for (const term of BANNED_TERMS) {
    const normalizedTerm = normalizeName(term);
    if (normalizedTerm.length >= 3 && normalized.includes(normalizedTerm)) return { ok: false, reason: "名稱含有不適當或不雅文字。", normalized };
  }
  return { ok: true, normalized };
}
