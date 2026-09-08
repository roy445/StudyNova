"use client";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui";
import { apiGet, useApi } from "@/lib/api";

type Edition = { id: string; publisher: string; version: string; volume: string; coverUrl: string; stageId: string | null; subjectId: string | null };
type Lesson = { id: string; title: string; description: string; contents: Array<{ id: string; type: string; title: string; body: string }> };
export default function TextbooksPage() {
  const [q, setQ] = useState(""); const [selected, setSelected] = useState<{ edition: Edition; lessons: Lesson[] } | null>(null);
  const list = useApi<{ editions: Edition[] }>(`/textbooks?q=${encodeURIComponent(q)}`, [q]);
  async function open(id: string) { setSelected(await apiGet<{ edition: Edition; lessons: Lesson[] }>(`/textbooks/${id}`)); }
  return <div className="space-y-4">
    <div className="anim-in flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-[#37d3ff]">StudyNova Library</p><h1 className="mt-1 text-2xl font-semibold">教材專區</h1><p className="text-sm text-muted">依教育階段、學校、年級與科目瀏覽真正由管理員建立的內容。</p></div><Input className="w-full sm:w-72" placeholder="搜尋出版社、版本、冊次" value={q} onChange={e => setQ(e.target.value)} /></div>
    {list.loading && <Card><Skeleton lines={5} /></Card>}{list.error && <ErrorState message={list.error} onRetry={list.reload} />}
    {!list.loading && !list.data?.editions.length && <EmptyState icon="▣" title="目前尚無教材" hint="教材上架後會顯示在這裡。" />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.data?.editions.map(e => <button key={e.id} className="glass anim-in text-left transition hover:-translate-y-0.5 hover:border-[#37d3ff]/50" onClick={() => void open(e.id)}><img src={e.coverUrl || "/brand/studynova-logo-square.png"} alt="" className="h-36 w-full rounded-t-[22px] object-cover" onError={ev => { ev.currentTarget.src = "/brand/studynova-logo-square.png"; }} /><div className="space-y-1 p-4"><p className="text-xs text-muted">{e.publisher}</p><h2 className="font-semibold">{e.version || "未命名版本"}</h2><p className="text-sm text-muted">{e.volume || "未指定冊次"}</p></div></button>)}</div>
    {selected && <Card title={`${selected.edition.publisher}・${selected.edition.version}`} action={<button className="text-sm text-muted underline" onClick={() => setSelected(null)}>關閉</button>}><div className="space-y-3">{selected.lessons.map(l => <details key={l.id} className="glass-soft p-3" open><summary className="cursor-pointer font-medium">{l.title}</summary><p className="mt-1 text-sm text-muted">{l.description}</p><div className="mt-3 grid gap-2">{l.contents.map(c => <article key={c.id} className="rounded-xl border border-[var(--line)] p-3"><div className="mb-1 flex items-center gap-2"><Badge tone="cyan">{c.type}</Badge><h3 className="font-medium">{c.title}</h3></div><p className="whitespace-pre-wrap text-sm text-muted">{c.body}</p></article>)}</div></details>)}{!selected.lessons.length && <EmptyState title="此版本尚無課次" />}</div></Card>}
  </div>;
}
