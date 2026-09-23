"use client";

import { useState } from "react";
import { BarChart } from "@/components/charts";
import { Badge, Button, Card, ErrorState, Select, Skeleton, Stat, useToast } from "@/components/ui";
import { apiPut, errorMessage, useApi } from "@/lib/api";

type RegistrationControl = { enabled: boolean; reason: string; reopeningAt: string | null; notice: string; updatedAt: string | null };
type Analytics = {
  range: { days: number; start: string; end: string };
  registration: RegistrationControl;
  kpis: { visitors: number; sessions: number; pageViews: number; registrations: number; logins: number; dau: number; avgSessionMinutes: number; totalMinutes: number };
  popularFeatures: Array<{ feature: string; users: number; uses: number }>;
  pages: Array<{ route: string; views: number; visitors: number }>;
  timeOfDay: Array<{ hour: number; uses: number }>;
  weekdays: Array<{ weekday: number; uses: number }>;
  funnel: Record<string, number>;
};

const funnelLabels: Record<string, string> = { register_cta: "點擊註冊", register_view: "查看註冊頁", register_started: "開始填寫", register_submit: "送出註冊", register_success: "註冊成功", first_login: "第一次登入", feature_use: "開始使用功能" };
const weekdayLabels = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState("30");
  const analytics = useApi<Analytics>(`/admin/analytics?days=${days}`, [days]);
  const [registration, setRegistration] = useState<RegistrationControl | null>(null);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const toast = useToast();

  const currentRegistration = registration ?? analytics.data?.registration;
  async function saveRegistration() {
    if (!currentRegistration) return;
    setSavingRegistration(true);
    try {
      const result = await apiPut<{ registration: RegistrationControl }>("/admin/registration-control", { enabled: currentRegistration.enabled, reason: currentRegistration.reason, reopeningAt: currentRegistration.reopeningAt, notice: currentRegistration.notice });
      setRegistration(result.registration);
      await analytics.reload();
      toast.push("success", currentRegistration.enabled ? "已重新開放註冊" : "已暫停新會員註冊");
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setSavingRegistration(false);
    }
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7dd3fc]">REAL DATA CONTROL CENTER</p><h1 className="mt-1 text-xl font-black sm:text-2xl">網站分析與營運中心</h1><p className="mt-1 text-sm text-muted">所有數字都來自實際事件、登入、註冊與既有 Audit Log；資料不足時會顯示 0，不會補假資料。</p></div>
      <div className="flex items-center gap-2"><span className="text-xs text-muted">統計期間</span><Select value={days} onChange={(event) => setDays(event.target.value)} className="!w-auto"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option></Select><Button size="sm" variant="ghost" onClick={() => void analytics.reload()}>重新整理</Button></div>
    </header>
    {analytics.loading && <Card><Skeleton lines={5} /></Card>}
    {analytics.error && <ErrorState message={analytics.error} onRetry={analytics.reload} />}
    {analytics.data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <Stat label="訪客" value={analytics.data.kpis.visitors} tone="cyan" /><Stat label="Sessions" value={analytics.data.kpis.sessions} /><Stat label="Page Views" value={analytics.data.kpis.pageViews} /><Stat label="新註冊" value={analytics.data.kpis.registrations} tone="cyan" /><Stat label="登入" value={analytics.data.kpis.logins} /><Stat label="DAU" value={analytics.data.kpis.dau} tone="violet" /><Stat label="平均 Session" value={`${analytics.data.kpis.avgSessionMinutes} 分`} tone="gold" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card title="會員註冊控制" subtitle="這裡與註冊頁、註冊 API 共用 platform_settings.registration_control；關閉只阻擋新帳號，不影響登入與既有 Session.">
          {currentRegistration && <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge tone={currentRegistration.enabled ? "green" : "rose"}>{currentRegistration.enabled ? "目前開放註冊" : "目前暫停註冊"}</Badge><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={currentRegistration.enabled} onChange={(event) => setRegistration({ ...currentRegistration, enabled: event.target.checked })} />允許新會員註冊</label></div><label className="block text-xs text-muted">關閉原因<textarea value={currentRegistration.reason} onChange={(event) => setRegistration({ ...currentRegistration, reason: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm text-white" placeholder="例如：目前正在進行系統維護與資料整理。" /></label><label className="block text-xs text-muted">預計重新開放時間<input type="datetime-local" value={currentRegistration.reopeningAt ? currentRegistration.reopeningAt.slice(0, 16) : ""} onChange={(event) => setRegistration({ ...currentRegistration, reopeningAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm text-white" /></label><label className="block text-xs text-muted">給使用者看的公告<textarea value={currentRegistration.notice} onChange={(event) => setRegistration({ ...currentRegistration, notice: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm text-white" placeholder="重新開放後我們會再通知你。" /></label><Button size="sm" loading={savingRegistration} onClick={() => void saveRegistration()}>儲存註冊設定並寫入 Audit Log</Button></div>}
        </Card>
        <Card title="營運摘要" subtitle={`${analytics.data.range.start.slice(0, 10)} 至 ${analytics.data.range.end.slice(0, 10)}`}><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted">總使用時間</span><strong>{analytics.data.kpis.totalMinutes} 分鐘</strong></div><div className="flex justify-between"><span className="text-muted">註冊轉換（訪客→註冊）</span><strong>{analytics.data.kpis.visitors ? `${Math.round(analytics.data.kpis.registrations / analytics.data.kpis.visitors * 100)}%` : "資料不足"}</strong></div><div className="flex justify-between"><span className="text-muted">最常使用星期</span><strong>{analytics.data.weekdays[0] ? weekdayLabels[analytics.data.weekdays[0].weekday] : "資料不足"}</strong></div><div className="flex justify-between"><span className="text-muted">最常使用時段</span><strong>{analytics.data.timeOfDay.length ? `${analytics.data.timeOfDay.slice().sort((a, b) => b.uses - a.uses)[0].hour}:00` : "資料不足"}</strong></div></div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Card title="熱門功能" subtitle="依實際 feature_use / feature_start 事件排序">{analytics.data.popularFeatures.length ? <div className="space-y-2">{analytics.data.popularFeatures.map((item, index) => <div key={item.feature} className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/[.03] px-3 py-2 text-sm"><span><b className="mr-2 text-[#7dd3fc]">#{index + 1}</b>{item.feature}</span><span className="text-xs text-muted">{item.users} 人・{item.uses} 次</span></div>)}</div> : <p className="text-sm text-muted">目前資料不足。</p>}</Card><Card title="頁面使用分析" subtitle="真實 page_view 事件">{analytics.data.pages.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted"><tr><th className="pb-2">頁面</th><th className="pb-2 text-right">瀏覽</th><th className="pb-2 text-right">訪客</th></tr></thead><tbody>{analytics.data.pages.map((item) => <tr key={item.route} className="border-t border-[var(--line)]"><td className="py-2 font-mono">{item.route || "/"}</td><td className="py-2 text-right">{item.views}</td><td className="py-2 text-right">{item.visitors}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted">目前資料不足。</p>}</Card></div>
      <div className="grid gap-4 lg:grid-cols-2"><Card title="註冊漏斗" subtitle="沒有事件的階段會顯示 0，不推測流失原因"><div className="space-y-2">{["register_cta", "register_view", "register_started", "register_submit", "register_success", "first_login", "feature_use"].map((key) => <div key={key} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2 text-sm"><span>{funnelLabels[key]}</span><strong>{analytics.data?.funnel[key] ?? 0}</strong></div>)}</div></Card><Card title="時段分布" subtitle="依真實事件的發生時間"><BarChart series={analytics.data.timeOfDay.map((item) => ({ label: `${item.hour}時`, value: item.uses }))} suffix=" 次" /></Card></div>
    </>}
  </div>;
}
