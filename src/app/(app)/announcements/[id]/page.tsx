"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, ErrorState, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";

type Announcement = { id: string; title: string; body: string; link: string; ctaLabel: string; importance: string; category: string; tags: string[]; image: string; startsAt: string };

export default function AnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const result = useApi<{ announcement: Announcement }>(params.id ? `/announcements/${params.id}` : null, [params.id]);
  if (result.loading) return <Card><Skeleton lines={5} /></Card>;
  if (result.error || !result.data) return <ErrorState message={result.error ?? "公告載入失敗"} onRetry={result.reload} />;
  const item = result.data.announcement;
  return <main className="mx-auto w-full max-w-3xl space-y-4 py-2 sm:py-6">
    <Link href="/dashboard" className="text-sm text-cyan-200 underline">← 回首頁</Link>
    <Card className="overflow-hidden !p-0">
      {item.image && <img src={item.image} alt="" className="h-44 w-full object-cover sm:h-60" />}
      <div className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">重要公告</Badge><Badge tone={item.importance === "critical" ? "rose" : "violet"}>{item.category || "更新"}</Badge></div>
        <h1 className="mt-3 text-2xl font-black text-white sm:text-4xl">{item.title}</h1>
        <p className="mt-2 text-xs text-muted">發布時間：{new Date(item.startsAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
        <p className="mt-6 whitespace-pre-wrap text-sm leading-8 text-slate-200">{item.body}</p>
        {item.tags?.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">#{tag}</span>)}</div>}
        {item.link && item.link !== "/dashboard" && <Link href={item.link} className="mt-7 inline-block"><Button>{item.ctaLabel || "前往功能 →"}</Button></Link>}
      </div>
    </Card>
  </main>;
}
