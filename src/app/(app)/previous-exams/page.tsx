"use client";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";

type Subject = { id: string; subjectKey: string; subjectName: string; category: string; questionCount: number };
type Collection = { id: string; title: string; examType: string; year: number; description: string; subjects: Subject[] };
export default function PreviousExamsPage() {
  const api = useApi<{ collections: Collection[] }>("/previous-exams/available");
  return <div className="space-y-6 pb-24">
    <header className="rounded-[2rem] border border-violet-300/20 bg-gradient-to-br from-violet-400/15 to-cyan-300/10 p-6 sm:p-8"><p className="text-xs font-black tracking-[.25em] text-violet-200">STUDYNOVA · PAST PAPERS</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">歷屆學測刷題專區</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">依年份、科目與題型練習正式歷屆試題。每題都保留原始頁碼與詳解，作答後可以查看答案、加入錯題，或直接詢問 Novi。</p></header>
    {api.loading && <Card><Skeleton lines={6} /></Card>}
    {api.error && <ErrorState message={api.error} onRetry={api.reload} />}
    {api.data && !api.data.collections.length && <EmptyState icon="⌁" title="目前沒有開放中的歷屆題庫" hint="管理員發布並開放題庫後，這裡會依年份顯示學測科目。" />}
    <div className="grid gap-4 lg:grid-cols-2">{api.data?.collections.map((item) => <Link href={`/previous-exams/${item.id}`} key={item.id} className="group block"><Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-violet-300/50" title={`${item.year} 年 ${item.examType}`} subtitle={item.title}><p className="text-sm leading-6 text-muted">{item.description || "正式歷屆試題與逐題詳解"}</p><div className="mt-4 flex flex-wrap gap-2">{item.subjects.map((subject) => <span key={subject.id} className="rounded-full bg-violet-300/10 px-3 py-1 text-xs text-violet-100">{subject.subjectName}{subject.questionCount ? ` · ${subject.questionCount} 題` : ""}</span>)}</div><p className="mt-5 text-sm font-semibold text-cyan-200">選擇科目開始刷題 →</p></Card></Link>)}</div>
  </div>;
}
