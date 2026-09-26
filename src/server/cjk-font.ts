import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument } from "pdf-lib";

const FONT_FILENAME = "NotoSansCJKTC-Regular.ttf";
const FONT_PATH = path.join(process.cwd(), "src", "server", "fonts", FONT_FILENAME);
const TEST_TEXT = "這是一段繁體中文測試文字。國文、英文、數學、自然、社會、AI 學習助手、錯題本、智慧複習、線上 PK、回報專員 StudyNova";
let cachedFont: Buffer | null = null;
let cachedDataUrl: string | null = null;

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
  const face = fontkit.create(data);
  const missing = Array.from(TEST_TEXT).filter((char) => {
    const codePoint = char.codePointAt(0);
    return codePoint !== undefined && !face.hasGlyphForCodePoint(codePoint);
  });
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
