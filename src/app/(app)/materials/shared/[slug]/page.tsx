"use client";

import { useParams } from "next/navigation";
import { Badge, Card, ErrorState, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";

type SharedMaterial = {
  material: { id: string; title: string; subject: string; kind: string; summary: string; tags: string[]; content: string; createdAt: string };
  pages: Array<{ id: string; pageNumber: number; text: string; fileUrl: string | null }>;
};

export default function SharedMaterialPage() {
  const { slug } = useParams<{ slug: string }>();
  const result = useApi<SharedMaterial>(`/materials/shared/${encodeURIComponent(slug)}`);
  if (result.loading) return <div className="mx-auto max-w-4xl space-y-4 p-5"><Skeleton className="h-12" /><Skeleton className="h-72" /></div>;
  if (result.error || !result.data?.material) return <div className="mx-auto max-w-4xl space-y-3 p-5"><h1 className="text-xl font-semibold">無法開啟分享教材</h1><ErrorState message={result.error || "連結已撤銷、失效，或你不具備查看權限。"} /></div>;
  const { material, pages } = result.data;
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-5">
      <Card title={material.title} subtitle="StudyNova 教材分享">
        <div className="mb-3 flex flex-wrap gap-2"><Badge tone="cyan">{material.subject}</Badge><Badge tone="muted">{material.kind}</Badge>{material.tags.map((tag) => <Badge key={tag} tone="violet">{tag}</Badge>)}</div>
        {material.summary ? <p className="mb-3 rounded-xl bg-white/[.04] p-3 text-sm text-muted">{material.summary}</p> : null}
        <div className="whitespace-pre-wrap break-words text-sm leading-7">{material.content || pages.map((page) => page.text).filter(Boolean).join("\n\n") || "這份教材沒有可顯示的文字內容。"}</div>
      </Card>
      {pages.filter((page) => page.fileUrl).map((page) => (
        <Card key={page.id} title={`原始檔案${pages.length > 1 ? `・第 ${page.pageNumber} 頁` : ""}`}>
          <a className="text-sm text-cyan-200 underline" href={page.fileUrl!} target="_blank" rel="noreferrer">開啟分享檔案</a>
        </Card>
      ))}
    </main>
  );
}
