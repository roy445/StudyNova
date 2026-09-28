import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentReadingSegments, contentUnderstandingBlocks, contentUnderstandingDocuments, studyMaterials } from "@/db/schema";
import { runAiJson } from "./ai";
import { AiBackgroundError } from "./ai-background";

type AiBlock = { pageNumber?: number; blockType?: string; headingPath?: string[]; content?: string; semanticTags?: string[]; confidence?: number };

function splitReadingText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const sentences = compact.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  const output: string[] = [];
  for (const sentence of sentences) {
    for (let index = 0; index < sentence.length; index += 220) output.push(sentence.slice(index, index + 220));
  }
  return output.slice(0, 10_000);
}

export async function understandMaterial(input: { materialId: string; userId: string }) {
  const material = (await db.select().from(studyMaterials).where(and(eq(studyMaterials.id, input.materialId), eq(studyMaterials.userId, input.userId))).limit(1))[0];
  if (!material) throw new AiBackgroundError("CONTENT_NOT_FOUND", "找不到教材或沒有權限。", false);
  const sourceText = material.content.trim().slice(0, 40_000);
  if (sourceText.length < 2) throw new AiBackgroundError("CONTENT_EMPTY", "教材目前沒有可理解的文字內容。", false);
  const document = (await db.insert(contentUnderstandingDocuments).values({ materialId: material.id, userId: input.userId, status: "processing", language: "zh-TW" }).returning())[0];
  if (!document) throw new AiBackgroundError("CONTENT_DOCUMENT_CREATE_FAILED", "無法建立教材理解版本。", false);
  try {
    const { data } = await runAiJson<{ summary?: string; blocks?: AiBlock[] }>({
      feature: "content_understanding",
      userId: input.userId,
      system: "你是 StudyNova 教材理解器。請把教材拆成可供閱讀器、朗讀與複習使用的語意區塊。只輸出 JSON：summary、blocks。blocks 依原文順序，不要捏造資料；blockType 只能是 title、paragraph、list、table、formula、code、quote；confidence 為 0 到 1。",
      parts: [{ kind: "text", text: `教材標題：${material.title}\n科目：${material.subject}\n教材內容：\n${sourceText}` }],
      maxOutputTokens: 4200,
    }, { summary: sourceText.slice(0, 240), blocks: [{ pageNumber: 1, blockType: "paragraph", content: sourceText.slice(0, 2000), semanticTags: [material.subject], confidence: 0.5 }] });
    const rawBlocks = Array.isArray(data.blocks) ? data.blocks : [];
    const blocks = rawBlocks.filter((block) => String(block.content ?? "").trim()).slice(0, 500);
    if (!blocks.length) throw new AiBackgroundError("CONTENT_BLOCKS_EMPTY", "AI 沒有產生可讀區塊。", false);
    await db.insert(contentUnderstandingBlocks).values(blocks.map((block, index) => {
      const content = String(block.content ?? "").trim().slice(0, 20_000);
      return { documentId: document.id, pageNumber: Math.max(1, Math.floor(Number(block.pageNumber ?? 1))), orderIndex: index, blockType: String(block.blockType ?? "paragraph").slice(0, 30), headingPath: Array.isArray(block.headingPath) ? block.headingPath.map(String).slice(0, 12) : [], content, plainText: content, semanticTags: Array.isArray(block.semanticTags) ? block.semanticTags.map(String).slice(0, 20) : [material.subject], confidence: Math.max(0, Math.min(1, Number(block.confidence ?? 0.7))), sourceRef: { source: "study_material", materialId: material.id } };
    }));
    const storedBlocks = await db.select().from(contentUnderstandingBlocks).where(eq(contentUnderstandingBlocks.documentId, document.id)).orderBy(asc(contentUnderstandingBlocks.orderIndex));
    const segments = storedBlocks.flatMap((block) => splitReadingText(block.plainText).map((text) => ({ blockId: block.id, text })));
    await db.insert(contentReadingSegments).values(segments.map((segment, index) => ({ documentId: document.id, blockId: segment.blockId, orderIndex: index, text: segment.text, language: "zh-TW", estimatedSeconds: Math.max(2, Math.ceil(segment.text.length / 4)) })));
    await db.update(contentUnderstandingDocuments).set({ status: "ready", summary: String(data.summary ?? "").slice(0, 4000), metadata: { sourceLength: sourceText.length, blockCount: storedBlocks.length, segmentCount: segments.length }, updatedAt: new Date() }).where(eq(contentUnderstandingDocuments.id, document.id));
    await db.update(studyMaterials).set({ status: "ready", summary: String(data.summary ?? "").slice(0, 4000), updatedAt: new Date() }).where(eq(studyMaterials.id, material.id));
    return { documentId: document.id, summary: String(data.summary ?? ""), blockCount: storedBlocks.length, segmentCount: segments.length };
  } catch (error) {
    await db.update(contentUnderstandingDocuments).set({ status: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "教材理解失敗", updatedAt: new Date() }).where(eq(contentUnderstandingDocuments.id, document.id));
    throw error;
  }
}
