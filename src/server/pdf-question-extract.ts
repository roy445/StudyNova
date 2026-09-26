import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { createCanvas } from "@napi-rs/canvas";
export type PdfTextChunk = { pageStart: number; pageEnd: number; text: string };
export type PdfImagePage = { page: number; base64: string };

export async function extractPdfQuestionChunks(buffer: Buffer, maxCharsPerChunk = 6_000): Promise<PdfTextChunk[]> {
  // Vercel bundles the legacy parser into a server chunk. Register the worker
  // handler statically so PDF.js never tries to dynamically import a missing
  // /var/task/pdf.worker.mjs file at runtime.
  const workerGlobal = globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler } };
  workerGlobal.pdfjsWorker ??= { WorkerMessageHandler };
  const pdf = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
    pages.push(text);
    page.cleanup();
  }
  const chunks: PdfTextChunk[] = [];
  let current = "";
  let pageStart = 1;
  for (let index = 0; index < pages.length; index += 1) {
    const pageText = `\n[第 ${index + 1} 頁]\n${pages[index]}`;
    if (current && current.length + pageText.length > maxCharsPerChunk) {
      chunks.push({ pageStart, pageEnd: index, text: current });
      current = "";
      pageStart = index + 1;
    }
    current += pageText;
  }
  if (current.trim()) chunks.push({ pageStart, pageEnd: pages.length, text: current });
  return chunks;
}

/** Render scanned pages so a PDF without a text layer is still sent as a real image. */
export async function renderPdfImagePages(buffer: Buffer, scale = 1.35): Promise<PdfImagePage[]> {
  const workerGlobal = globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler } };
  workerGlobal.pdfjsWorker ??= { WorkerMessageHandler };
  const pdf = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const pages: PdfImagePage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
    pages.push({ page: pageNumber, base64: canvas.toBuffer("image/png").toString("base64") });
    page.cleanup();
  }
  return pages;
}
