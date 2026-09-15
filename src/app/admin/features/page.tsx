"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, Field, Input, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Feature = { id: string; feature: string; label: string; category?: string; enabled: boolean; proOnly: boolean; freeDailyLimit: number; proDailyLimit: number; monthlyLimit: number; novaCost: number };
type ServiceControl = { enabled: boolean; title: string; description: string; badgeText: string; estimatedRecoveryAt: string | null; message: string; startedAt: string | null; updatedByName: string | null; updatedAt: string | null };
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
  const service = useApi<ServiceControl>("/admin/service-control");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [maintenanceDraft, setMaintenanceDraft] = useState({ title: "系統施工中", description: "StudyNova 目前正在進行系統維護與更新，暫時無法使用。", badgeText: "系統維護中，請稍候", estimatedRecoveryAt: "", message: "請稍後再回來看看！" });
  useEffect(() => {
    if (!service.data) return;
    setMaintenanceDraft({ title: service.data.title, description: service.data.description, badgeText: service.data.badgeText, estimatedRecoveryAt: service.data.estimatedRecoveryAt ? service.data.estimatedRecoveryAt.slice(0, 16) : "", message: service.data.message });
  }, [service.data]);
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
  async function saveService(enabled: boolean) {
    setBusy(true);
    try {
      await apiPatch("/admin/service-control", { enabled, ...maintenanceDraft, estimatedRecoveryAt: maintenanceDraft.estimatedRecoveryAt ? new Date(maintenanceDraft.estimatedRecoveryAt).toISOString() : null });
      await service.reload();
      toast.push("success", enabled ? "全站服務已恢復" : "已開始全站施工");
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <header><h1 className="text-xl font-bold sm:text-2xl">功能總控台</h1><p className="text-xs text-muted sm:text-sm">所有功能由你控制。可分類查看、即時關閉、設定會員限制與 Nova 成本。</p></header>
    <Card title="全站服務總開關" subtitle="施工會在 server-side 擋住公開頁與學生端 App；不刪除 session、不清除 cookie，管理員仍可進入後台恢復。">
      <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs ${service.data?.enabled !== false ? "bg-emerald-400/15 text-emerald-300" : "bg-orange-400/15 text-orange-200"}`}>{service.data?.enabled !== false ? "🟢 正常服務" : "🟠 施工中"}</span><Button size="sm" variant={service.data?.enabled === false ? "primary" : "ghost"} loading={busy} onClick={() => void saveService(true)}>立即恢復服務</Button><Button size="sm" variant="ghost" loading={busy} onClick={() => void saveService(false)}>開始施工</Button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="施工標題"><Input value={maintenanceDraft.title} onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, title: event.target.value }))} /></Field>
        <Field label="封條文字"><Input value={maintenanceDraft.badgeText} onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, badgeText: event.target.value }))} /></Field>
        <Field label="預計恢復時間"><Input type="datetime-local" value={maintenanceDraft.estimatedRecoveryAt} onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, estimatedRecoveryAt: event.target.value }))} /></Field>
        <Field label="自訂通知內容"><Input value={maintenanceDraft.message} onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, message: event.target.value }))} /></Field>
      </div>
      <Field label="施工說明"><Textarea value={maintenanceDraft.description} onChange={(event) => setMaintenanceDraft((draft) => ({ ...draft, description: event.target.value }))} className="mt-1" /></Field>
      {service.data && <div className="mt-4 grid gap-1 rounded-2xl border border-[var(--line)] bg-white/[0.03] p-3 text-xs text-muted sm:grid-cols-2"><span>開始時間：{service.data.startedAt ? new Date(service.data.startedAt).toLocaleString("zh-TW") : "尚未施工"}</span><span>預計恢復：{service.data.estimatedRecoveryAt ? new Date(service.data.estimatedRecoveryAt).toLocaleString("zh-TW") : "未設定"}</span><span>最後修改管理員：{service.data.updatedByName ?? "—"}</span><span>最後修改時間：{service.data.updatedAt ? new Date(service.data.updatedAt).toLocaleString("zh-TW") : "—"}</span></div>}
    </Card>
    <Card title="分類與功能總控" subtitle="關閉功能只會影響使用者端，不會刪除既有資料。">
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
