import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { createCanvas } from "@napi-rs/canvas";
export type PdfTextChunk = { pageStart: number; pageEnd: number; text: string };
export type PdfImagePage = { page: number; base64: string };
export type DeterministicQuestion = { questionNumber: number; subject: string; topic: string; level: string; difficulty: string; type: string; stem: string; options: string[]; answer: string[]; explanation: string; confidence: number; answerSource: string; sourcePage?: number };

/** Parse the common `1. stem A. ... B. ...` format without spending an AI call. */
export function parseNumberedChoiceQuestionText(text: string): DeterministicQuestion[] {
  const answerStart = text.search(/(?:^|\n)\s*答案\s*(?:\n|$)/m);
  const questionText = answerStart >= 0 ? text.slice(0, answerStart) : text;
  const answerText = answerStart >= 0 ? text.slice(answerStart) : "";
  const answers = new Map<number, string>();
  for (const match of answerText.matchAll(/(?<!\S)(\d{1,3})\s*[.、]?\s*([A-D])(?=\s|$)/g)) answers.set(Number(match[1]), match[2]);
  // PDF.js often returns one flattened line per page, so question numbers
  // cannot depend on newline boundaries.
  const starts = [...questionText.matchAll(/(?<!\S)(\d{1,3})[.)]\s+/g)];
  const result: DeterministicQuestion[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const number = Number(starts[index][1]);
    const start = (starts[index].index ?? 0) + starts[index][0].length;
    const end = starts[index + 1]?.index ?? questionText.length;
    const block = questionText.slice(start, end).replace(/\[第\s*\d+\s*頁\]/g, " ").replace(/\s+/g, " ").trim();
    const optionStarts = [...block.matchAll(/(?:^|\s)([A-D])\.\s*/g)];
    if (optionStarts.length < 2) continue;
    const stem = block.slice(0, optionStarts[0].index ?? 0).trim();
    const options = optionStarts.map((option, optionIndex) => block.slice((option.index ?? 0) + option[0].length, optionStarts[optionIndex + 1]?.index ?? block.length).trim());
    if (!stem || options.some((option) => !option)) continue;
    const answerLetter = answers.get(number);
    const answerIndex = answerLetter ? answerLetter.charCodeAt(0) - 65 : -1;
    const correctOption = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : "（答案待人工確認）";
    const explanation = answerLetter
      ? number <= 350
        ? `題目要找出「${stem}」所對應的英文片語。正確答案 ${answerLetter} 為「${correctOption}」，因此選 ${answerLetter}。`
        : `題目詢問英文片語「${stem}」的中文意思。正確答案 ${answerLetter} 為「${correctOption}」，因此選 ${answerLetter}。`
      : "PDF 未提供可對應的答案，請人工確認。";
    result.push({ questionNumber: number, subject: "英文", topic: "英文片語", level: "senior", difficulty: "normal", type: "single", stem, options, answer: answerLetter ? [answerLetter] : [], explanation, confidence: answerLetter ? 1 : 0.7, answerSource: answerLetter ? "PDF 答案區" : "待人工確認" });
  }
  return result;
}

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
