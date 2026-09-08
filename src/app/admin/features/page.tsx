"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, Input, Select, Skeleton, useToast } from "@/components/ui";
import { apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Feature = { id: string; feature: string; label: string; category?: string; enabled: boolean; proOnly: boolean; freeDailyLimit: number; proDailyLimit: number; monthlyLimit: number; novaCost: number };
const CATEGORY: Record<string, string[]> = {
  AI: ["ai", "novi", "solution", "ocr", "quiz"],
  學習: ["word", "vocabulary", "study", "wrong", "sentence", "material", "plan"],
  社交與活動: ["challenge", "activity", "friend", "room"],
  "會員與 Nova": ["nova", "export", "pro", "reward"],
  系統與其他: [],
};
function categoryOf(feature: string) {
  const found = Object.entries(CATEGORY).find(([, keys]) => keys.some((key) => feature.toLowerCase().includes(key)));
  return found?.[0] ?? "系統與其他";
}

export default function AdminFeaturesPage() {
  const toast = useToast();
  const state = useApi<{ features: Feature[] }>("/admin/features");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const features = useMemo(() => (state.data?.features ?? []).filter((feature) => (category === "全部" || categoryOf(feature.feature) === category) && `${feature.feature} ${feature.label}`.toLowerCase().includes(query.toLowerCase())), [category, query, state.data]);
  async function update(feature: Feature, patch: Record<string, unknown>) {
    try { await apiPatch(`/admin/features/${feature.id}`, patch); await state.reload(); toast.push("success", `${feature.label} 設定已更新`); } catch (error) { toast.push("error", errorMessage(error)); }
  }
  async function bulk(enabled: boolean) {
    if (!confirm(`確定要${enabled ? "開啟" : "關閉"}目前分類的功能嗎？`)) return;
    setBusy(true);
    try {
      for (const feature of features) await apiPatch(`/admin/features/${feature.id}`, { enabled, announce: false });
      await state.reload();
      toast.push("success", `已${enabled ? "開啟" : "關閉"} ${features.length} 個功能`);
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <header><h1 className="text-xl font-bold sm:text-2xl">功能總控台</h1><p className="text-xs text-muted sm:text-sm">所有功能由你控制。可分類查看、即時關閉、設定會員限制與 Nova 成本。</p></header>
    <Card title="總控操作" subtitle="關閉功能只會影響使用者端，不會刪除既有資料。">
      <div className="flex flex-wrap items-center gap-2"><Select value={category} onChange={(event) => setCategory(event.target.value)} className="!w-auto"><option>全部</option>{Object.keys(CATEGORY).map((item) => <option key={item}>{item}</option>)}</Select><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋功能名稱…" className="!w-48" /><Button size="sm" variant="ghost" loading={busy} onClick={() => bulk(false)}>關閉目前分類</Button><Button size="sm" loading={busy} onClick={() => bulk(true)}>開啟目前分類</Button><Badge tone="cyan">顯示 {features.length} 項</Badge></div>
    </Card>
    {state.loading && <Card title="載入功能設定"><Skeleton lines={5} /></Card>}
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    <div className="grid gap-3 lg:grid-cols-2">{features.map((feature) => <Card key={feature.id} title={feature.label} subtitle={`${feature.category || categoryOf(feature.feature)} · ${feature.feature}`} action={<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={feature.enabled} onChange={(event) => void update(feature, { enabled: event.target.checked })} /> 啟用</label>}>
      <div className="mb-3 flex items-center gap-2 text-xs"><span className="text-muted">服務分類</span><Select value={feature.category || categoryOf(feature.feature)} onChange={(event) => void update(feature, { category: event.target.value })}>{Object.keys(CATEGORY).map((item) => <option key={item}>{item}</option>)}</Select></div>
      <div className="grid grid-cols-2 gap-2 text-xs"><label className="rounded-xl bg-white/5 p-2">免費每日<input type="number" min={-1} value={feature.freeDailyLimit} onChange={(event) => void update(feature, { freeDailyLimit: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-2 py-1" /></label><label className="rounded-xl bg-white/5 p-2">PRO 每日<input type="number" min={-1} value={feature.proDailyLimit} onChange={(event) => void update(feature, { proDailyLimit: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-2 py-1" /></label><label className="rounded-xl bg-white/5 p-2">每月上限<input type="number" min={0} value={feature.monthlyLimit} onChange={(event) => void update(feature, { monthlyLimit: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-2 py-1" /></label><label className="rounded-xl bg-white/5 p-2">Nova 成本<input type="number" min={0} value={feature.novaCost} onChange={(event) => void update(feature, { novaCost: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-2 py-1" /></label></div>
      <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={feature.proOnly} onChange={(event) => void update(feature, { proOnly: event.target.checked })} /> 僅開放 PRO</label>
    </Card>)}</div>
  </div>;
}
