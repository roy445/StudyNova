import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { dailyKnowledgeItems } from "@/db/schema";
import { runAiJson } from "./ai";

export const DAILY_KNOWLEDGE_SUBJECTS = ["國文", "英文", "數學", "自然", "歷史", "地理", "公民", "物理", "化學", "生物", "地球科學"] as const;
export type DailyKnowledgeSubject = typeof DAILY_KNOWLEDGE_SUBJECTS[number];
export type DailyKnowledgeDraft = { title: string; content: string; detail: string; subject: string; topic: string; source: string; sourceUrl: string; coreConcept: string; quiz: { question: string; options: string[]; answer: number; explanation: string } };

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}
function grams(value: string) {
  const text = normalize(value).replace(/\s/g, "");
  return new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
}
function similarity(a: string, b: string) {
  const left = grams(a); const right = grams(b);
  if (!left.size || !right.size) return normalize(a) === normalize(b) ? 1 : 0;
  const overlap = [...left].filter((item) => right.has(item)).length;
  return overlap / new Set([...left, ...right]).size;
}

export function compareDailyKnowledge(candidate: Pick<DailyKnowledgeDraft, "title" | "content" | "coreConcept">, previous: Array<Pick<DailyKnowledgeDraft, "title" | "content" | "coreConcept">>) {
  const matches = previous.map((item) => ({ title: similarity(candidate.title, item.title), content: similarity(candidate.content, item.content), coreConcept: similarity(candidate.coreConcept, item.coreConcept) }));
  const highest = matches.reduce((best, current) => ({ title: Math.max(best.title, current.title), content: Math.max(best.content, current.content), coreConcept: Math.max(best.coreConcept, current.coreConcept) }), { title: 0, content: 0, coreConcept: 0 });
  const duplicate = highest.title >= 0.72 || highest.content >= 0.62 || highest.coreConcept >= 0.7;
  return { duplicate, highest, reason: duplicate ? "標題、內容或核心概念與既有每日知識過度相似" : "未發現高相似內容" };
}

export function fingerprint(value: string) { return createHash("sha256").update(normalize(value)).digest("hex"); }

export async function verifyDailyKnowledgeSource(sourceUrl: string) {
  if (!/^https?:\/\/[^\s]+$/i.test(sourceUrl)) return { verified: false, note: "缺少有效的 http(s) 來源網址，不能標記為已查證。" };
  try {
    const response = await fetch(sourceUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { verified: false, note: `來源網址回應 ${response.status}，不能標記為已查證。` };
    return { verified: true, note: `已驗證來源網址可存取（HTTP ${response.status}）。` };
  } catch (error) {
    return { verified: false, note: `來源網址無法驗證：${error instanceof Error ? error.message.slice(0, 160) : "連線失敗"}` };
  }
}

export async function generateDailyKnowledge(input: { subject: DailyKnowledgeSubject | "隨機"; date: string; userId?: string }) {
  const subject = input.subject === "隨機" ? DAILY_KNOWLEDGE_SUBJECTS[Math.floor(Math.random() * DAILY_KNOWLEDGE_SUBJECTS.length)] : input.subject;
  const previous = await db.select({ title: dailyKnowledgeItems.title, content: dailyKnowledgeItems.content, coreConcept: dailyKnowledgeItems.coreConcept }).from(dailyKnowledgeItems).where(and(ne(dailyKnowledgeItems.status, "rejected"), ne(dailyKnowledgeItems.status, "archived"))).limit(500);
  const prompt = `你是 StudyNova 的高中生每日知識編輯。請為 ${subject} 產生一則真正有內容的知識，日期 ${input.date}。不要寫基礎常識或空泛勵志句，要讓高中生產生「原來如此」的理解。內容必須能由公開可靠來源支持。不可捏造 source 或 sourceUrl；若不能提出可靠來源，sourceUrl 必須為空字串。請輸出 JSON，欄位為 title、content、detail、subject、topic、source、sourceUrl、coreConcept、quiz。content 需說明現象，detail 需解釋機制、限制或與課程的連結，quiz 要有四個選項與唯一答案。候選舊知識如下，不能改寫它們：${JSON.stringify(previous.slice(-80))}`;
  const result = await runAiJson<DailyKnowledgeDraft>({ feature: "daily_knowledge_generation", userId: input.userId ?? "system", system: "你是嚴格的知識編輯與來源審查助手。不要編造引用。", parts: [{ kind: "text", text: prompt }], maxOutputTokens: 1800, temperature: 0.35 }, {} as DailyKnowledgeDraft);
  const draft = { ...result.data, subject };
  const duplicate = compareDailyKnowledge(draft, previous);
  const source = draft.sourceUrl ? await verifyDailyKnowledgeSource(draft.sourceUrl) : { verified: false, note: "AI 沒有提供可驗證來源，因此不得標記已查證。" };
  return { draft, duplicate, source, meta: result.meta };
}

export async function approveDailyKnowledge(id: string) {
  const item = (await db.select().from(dailyKnowledgeItems).where(eq(dailyKnowledgeItems.id, id)).limit(1))[0];
  if (!item) return null;
  if (item.status === "verifying" && !item.verifiedAt) throw new Error("每日知識尚未完成來源驗證");
  return item;
}
