import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { dailyKnowledgeItems } from "@/db/schema";
import { runAiJson } from "./ai";

export const DAILY_KNOWLEDGE_SUBJECTS = ["國文", "英文", "數學", "自然", "歷史", "地理", "公民", "物理", "化學", "生物", "地球科學"] as const;
export type DailyKnowledgeSubject = typeof DAILY_KNOWLEDGE_SUBJECTS[number];
export type DailyKnowledgeDraft = { title: string; content: string; detail: string; subject: string; topic: string; source: string; sourceUrl: string; sourceType?: string; sourceId?: string; licenseInfo?: string; originalTitle?: string; coreConcept: string; quiz: { question: string; options: string[]; answer: number; explanation: string } };

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

export type SourceCandidate = { title: string; url: string; summary: string; sourceType: string; sourceId: string; licenseInfo: string };

const CURATED_SOURCES: Record<string, SourceCandidate[]> = {
  "數學": [{ title: "Encyclopaedia Britannica Mathematics", url: "https://www.britannica.com/science/mathematics", summary: "Reference material about numbers, quantities, shapes, and patterns.", sourceType: "encyclopedia", sourceId: "britannica-mathematics", licenseInfo: "依來源網站使用條款" }],
  "歷史": [{ title: "World History Encyclopedia", url: "https://www.worldhistory.org/", summary: "Educational reference covering ancient and world history.", sourceType: "education", sourceId: "whe", licenseInfo: "依來源網站使用條款" }],
  "地理": [{ title: "National Geographic Education", url: "https://education.nationalgeographic.org/", summary: "Educational geography and earth science resources.", sourceType: "education", sourceId: "natgeo-education", licenseInfo: "依來源網站使用條款" }],
  "公民": [{ title: "United Nations", url: "https://www.un.org/en/", summary: "Official information about international institutions and global issues.", sourceType: "official", sourceId: "un", licenseInfo: "依聯合國網站使用條款" }],
  "英文": [{ title: "British Council LearnEnglish", url: "https://learnenglish.britishcouncil.org/", summary: "English language learning resources and explanations.", sourceType: "education", sourceId: "british-council", licenseInfo: "依來源網站使用條款" }],
  "國文": [{ title: "教育部重編國語辭典修訂本", url: "https://dict.revised.moe.edu.tw/", summary: "Taiwan Ministry of Education Chinese dictionary reference.", sourceType: "government", sourceId: "moe-dict", licenseInfo: "依教育部網站使用條款" }],
  "自然": [{ title: "NASA Science", url: "https://science.nasa.gov/", summary: "NASA educational science resources and discoveries.", sourceType: "government", sourceId: "nasa-science", licenseInfo: "NASA content generally follows NASA media usage guidelines" }],
  "物理": [{ title: "NASA Science", url: "https://science.nasa.gov/", summary: "NASA educational science resources and discoveries.", sourceType: "government", sourceId: "nasa-science", licenseInfo: "NASA content generally follows NASA media usage guidelines" }],
  "化學": [{ title: "Royal Society of Chemistry Education", url: "https://edu.rsc.org/", summary: "Chemistry education resources from the Royal Society of Chemistry.", sourceType: "research", sourceId: "rsc-education", licenseInfo: "依 RSC 網站使用條款" }],
  "生物": [{ title: "National Institutes of Health", url: "https://www.nih.gov/", summary: "Official biomedical and life-science research information.", sourceType: "government", sourceId: "nih", licenseInfo: "依 NIH 網站使用條款" }],
  "地球科學": [{ title: "USGS Science", url: "https://www.usgs.gov/", summary: "Official earth science and geological research information.", sourceType: "government", sourceId: "usgs", licenseInfo: "USGS information is generally public domain; verify individual assets" }],
};

export async function fetchDailyKnowledgeSources(subject: DailyKnowledgeSubject | "隨機"): Promise<SourceCandidate[]> {
  const feeds = subject === "隨機" || ["自然", "物理", "化學", "生物", "地球科學", "數學"].includes(subject)
    ? ["https://science.nasa.gov/feed/"]
    : ["https://www.smithsonianmag.com/rss/" ];
  const candidates: SourceCandidate[] = [];
  for (const feed of feeds) {
    try {
      const response = await fetch(feed, { signal: AbortSignal.timeout(8000), headers: { accept: "application/rss+xml, application/xml, text/xml" } });
      if (!response.ok) continue;
      const xml = await response.text();
      for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
        const block = item[1];
        const read = (tag: string) => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "’").replace(/&#8220;|&#8221;/g, '"').replace(/\s+/g, " ").trim();
        const title = read("title"); const url = read("link"); const summary = read("description");
        if (title && /^https?:\/\//i.test(url)) candidates.push({ title, url, summary: summary.slice(0, 900), sourceType: "rss", sourceId: url, licenseInfo: "依 RSS 原來源網站使用條款" });
        if (candidates.length >= 8) break;
      }
    } catch { /* External source unavailable: generation remains conservative and unverified. */ }
  }
  return candidates.length ? candidates : (CURATED_SOURCES[subject === "隨機" ? "數學" : subject] ?? CURATED_SOURCES["自然"] ?? []);
}

export async function verifyDailyKnowledgeSource(sourceUrl: string) {
  if (!/^https?:\/\/[^\s]+$/i.test(sourceUrl)) return { verified: false, note: "缺少有效的 http(s) 來源網址，不能標記為已查證。" };
  try {
    let response = await fetch(sourceUrl, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(7000), headers: { accept: "text/html, application/xhtml+xml, application/xml" } });
    if (!response.ok) return { verified: false, note: `來源網址回應 ${response.status}，不能標記為已查證。` };
    const body = await response.text();
    if (body.trim().length < 80) return { verified: false, note: "來源網址可連線，但沒有取得足夠的來源內容。" };
    return { verified: true, note: `已驗證來源網址可存取並取得內容（HTTP ${response.status}，${body.length} 字元）。` };
  } catch (error) {
    return { verified: false, note: `來源網址無法驗證：${error instanceof Error ? error.message.slice(0, 160) : "連線失敗"}` };
  }
}

export async function generateDailyKnowledge(input: { subject: DailyKnowledgeSubject | "隨機"; date: string; userId?: string }) {
  const subject = input.subject === "隨機" ? DAILY_KNOWLEDGE_SUBJECTS[Math.floor(Math.random() * DAILY_KNOWLEDGE_SUBJECTS.length)] : input.subject;
  const sources = await fetchDailyKnowledgeSources(input.subject);
  const previous = await db.select({ title: dailyKnowledgeItems.title, content: dailyKnowledgeItems.content, coreConcept: dailyKnowledgeItems.coreConcept }).from(dailyKnowledgeItems).where(and(ne(dailyKnowledgeItems.status, "rejected"), ne(dailyKnowledgeItems.status, "archived"))).limit(500);
  const prompt = `你是 StudyNova 的高中生每日知識編輯。請為 ${subject} 產生一則真正有內容的知識，日期 ${input.date}。不要寫基礎常識或空泛勵志句，要讓高中生產生「原來如此」的理解。請優先從下列真實公開來源挑選一則與主題相關的內容，sourceUrl 必須逐字使用候選網址，不得自行捏造或改寫網址；若候選來源與科目無關，sourceUrl 必須為空字串。請輸出 JSON，欄位為 title、content、detail、subject、topic、source、sourceUrl、coreConcept、quiz。content 需說明現象，detail 需解釋機制、限制或與課程的連結，quiz 要有四個選項與唯一答案。候選網路來源：${JSON.stringify(sources)}。候選舊知識如下，不能改寫它們：${JSON.stringify(previous.slice(-80))}`;
  const result = await runAiJson<DailyKnowledgeDraft>({ feature: "daily_knowledge_generation", userId: input.userId ?? "system", system: "你是嚴格的知識編輯與來源審查助手。不要編造引用。", parts: [{ kind: "text", text: prompt }], maxOutputTokens: 1800, temperature: 0.35 }, {} as DailyKnowledgeDraft);
  const selectedSource = sources.find((candidate) => candidate.url === result.data.sourceUrl) ?? sources[0];
  const draft = { ...result.data, subject, sourceUrl: result.data.sourceUrl || selectedSource?.url || "", source: result.data.source || selectedSource?.title || "", sourceType: result.data.sourceType || selectedSource?.sourceType || "unknown", sourceId: result.data.sourceId || selectedSource?.sourceId || "", licenseInfo: result.data.licenseInfo || selectedSource?.licenseInfo || "", originalTitle: result.data.originalTitle || selectedSource?.title || "" };
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
