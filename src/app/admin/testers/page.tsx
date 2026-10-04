"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPut, errorMessage, useApi } from "@/lib/api";

type State = { group: { id: string; name: string; description: string; badge: string; color: string; enabled: boolean }; members: Array<{ userId: string; novaId: string; displayName: string; email: string; status: string }>; features: Array<{ feature: string; label: string; category: string; enabled: boolean; testerEnabled: boolean; testerDescription: string }> };

export default function TesterAdminPage() {
  const toast = useToast();
  const state = useApi<State>("/admin/testers");
  const [memberIds, setMemberIds] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveMembers() {
    setBusy(true);
    try {
      const userIds = memberIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
      const result = await apiPut<{ memberCount: number }>("/admin/testers/members", { userIds });
      toast.push("success", `測試員成員已更新，共 ${result.memberCount} 人`);
      await state.reload();
      setMemberIds("");
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function toggleFeature(item: State["features"][number]) {
    try {
      await apiPatch(`/admin/testers/features/${encodeURIComponent(item.feature)}`, { testerEnabled: !item.testerEnabled, testerDescription: item.testerDescription });
      toast.push("success", `${item.label} 已${item.testerEnabled ? "關閉" : "開放給測試員"}`);
      await state.reload();
    } catch (error) { toast.push("error", errorMessage(error)); }
  }

  if (state.loading) return <p className="text-sm text-muted">載入測試員控制專區…</p>;
  if (state.error || !state.data) return <p className="text-sm text-rose-200">{state.error ?? "無法載入測試員資料"}</p>;
  const data = state.data;

  return <div className="space-y-5">
    <header className="rounded-3xl border border-violet-300/35 bg-gradient-to-br from-violet-400/15 via-white/[.03] to-cyan-300/10 p-5 shadow-[0_0_45px_rgba(167,139,250,.12)] sm:p-7"><p className="text-xs font-black uppercase tracking-[.25em] text-violet-200">Beta Operations</p><h1 className="mt-2 text-2xl font-black"><span className="tester-name">測試員管理控制專區</span></h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">管理測試員名單、開關 Beta 功能，並透過既有回報中心直接查看測試結果。測試員不會取得管理員後台權限。</p></header>
    <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
      <Card title="測試員身分組" subtitle="目前使用現有 Identity Group：測試員"><div className="flex items-center gap-2"><Badge tone="cyan">{data.group.badge}</Badge><span className="tester-name font-bold">{data.group.name}</span><span className="text-xs text-muted">{data.members.length} 人</span></div><p className="mt-3 text-sm text-muted">{data.group.description}</p><div className="mt-4"><Field label="批次加入成員（使用者 UUID，逗號或換行分隔）"><Textarea rows={4} value={memberIds} onChange={(e) => setMemberIds(e.target.value)} placeholder="貼上 users.user_id…" /></Field></div><Button className="tester-button mt-3" loading={busy} onClick={() => void saveMembers()}>儲存測試員名單</Button><div className="mt-4 space-y-2 border-t border-white/10 pt-3">{data.members.map((member) => <div key={member.userId} className="flex items-center justify-between gap-2 rounded-xl bg-white/[.03] px-3 py-2 text-sm"><div><span className="font-semibold">{member.displayName}</span><span className="ml-2 text-xs text-muted">{member.novaId}</span></div><code className="hidden text-[10px] text-muted sm:block">{member.userId}</code></div>)}</div></Card>
      <Card title="測試員可用功能" subtitle="只有啟用且 testerEnabled 的功能會出現在測試員控制台"><div className="space-y-2">{data.features.map((item) => <div key={item.feature} className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{item.label}</p><p className="mt-1 text-[11px] text-muted">{item.category} · <code>{item.feature}</code>{!item.enabled && " · 正式功能目前關閉"}</p></div><Button size="sm" variant={item.testerEnabled ? "gold" : "outline"} onClick={() => void toggleFeature(item)}>{item.testerEnabled ? "已開放・關閉" : "開放給測試員"}</Button></div><Textarea className="mt-2 text-xs" rows={2} defaultValue={item.testerDescription} placeholder="給測試員的測試說明（可在功能開放後補充）" onBlur={async (e) => { if (e.target.value === item.testerDescription) return; try { await apiPatch(`/admin/testers/features/${encodeURIComponent(item.feature)}`, { testerEnabled: item.testerEnabled, testerDescription: e.target.value }); await state.reload(); } catch (error) { toast.push("error", errorMessage(error)); } }} /></div>)}{!data.features.length && <p className="text-sm text-muted">尚未建立功能權限。</p>}</div></Card>
    </div>
    <Card title="測試回報與心得看板" subtitle="測試員送出的回報與討論可以分開追蹤"><div className="flex flex-wrap gap-2"><Button onClick={() => { window.location.href = "/admin/support?category=tester"; }}>前往問題回報中心</Button><Button variant="outline" onClick={() => { window.location.href = "/admin/testers/feedback"; }}>開啟心得回饋看板</Button></div></Card>
  </div>;
}
