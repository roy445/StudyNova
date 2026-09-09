import { fail } from "./errors";
import { runAiJson } from "./ai";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type OcrBlock = { content: string; x: number; y: number; width: number; height: number; confidence: number; page: number; line: number; block: number };

function hasMagic(data: Buffer, mime: string) {
  if (mime === "image/jpeg") return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === "image/png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export function validateOcrImage(data: Buffer, mimeType: string) {
  if (data.length > MAX_IMAGE_BYTES) throw fail("IMAGE_TOO_LARGE");
  if (!ALLOWED_MIME.has(mimeType) || !hasMagic(data, mimeType)) throw fail("IMAGE_INVALID");
  if (data.length < 128) throw fail("IMAGE_INVALID");
}

export async function solveOcrImage(params: { userId: string; data: Buffer; mimeType: string; feature: string; prompt?: string }) {
  validateOcrImage(params.data, params.mimeType);
  const { data, meta } = await runAiJson<{ text?: string; blocks?: OcrBlock[] }>(
    {
      feature: params.feature,
      userId: params.userId,
      system: "你是高精度教育 OCR 引擎。只能辨識影像中實際可見的文字，不得猜測。保留題號、選項、段落、表格、公式與標點；公式使用 LaTeX；不確定文字請標記 [不確定:候選]。只輸出 JSON：{text:string,blocks:[{content:string,x:number,y:number,width:number,height:number,confidence:number,page:number,line:number,block:number}]}。座標為 0 到 1。",
      parts: [{ kind: "text", text: params.prompt ?? "辨識圖片全部可見文字。" }, { kind: "image", mimeType: params.mimeType, base64: params.data.toString("base64") }],
      temperature: 0.05,
      maxOutputTokens: 5000,
    },
    { text: "", blocks: [] },
  );
  const blocks = Array.isArray(data.blocks) ? data.blocks.filter((block) => block && typeof block.content === "string").map((block) => ({
    ...block,
    x: Math.max(0, Math.min(1, Number(block.x) || 0)), y: Math.max(0, Math.min(1, Number(block.y) || 0)),
    width: Math.max(0, Math.min(1, Number(block.width) || 0)), height: Math.max(0, Math.min(1, Number(block.height) || 0)),
    confidence: Math.max(0, Math.min(1, Number(block.confidence) || 0)), page: Number(block.page) || 1, line: Number(block.line) || 1, block: Number(block.block) || 1,
  })) : [];
  // Some vision providers return usable OCR text while ignoring the JSON-only
  // instruction. Preserve that text instead of converting it to SN-AI-6013.
  const providerText = String(meta.text ?? "").replace(/^```(?:text|json)?/i, "").replace(/```$/i, "").trim();
  const text = String(data.text ?? (blocks.map((block) => block.content).join("\n") || providerText)).trim();
  if (!text && !blocks.length) {
    console.error("[ocr] provider returned no usable text", { feature: params.feature, outputTokens: meta.outputTokens, provider: meta.provider, model: meta.model });
    throw fail(meta.outputTokens > 0 ? "AI_INVALID_RESPONSE" : "AI_OCR_EMPTY", { details: { provider: meta.provider, model: meta.model, outputTokens: meta.outputTokens } });
  }
  return { text, blocks };
}
