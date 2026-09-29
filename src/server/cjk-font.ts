import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument } from "pdf-lib";
import { VISUAL_NOTE_ICONS } from "@/lib/visual-note-icons";

const FONT_FILENAME = "NotoSansCJKTC-Regular.ttf";
const FONT_PATH = path.join(process.cwd(), "src", "server", "fonts", FONT_FILENAME);
const TEST_TEXT = `這是一段繁體中文測試文字。國文、英文、數學、自然、社會、AI 學習助手、錯題本、智慧複習、線上 PK、回報專員 StudyNova ${VISUAL_NOTE_ICONS.join(" ")}`;
let cachedFont: Buffer | null = null;
let cachedDataUrl: string | null = null;
let cachedFace: ReturnType<typeof fontkit.create> | null = null;

export function cjkFontPath() {
  return FONT_PATH;
}

export function getCjkFont(): Buffer {
  if (!cachedFont) {
    if (!fs.existsSync(FONT_PATH)) throw new Error(`CJK font unavailable: ${FONT_PATH}`);
    cachedFont = fs.readFileSync(FONT_PATH);
    if (cachedFont.length < 1_000_000) throw new Error("CJK font file is unexpectedly small");
  }
  return cachedFont;
}

function getCjkFontFace() {
  if (!cachedFace) cachedFace = fontkit.create(getCjkFont());
  return cachedFace;
}

export function findMissingCjkGlyphs(text: string) {
  const face = getCjkFontFace();
  return Array.from(new Set(Array.from(text).filter((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0x200c || codePoint === 0x200d || (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)) return false;
    return !face.hasGlyphForCodePoint(codePoint);
  })));
}

export function assertCjkGlyphCoverage(text: string, context = "輸出文字") {
  const missing = findMissingCjkGlyphs(text);
  if (missing.length) {
    const details = missing.slice(0, 12).map((character) => `${character} (U+${character.codePointAt(0)?.toString(16).toUpperCase()})`).join("、");
    const remainder = missing.length > 12 ? `，另有 ${missing.length - 12} 個字元` : "";
    throw new Error(`${context}含有目前 Noto Sans CJK TC 未支援的字元：${details}${remainder}。請移除或改用字型支援的文字後再產生檔案。`);
  }
}

export function getCjkFontDataUrl(): string {
  if (!cachedDataUrl) cachedDataUrl = `data:font/ttf;base64,${getCjkFont().toString("base64")}`;
  return cachedDataUrl;
}

export function cjkSvgStyle() {
  return `<style>@font-face{font-family:'StudyNova CJK';src:url('${getCjkFontDataUrl()}') format('truetype');font-weight:400;font-style:normal}text{font-family:'StudyNova CJK','Noto Sans TC',sans-serif}</style>`;
}

export function withCjkSvgFont(svg: string) {
  return svg.replace(/<svg([^>]*)>/, `<svg$1>${cjkSvgStyle()}`);
}

export async function embedCjkFont(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(getCjkFont(), { subset: false });
}

export function cjkTestText() {
  return TEST_TEXT;
}

export function validateCjkFont() {
  const data = getCjkFont();
  const face = getCjkFontFace();
  const missing = findMissingCjkGlyphs(TEST_TEXT);
  return {
    path: FONT_PATH,
    filename: FONT_FILENAME,
    bytes: data.length,
    readable: true,
    family: face.familyName,
    glyphs: face.numGlyphs,
    testText: TEST_TEXT,
    missingGlyphs: Array.from(new Set(missing)),
    valid: missing.length === 0,
  };
}
