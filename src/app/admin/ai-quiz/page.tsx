"use client";

import { useState } from "react";
import { Badge, Card, Select, Skeleton, Stat } from "@/components/ui";
import { useApi } from "@/lib/api";

type Usage = { days: number; summary: { calls?: number; success?: number; failure?: number; input_tokens?: number; output_tokens?: number; avg_latency_ms?: number }; daily: Array<{ day: string; calls: number; success: number; tokens: number }>; byFeature: Array<{ feature: string; calls: number; success: number; tokens: number }>; byProvider: Array<{ provider: string; calls: number; success: number; tokens: number }> };

export default function AdminAiQuizPage() {
  const [days, setDays] = useState("30");
  const usage = useApi<Usage>(`/admin/ai-quiz/usage?days=${days}`, [days]);
  const summary = usage.data?.summary;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.2em] text-cyan-200">Control Center / AI Question Studio</p><h1 className="mt-1 text-2xl font-black">AI 出題使用量</h1><p className="mt-1 text-sm text-muted">只統計 AI 出題、錯題助教與錯題解析，不會自動刷新。</p></div><Select value={days} onChange={(e) => setDays(e.target.value)} className="!w-auto"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option></Select></header>
    {usage.loading ? <Skeleton lines={4} /> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="AI 呼叫" value={summary?.calls ?? 0} tone="cyan" /><Stat label="成功" value={summary?.success ?? 0} tone="gold" /><Stat label="失敗" value={summary?.failure ?? 0} tone="default" /><Stat label="總 Tokens" value={(summary?.input_tokens ?? 0) + (summary?.output_tokens ?? 0)} tone="violet" /><Stat label="平均延遲" value={`${summary?.avg_latency_ms ?? 0} ms`} /></div>
      <Card title="依功能統計" subtitle="生成題目、錯題解析與 AI 助教的實際用量"><div className="space-y-2">{usage.data?.byFeature.map((item) => <div key={item.feature} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white/[.025] p-3 text-sm"><span>{item.feature}</span><span className="text-muted">{item.calls} 次・成功 {item.success}・Tokens {item.tokens}</span></div>)}</div></Card>
      <div className="grid gap-5 lg:grid-cols-2"><Card title="Provider 使用量"><div className="space-y-2">{usage.data?.byProvider.map((item) => <div key={item.provider} className="flex items-center justify-between rounded-xl border border-[var(--line)] p-3 text-sm"><span>{item.provider}</span><Badge tone="cyan">{item.calls} 次</Badge></div>)}</div></Card><Card title="每日使用量"><div className="max-h-72 space-y-2 overflow-auto">{usage.data?.daily.map((item) => <div key={item.day} className="flex items-center justify-between border-b border-white/10 py-2 text-xs"><span>{item.day}</span><span>{item.calls} 次・成功 {item.success}・{item.tokens} tokens</span></div>)}</div></Card></div>
    </>}
  </div>;
}
