"use client";

import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/brand";
import { useApi } from "@/lib/api";

type Announcement = { id: string; title: string; body: string; importance: string; category: string; startsAt: string };

export default function AnnouncementsPage() {
  const result = useApi<{ announcements: Announcement[] }>("/announcements");
  if (result.loading) return <Card><Skeleton lines={6} /></Card>;
  if (result.error) return <ErrorState message={result.error} onRetry={result.reload} />;
  return <main className="mx-auto w-full max-w-4xl space-y-4 py-2 sm:py-6">
    <header className="glass-soft flex items-center gap-4 p-4"><Wordmark size={32} /><div><p className="text-xs uppercase tracking-[.2em] text-cyan-200">StudyNova v1.2.0</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">重要更新公告</h1><p className="mt-2 text-sm text-muted">新功能、使用體驗改善與節慶活動，都會在這裡告訴你。</p></div></header>
    <div className="space-y-3">{result.data?.announcements.map((item) => <Link key={item.id} href={`/announcements/${item.id}`} className="block"><Card className="transition hover:-translate-y-0.5 hover:border-cyan-200/50"><div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">重要更新</Badge><Badge tone={item.importance === "critical" ? "rose" : "violet"}>{item.category || "更新"}</Badge></div><h2 className="mt-2 text-lg font-bold text-white">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{item.body}</p><p className="mt-3 text-xs text-cyan-200">查看完整詳情 →</p></Card></Link>)}{!result.data?.announcements.length && <EmptyState title="目前沒有公告" hint="新功能發布後會在這裡顯示。" />}</div>
  </main>;
}
