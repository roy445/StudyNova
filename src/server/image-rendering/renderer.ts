import sharp from "sharp";
import { assertCjkGlyphCoverage, cjkTestText, validateCjkFont, withCjkSvgFont } from "../cjk-font";

export type ImageRenderHealth = ReturnType<typeof validateCjkFont> & {
  renderer: "sharp-librsvg";
  rendered: boolean;
  renderDurationMs: number;
  outputBytes: number;
  mimeType: "image/png";
};

/** The single server-side SVG/PNG rendering entry point for image artifacts. */
export async function renderSvgToPng(svg: string, textToValidate: string) {
  const started = Date.now();
  const font = validateCjkFont();
  if (!font.valid) throw new Error(`CJK glyph coverage failed: ${font.missingGlyphs.join("")}`);
  assertCjkGlyphCoverage(textToValidate, "圖片文字");
  const data = await sharp(Buffer.from(withCjkSvgFont(svg))).png().toBuffer();
  if (!data.length) throw new Error("Image renderer returned an empty PNG");
  return { data, durationMs: Date.now() - started, renderer: "sharp-librsvg" as const };
}

export async function renderCjkHealthPng() {
  const text = cjkTestText().replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500"><rect width="1500" height="500" fill="#101a38"/><text x="60" y="110" fill="#7dd3fc" font-size="52">StudyNova CJK Font Health</text><text x="60" y="220" fill="white" font-size="42">${text}</text><text x="60" y="330" fill="#c4b5fd" font-size="36">繁體中文・國中 高中・線上 PK・AI 學習助手</text></svg>`;
  const result = await renderSvgToPng(svg, `${cjkTestText()} 繁體中文・國中 高中・線上 PK・AI 學習助手`);
  const font = validateCjkFont();
  const health: ImageRenderHealth = { ...font, renderer: result.renderer, rendered: true, renderDurationMs: result.durationMs, outputBytes: result.data.length, mimeType: "image/png" };
  return { ...health, data: result.data };
}
