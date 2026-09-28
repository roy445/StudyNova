import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { illustrations } from "@/db/schema";
import { renderSvgToPng } from "./image-rendering/renderer";

export type VisualStyle = "cute" | "handwritten" | "doodle" | "sticker" | "clean";
export type VisualChild = { title: string; summary?: string; color?: string };
export type VisualNode = VisualChild & { children?: VisualChild[] };
export type VisualNote = { title: string; central: string; icon: string; nodes: VisualNode[]; style: VisualStyle; generatedAt: string; illustrationId: string | null; illustrationUrl: string };

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

export async function chooseIllustration(input: { subject?: string; keywords?: string[]; context?: string }) {
  const keywords = (input.keywords ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 8);
  const subject = input.subject?.trim() || "其他";
  const rows = await db.select().from(illustrations).where(and(eq(illustrations.status, "ACTIVE"), or(sql`${illustrations.subjects} @> ${JSON.stringify([subject])}::jsonb`, ilike(illustrations.name, `%${subject}%`)))).orderBy(illustrations.sortOrder).limit(20);
  const fallback = rows[0] ?? (await db.select().from(illustrations).where(eq(illustrations.status, "ACTIVE")).orderBy(illustrations.sortOrder).limit(1))[0];
  if (!fallback) return { id: null, icon: "✦", url: "" };
  const keywordMatch = rows.find((row) => keywords.some((keyword) => (row.keywords ?? []).some((item) => item.includes(keyword) || keyword.includes(item))));
  const selected = keywordMatch ?? fallback;
  return { id: selected.id, icon: selected.fallbackIcon, url: selected.assetUrl };
}

export function normalizeVisualNote(input: { title?: unknown; central?: unknown; nodes?: unknown; style: VisualStyle; icon?: string; illustrationId?: string | null; illustrationUrl?: string }) {
  const nodes = Array.isArray(input.nodes) ? input.nodes.slice(0, 8).map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const children = Array.isArray(item.children) ? item.children.slice(0, 8).map((child) => {
      const value = (child ?? {}) as Record<string, unknown>;
      return { title: String(value.title ?? "重點").trim().slice(0, 80) || "重點", summary: String(value.summary ?? "").slice(0, 180), color: typeof value.color === "string" ? value.color.slice(0, 20) : undefined };
    }) : [];
    return { title: String(item.title ?? `重點 ${index + 1}`).trim().slice(0, 80), summary: String(item.summary ?? "").slice(0, 180), color: typeof item.color === "string" ? item.color.slice(0, 20) : undefined, children };
  }) : [];
  return {
    title: String(input.title ?? "我的學習重點").slice(0, 100),
    central: String(input.central ?? input.title ?? "學習重點").slice(0, 100),
    icon: String(input.icon ?? "✦").slice(0, 8),
    nodes,
    style: input.style,
    generatedAt: new Date().toISOString(),
    illustrationId: input.illustrationId ?? null,
    illustrationUrl: input.illustrationUrl ?? "",
  } satisfies VisualNote;
}

export function visualNoteSvg(note: VisualNote) {
  const colors = ["#b8e8ff", "#ffd6e7", "#d9f7be", "#ffe7a8", "#d9d0ff", "#c8f1e8", "#ffd9b8", "#cfe3ff"];
  const positions = [[150, 100], [70, 385], [150, 675], [1000, 100], [1090, 385], [1000, 675]];
  const dashed = note.style === "handwritten" || note.style === "doodle" ? ' stroke-dasharray="14 12"' : "";
  const nodes = note.nodes.map((node, index) => {
    const [x, y] = positions[index % positions.length];
    const children = (node.children ?? []).slice(0, 2).map((child, childIndex) => `<text x="${x + 18}" y="${y + 107 + childIndex * 17}" font-size="13" fill="#536274">• ${escapeXml(child.title.slice(0, 25))}</text>`).join("");
    return `<g><rect x="${x}" y="${y}" width="300" height="130" rx="28" fill="${escapeXml(node.color || colors[index % colors.length])}" stroke="#7890a4" stroke-width="4"/><text x="${x + 150}" y="${y + 48}" text-anchor="middle" font-size="25" font-weight="700">${escapeXml(node.title.slice(0, 14))}</text><text x="${x + 150}" y="${y + 82}" text-anchor="middle" font-size="16" fill="#536274">${escapeXml((node.summary || "重要概念").slice(0, 22))}</text>${children}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900"><rect width="1400" height="900" rx="36" fill="#fffaf0"/><path d="M700 450 C520 310 420 220 300 170 M700 450 C500 450 370 450 220 450 M700 450 C520 590 420 690 300 740 M700 450 C880 310 980 220 1100 170 M700 450 C900 450 1030 450 1180 450 M700 450 C880 590 980 690 1100 740" fill="none" stroke="#9eb6c9" stroke-width="7" stroke-linecap="round"${dashed}/><g><rect x="510" y="365" width="380" height="170" rx="42" fill="#ffe7a8" stroke="#e1b85d" stroke-width="6"/><text x="700" y="420" text-anchor="middle" font-size="34">${escapeXml(note.icon)}</text><text x="700" y="465" text-anchor="middle" font-size="30" font-weight="800">${escapeXml(note.central.slice(0, 18))}</text><text x="700" y="505" text-anchor="middle" font-size="20" fill="#536274">學習重點</text></g>${nodes}</svg>`;
}

export async function renderVisualNote(note: VisualNote) {
  const svg = visualNoteSvg(note);
  const rendered = await renderSvgToPng(svg);
  return { svg, ...rendered };
}
