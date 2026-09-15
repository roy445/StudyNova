"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Select, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { DAILY_SUBJECTS, dailyKnowledge } from "@/data/daily-knowledge";

type ApiItem = { id: string; subject: string; title: string; content: string; detail: string; topic: string; source: string; sourceUrl: string; quiz: { question: string; options: string[]; answer: number; explanation: string } | null };

export default function DailyKnowledgePage({ params }: { params: { date: string } }) {
  const searchParams = useSearchParams();
  const subject = searchParams.get("subject") ?? "隨機";
  const api = useApi<{ item: ApiItem | null; availableSubjects: readonly string[] }>(`/daily-knowledge?date=${encodeURIComponent(params.date)}&subject=${encodeURIComponent(subject)}`, [params.date, subject]);
  const item = api.data?.item;
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  if (api.loading) return <div className="mx-auto max-w-3xl"><Skeleton lines={8} /></div>;
  if (api.error) return <div className="mx-auto max-w-3xl"><ErrorState message={api.error} onRetry={api.reload} /></div>;
  if (!item) return <div className="mx-auto max-w-3xl space-y-4"><Card title="今天還沒有這個科目的每日知識"><EmptyState title="等待管理員核准內容" hint="只有通過來源驗證並標記為 published 的內容才會提供給學生。" /></Card></div>;
  const knowledgeQuiz = item.quiz;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/dashboard" className="text-xs text-muted underline">← 回到首頁</Link>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Select value={subject} onChange={(event) => { window.location.href = `/knowledge/${params.date}?subject=${encodeURIComponent(event.target.value)}`; }}><option value="隨機">隨機</option>{(api.data?.availableSubjects ?? DAILY_SUBJECTS).map((value) => <option key={value} value={value}>{value}</option>)}</Select><Badge tone="cyan">{item.subject}</Badge><Badge tone="muted">{item.topic}</Badge><span className="text-xs text-muted">來源已由管理流程驗證</span></div>
        <h1 className="mt-3 text-2xl font-bold">{item.title}</h1>
        <p className="mt-4 text-base leading-8 text-muted">{item.content}</p>
        <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
          <p className="text-sm font-semibold">詳細解析</p>
          <p className="mt-2 text-sm leading-8 text-muted">{item.detail}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-[#37d3ff] underline">閱讀外部來源：{item.source} ↗</a> : <span className="text-amber-300">目前沒有可驗證來源，因此不標示「已查證」</span>}
        </div>
      </Card>
      {knowledgeQuiz && <Card title="🧠 素養小測驗" subtitle="先判斷，再查看解析。">
        <p className="text-sm font-medium leading-7">{knowledgeQuiz.question}</p>
        <div className="mt-3 grid gap-2">
          {knowledgeQuiz.options.map((option, index) => {
            const correct = index === knowledgeQuiz.answer;
            const state = answered ? (correct ? "border-emerald-300/60 bg-emerald-400/10" : selected === index ? "border-rose-300/60 bg-rose-400/10" : "opacity-60") : "hover:bg-white/5";
            return <button key={option} type="button" onClick={() => !answered && setSelected(index)} className={`focus-ring rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm transition ${state}`}><span className="mr-2 text-muted">{String.fromCharCode(65 + index)}.</span>{option}{answered && correct && <span className="float-right text-emerald-300">✓</span>}</button>;
          })}
        </div>
        {answered && <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-7 text-muted"><strong className={selected === knowledgeQuiz.answer ? "text-emerald-300" : "text-rose-300"}>{selected === knowledgeQuiz.answer ? "答對了！" : "再想一下"}</strong><p>{knowledgeQuiz.explanation}</p></div>}
        {answered && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setSelected(null)}>再測一次</Button>}
      </Card>}
    </div>
  );
}
