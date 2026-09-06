"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { dailyKnowledge } from "@/data/daily-knowledge";

export default function DailyKnowledgePage({ params }: { params: { date: string } }) {
  const item = dailyKnowledge(params.date);
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/dashboard" className="text-xs text-muted underline">← 回到首頁</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">{item.subject}</Badge><Badge tone="muted">{item.tag}</Badge><span className="text-xs text-muted">命題方向：{item.trend}</span></div>
        <h1 className="mt-3 text-2xl font-bold">{item.title}</h1>
        <p className="mt-4 text-base leading-8 text-muted">{item.body}</p>
        <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
          <p className="text-sm font-semibold">詳細解析</p>
          <p className="mt-2 text-sm leading-8 text-muted">{item.detail}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-[#37d3ff] underline">閱讀外部來源：{item.sourceName} ↗</a>
          <span className="text-muted">資料來源會標示在每篇知識下方</span>
        </div>
      </Card>
      <Card title="🧠 素養小測驗" subtitle="先判斷，再查看解析。">
        <p className="text-sm font-medium leading-7">{item.quiz.question}</p>
        <div className="mt-3 grid gap-2">
          {item.quiz.options.map((option, index) => {
            const correct = index === item.quiz.answer;
            const state = answered ? (correct ? "border-emerald-300/60 bg-emerald-400/10" : selected === index ? "border-rose-300/60 bg-rose-400/10" : "opacity-60") : "hover:bg-white/5";
            return <button key={option} type="button" onClick={() => !answered && setSelected(index)} className={`focus-ring rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm transition ${state}`}><span className="mr-2 text-muted">{String.fromCharCode(65 + index)}.</span>{option}{answered && correct && <span className="float-right text-emerald-300">✓</span>}</button>;
          })}
        </div>
        {answered && <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-7 text-muted"><strong className={selected === item.quiz.answer ? "text-emerald-300" : "text-rose-300"}>{selected === item.quiz.answer ? "答對了！" : "再想一下"}</strong><p>{item.quiz.explanation}</p></div>}
        {answered && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setSelected(null)}>再測一次</Button>}
      </Card>
    </div>
  );
}
