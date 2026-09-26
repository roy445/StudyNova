import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { cjkTestText, embedCjkFont, validateCjkFont, withCjkSvgFont } from "./cjk-font";

export async function runCjkHealth() {
  const base = validateCjkFont();
  let pdf: { bytes: number; embedded: boolean; error?: string } = { bytes: 0, embedded: false };
  let image: { bytes: number; rendered: boolean; error?: string } = { bytes: 0, rendered: false };
  let svg: { bytes: number; embedded: boolean; error?: string } = { bytes: 0, embedded: false };
  try {
    const document = await PDFDocument.create();
    const font = await embedCjkFont(document);
    const page = document.addPage([595, 842]);
    page.drawText(cjkTestText(), { x: 32, y: 790, size: 11, font, color: rgb(0.1, 0.1, 0.15), maxWidth: 530 });
    const bytes = await document.save();
    const reloaded = await PDFDocument.load(bytes);
    pdf = { bytes: bytes.length, embedded: bytes.length > 20_000 && reloaded.getPages().length === 1 };
  } catch (error) {
    pdf.error = error instanceof Error ? error.message : String(error);
  }
  try {
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="220"><rect width="1200" height="220" fill="white"/><text x="30" y="120" font-size="32">${cjkTestText()}</text></svg>`;
    const rendered = await sharp(Buffer.from(withCjkSvgFont(raw))).png().toBuffer();
    image = { bytes: rendered.length, rendered: rendered.length > 1000 };
  } catch (error) {
    image.error = error instanceof Error ? error.message : String(error);
  }
  try {
    const output = withCjkSvgFont(`<svg xmlns="http://www.w3.org/2000/svg"><text>${cjkTestText()}</text></svg>`);
    svg = { bytes: Buffer.byteLength(output), embedded: output.includes("StudyNova CJK") && output.includes("base64,") };
  } catch (error) {
    svg.error = error instanceof Error ? error.message : String(error);
  }
  return { ...base, pdf, image, svg, healthy: base.valid && pdf.embedded && image.rendered && svg.embedded };
}
