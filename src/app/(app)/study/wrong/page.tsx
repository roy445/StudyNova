"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, Input, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Item = { id: string; subject: string; mastery: number; wrongCount: number; reason: string; question: { stem: string; options: string[]; answer: string[]; explanation: string; type: string } };

export default function WrongQuestionsPage() {
  const toast = useToast();
  const list = useApi<{ items: Item[]; total: number; hasNext: boolean }>("/wrong-questions?limit=30");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { correct: boolean; expected: string[]; explanation: string }>>({});
  async function answer(item: Item) {
    setLoading(item.id);
    try {
      const result = await apiPost<{ correct: boolean; expected: string[]; explanation: string }>(`/wrong-questions/${item.id}/answer`, { response: [responses[item.id] ?? ""] });
      setResults({ ...results, [item.id]: result });
      if (result.correct) await list.reload();
    } catch (err) { toast.push("error", errorMessage(err)); } finally { setLoading(null); }
  }
  return <div className="mx-auto max-w-3xl space-y-4"><Card title="錯題複習" subtitle="依你的錯題記錄重新作答；答案由伺服器依正式題庫驗證。"><div className="flex items-center justify-between text-sm text-muted"><span>尚未解決 {list.data?.total ?? 0} 題</span><Button size="sm" variant="outline" onClick={() => void list.reload()}>重新整理</Button></div></Card>{!list.data?.items.length && <EmptyState icon="✓" title="目前沒有待複習錯題" hint="完成測驗後，答錯的題目會自動出現在這裡。" />}{list.data?.items.map((item) => { const result = results[item.id]; return <Card key={item.id} title={<span className="flex items-center gap-2"><Badge tone="rose">{item.subject}</Badge><span>錯誤 {item.wrongCount} 次</span></span>} subtitle={`掌握度 ${item.mastery}%`}><p className="whitespace-pre-wrap text-sm leading-7">{item.question.stem}</p>{item.question.options?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{item.question.options.map((option) => <button type="button" key={option} onClick={() => setResponses({ ...responses, [item.id]: option })} className={`rounded-xl border p-3 text-left text-sm ${responses[item.id] === option ? "border-[#37d3ff] bg-[#37d3ff]/10" : "border-[var(--line)]"}`}>{option}</button>)}</div>}{item.question.options?.length === 0 && <Input className="mt-3" placeholder="輸入你的答案" value={responses[item.id] ?? ""} onChange={(e) => setResponses({ ...responses, [item.id]: e.target.value })} />}{result && <div className={`mt-3 rounded-xl p-3 text-sm ${result.correct ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{result.correct ? "回答正確，掌握度已更新。" : `再想想；標準答案：${result.expected.join("、")}`}<p className="mt-1 text-xs text-muted">{result.explanation}</p></div>}<Button className="mt-3" loading={loading === item.id} disabled={!responses[item.id]?.trim()} onClick={() => void answer(item)}>送出重做</Button></Card>; })}</div>;
}
