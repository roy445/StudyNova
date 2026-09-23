"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, ErrorState, Skeleton, Stat } from "@/components/ui";
import { useApi } from "@/lib/api";

type UserAnalytics = {
  user: { displayName: string; email: string; createdAt: string; lastLoginAt: string | null; lastSeenAt: string | null } | null;
  featureUsage: Array<{ feature: string; uses: number; firstUsed: string; lastUsed: string }>;
  events: Array<{ id: string; eventName: string; route: string; occurredAt: string; durationMs: number | null }>;
  activity: Array<{ id: string; action: string; module: string; occurredAt: string; outcome: string }>;
  loginSessions: Array<{ id: string; createdAt: string; expiresAt: string; userAgent: string; ip: string }>;
  sessionStats: { sessions: number; averageMinutes: number; totalMinutes: number };
};

function dateLabel(value: string | null | undefined) { return value ? new Date(value).toLocaleString("zh-TW") : "尚無資料"; }

export default function AdminUserAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const data = useApi<UserAnalytics>(params.id ? `/admin/analytics/users/${params.id}` : null, [params.id]);
  if (data.loading) return <Card><Skeleton lines={8} /></Card>;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data?.user) return <Card title="找不到使用者">這個帳號可能已刪除。</Card>;
  const user = data.data.user;
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/admin" className="text-xs text-[#7dd3fc] underline">← 返回會員管理</Link><h1 className="mt-2 text-2xl font-black">{user.displayName} 的使用行為分析</h1><p className="text-sm text-muted">{user.email}</p></div><Badge tone="cyan">真實資料</Badge></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="加入 StudyNova" value={dateLabel(user.createdAt).slice(0, 10)} /><Stat label="最後登入" value={dateLabel(user.lastLoginAt).slice(0, 16)} /><Stat label="最後上線" value={dateLabel(user.lastSeenAt).slice(0, 16)} /><Stat label="Sessions" value={data.data.sessionStats.sessions} /><Stat label="使用時間" value={`${data.data.sessionStats.totalMinutes} 分`} tone="gold" /></div><div className="grid gap-4 lg:grid-cols-2"><Card title="功能使用" subtitle="依 feature_use / feature_start 真實事件"><div className="space-y-2">{data.data.featureUsage.length ? data.data.featureUsage.map((item) => <div key={item.feature} className="rounded-xl border border-[var(--line)] bg-white/[.03] p-3 text-sm"><div className="flex justify-between"><strong>{item.feature}</strong><span>{item.uses} 次</span></div><p className="mt-1 text-xs text-muted">首次：{dateLabel(item.firstUsed)} ・最近：{dateLabel(item.lastUsed)}</p></div>) : <p className="text-sm text-muted">目前資料不足。</p>}</div></Card><Card title="Session 摘要"><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted">平均 Session</span><strong>{data.data.sessionStats.averageMinutes} 分鐘</strong></div><div className="flex justify-between"><span className="text-muted">最近登入 Session</span><strong>{data.data.loginSessions.length} 筆</strong></div><div className="flex justify-between"><span className="text-muted">目前裝置</span><strong className="max-w-[220px] truncate">{data.data.loginSessions[0]?.userAgent || "尚無資料"}</strong></div></div></Card></div><div className="grid gap-4 lg:grid-cols-2"><Card title="最近活動時間軸"><div className="max-h-[520px] space-y-2 overflow-y-auto">{data.data.activity.length ? data.data.activity.map((item) => <div key={item.id} className="border-l-2 border-[#37d3ff]/40 pl-3 text-sm"><p>{item.action} <span className="text-xs text-muted">· {item.module}</span></p><p className="text-xs text-muted">{dateLabel(item.occurredAt)} · {item.outcome}</p></div>) : <p className="text-sm text-muted">目前資料不足。</p>}</div></Card><Card title="事件明細" subtitle="開發者詳細資訊"><div className="max-h-[520px] space-y-2 overflow-y-auto">{data.data.events.length ? data.data.events.map((item) => <div key={item.id} className="rounded-xl bg-white/[.03] p-2 text-xs"><div className="flex justify-between"><strong>{item.eventName}</strong><span className="text-muted">{dateLabel(item.occurredAt)}</span></div><p className="mt-1 font-mono text-muted">{item.route || "—"}{item.durationMs ? ` · ${Math.round(item.durationMs / 60000)} 分鐘` : ""}</p></div>) : <p className="text-sm text-muted">目前資料不足。</p>}</div></Card></div></div>;
}
