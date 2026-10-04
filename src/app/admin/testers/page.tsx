"use client";

import { useEffect, useState } from "react";
import { BarChart, LineChart } from "@/components/charts";
import { Badge, Button, Card, Field, Input, Stat, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPut, errorMessage, useApi } from "@/lib/api";

type Member = { userId: string; novaId: string; displayName: string; email: string; status: string };
type SearchUser = { userId: string; novaId: string; displayName: string; email: string; role: string; status: string };
type State = { group: { id: string; name: string; description: string; badge: string; color: string; enabled: boolean }; members: Member[]; features: Array<{ feature: string; label: string; category: string; enabled: boolean; testerEnabled: boolean; testerDescription: string }> };
type Analytics = { kpis: { members: number; totalReports: number; totalPosts: number; totalComments: number; active7: number; active30: number }; daily: Array<{ date: string; reports: number; posts: number; comments: number; activeUsers: number }>; topUsers: Array<{ userId: string; displayName: string; novaId: string; reports: number; posts: number; comments: number; total: number; lastActiveAt: string | null }> };

export default function TesterAdminPage() {
  const toast = useToast();
  const state = useApi<State>("/admin/testers");
  const analytics = useApi<Analytics>("/admin/testers/analytics?days=30");
  const [userSearch, setUserSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const searchPath = userSearch.trim() ? `/admin/users?q=${encodeURIComponent(userSearch.trim())}&page=1&pageSize=20` : null;
  const searchUsers = useApi<{ users: SearchUser[]; total: number }>(searchPath, [userSearch]);

  useEffect(() => {
    if (state.data) setSelectedIds(state.data.members.map((member) => member.userId));
  }, [state.data?.members]);

  useEffect(() => {
    const timer = window.setInterval(() => void analytics.reload(), 15000);
    return () => window.clearInterval(timer);
  }, [analytics.reload]);

  async function saveMembers() {
    setBusy(true);
    try {
      const result = await apiPut<{ memberCount: number }>("/admin/testers/members", { userIds: selectedIds });
      toast.push("success", `測試員成員已更新，共 ${result.memberCount} 人`);
      await state.reload();
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  function toggleMember(userId: string) {
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function toggleFeature(item: State["features"][number]) {
    try {
      await apiPatch(`/admin/testers/features/${encodeURIComponent(item.feature)}`, { testerEnabled: !item.testerEnabled, testerDescription: item.testerDescription });
      toast.push("success", `${item.label} 已${item.testerEnabled ? "關閉" : "開放給測試員"}`);
      await state.reload();
    } catch (error) { toast.push("error", errorMessage(error)); }
  }

  async function exportFeedbackCsv() {
    setExporting(true);
    try {
      const response = await fetch("/api/v1/admin/testers/export", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("無法匯出測試回報 CSV");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `studynova-tester-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.push("success", "測試回報 CSV 已下載");
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setExporting(false); }
  }

  if (state.loading) return <p className="text-sm text-muted">載入測試員控制專區…</p>;
  if (state.error || !state.data) return <p className="text-sm text-rose-200">{state.error ?? "無法載入測試員資料"}</p>;
  const data = state.data;
  const selectedMembers = data.members.filter((member) => selectedIds.includes(member.userId));
  const searchResults = (searchUsers.data?.users ?? []).filter((user) => user.status === "active");

  return <div className="space-y-5">
    <header className="rounded-3xl border border-violet-300/35 bg-gradient-to-br from-violet-400/15 via-white/[.03] to-cyan-300/10 p-5 shadow-[0_0_45px_rgba(167,139,250,.12)] sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.25em] text-violet-200">Beta Operations</p><h1 className="mt-2 text-2xl font-black"><span className="tester-name">測試員管理控制專區</span></h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">管理測試員名單、開關 Beta 功能，並透過既有回報中心直接查看測試結果。測試員不會取得管理員後台權限。</p></div><Button variant="outline" loading={exporting} onClick={() => void exportFeedbackCsv()}>一鍵匯出 CSV</Button></div></header>
    {analytics.data && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Stat label="測試員人數" value={analytics.data.kpis.members} tone="violet" /><Stat label="問題回報總數" value={analytics.data.kpis.totalReports} tone="cyan" /><Stat label="心得貼文" value={analytics.data.kpis.totalPosts} /><Stat label="留言總數" value={analytics.data.kpis.totalComments} /><Stat label="近 7 天活躍" value={analytics.data.kpis.active7} tone="gold" /><Stat label="近 30 天活躍" value={analytics.data.kpis.active30} tone="violet" /></div><div className="grid gap-4 lg:grid-cols-2"><Card title="每日回報活動" subtitle="最近 30 天的問題回報、心得貼文與留言"><BarChart series={analytics.data.daily.map((item) => ({ label: item.date.slice(5), value: item.reports }))} suffix=" 件" /><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted"><span>問題回報<br /><strong className="text-cyan-200">{analytics.data.kpis.totalReports}</strong></span><span>心得貼文<br /><strong className="text-violet-200">{analytics.data.kpis.totalPosts}</strong></span><span>留言<br /><strong className="text-amber-200">{analytics.data.kpis.totalComments}</strong></span></div></Card><Card title="每日活躍測試員" subtitle="當日有回報、發文或留言的去重人數"><LineChart series={analytics.data.daily.map((item) => ({ label: item.date.slice(5), value: item.activeUsers }))} suffix=" 人" color="#a78bfa" /></Card></div><Card title="活躍測試員排行" subtitle="依最近 30 天的問題回報、心得與留言總量排序"><div className="space-y-2">{analytics.data.topUsers.map((user, index) => <div key={user.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-sm"><span className="w-6 text-center font-black text-violet-200">{index + 1}</span><span className="min-w-32 flex-1 font-semibold">{user.displayName}<span className="ml-2 text-xs text-muted">{user.novaId}</span></span><span className="text-xs text-cyan-200">回報 {user.reports}</span><span className="text-xs text-violet-200">貼文 {user.posts}</span><span className="text-xs text-amber-200">留言 {user.comments}</span><strong className="rounded-full bg-white/10 px-2 py-1 text-xs">共 {user.total}</strong></div>)}{!analytics.data.topUsers.length && <p className="text-sm text-muted">最近 30 天尚無測試活動。</p>}</div></Card></section>}
    <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
      <Card title="測試員身分組" subtitle="搜尋使用者名稱或 Nova ID，勾選後儲存即可加入測試員">
        <div className="flex items-center gap-2"><Badge tone="cyan">{data.group.badge}</Badge><span className="tester-name font-bold">{data.group.name}</span><span className="text-xs text-muted">{selectedIds.length} 人已選取</span></div>
        <div className="mt-4"><Field label="搜尋使用者"><Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="輸入姓名或 Nova ID，例如：小明／NV-AB12" /></Field></div>
        {userSearch.trim() && <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-2">{searchUsers.loading && <p className="p-2 text-xs text-muted">搜尋中…</p>}{!searchUsers.loading && !searchResults.length && <p className="p-2 text-xs text-muted">找不到符合的啟用中使用者。</p>}{searchResults.map((user) => <label key={user.userId} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-violet-300/10"><input type="checkbox" checked={selectedIds.includes(user.userId)} onChange={() => toggleMember(user.userId)} className="h-4 w-4 accent-violet-400" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.displayName}</span><span className="block text-[11px] text-muted">{user.novaId} · {user.email}</span></span>{selectedIds.includes(user.userId) && <Badge tone="cyan">已選</Badge>}</label>)}</div>}
        <div className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/[.05] p-3"><p className="text-xs font-bold text-violet-100">目前測試員名單</p><div className="mt-2 flex flex-wrap gap-2">{selectedMembers.map((member) => <button type="button" key={member.userId} onClick={() => toggleMember(member.userId)} className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1 text-xs text-violet-100 transition hover:border-rose-300/50 hover:bg-rose-300/10">{member.displayName}（{member.novaId}） ×</button>)}{!selectedMembers.length && <span className="text-xs text-muted">尚未選取測試員。</span>}</div></div>
        <Button className="tester-button mt-4" loading={busy} onClick={() => void saveMembers()}>儲存測試員名單</Button>
      </Card>
      <Card title="測試員可用功能" subtitle="只有啟用且 testerEnabled 的功能會出現在測試員控制台"><div className="space-y-2">{data.features.map((item) => <div key={item.feature} className="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{item.label}</p><p className="mt-1 text-[11px] text-muted">{item.category} · <code>{item.feature}</code>{!item.enabled && " · 正式功能目前關閉"}</p></div><Button size="sm" variant={item.testerEnabled ? "gold" : "outline"} onClick={() => void toggleFeature(item)}>{item.testerEnabled ? "已開放・關閉" : "開放給測試員"}</Button></div><Textarea className="mt-2 text-xs" rows={2} defaultValue={item.testerDescription} placeholder="給測試員的測試說明（可在功能開放後補充）" onBlur={async (event) => { if (event.target.value === item.testerDescription) return; try { await apiPatch(`/admin/testers/features/${encodeURIComponent(item.feature)}`, { testerEnabled: item.testerEnabled, testerDescription: event.target.value }); await state.reload(); } catch (error) { toast.push("error", errorMessage(error)); } }} /></div>)}{!data.features.length && <p className="text-sm text-muted">尚未建立功能權限。</p>}</div></Card>
    </div>
    <Card title="測試回報與心得看板" subtitle="測試員送出的回報與討論可以分開追蹤"><div className="flex flex-wrap gap-2"><Button onClick={() => { window.location.href = "/admin/support?category=tester"; }}>前往問題回報中心</Button><Button variant="outline" onClick={() => { window.location.href = "/admin/testers/feedback"; }}>開啟心得回饋看板</Button></div></Card>
  </div>;
}
