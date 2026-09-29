"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, ErrorState, Skeleton, Stat } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatTaipeiDateTime } from "@/lib/date-time";

type UserAnalytics = {
  user: { displayName: string; email: string; createdAt: string; lastLoginAt: string | null; lastSeenAt: string | null } | null;
  featureUsage: Array<{ feature: string; uses: number; firstUsed: string; lastUsed: string }>;
  events: Array<{ id: string; eventName: string; route: string; occurredAt: string; durationMs: number | null }>;
  activity: Array<{ id: string; action: string; module: string; occurredAt: string; outcome: string }>;
  loginSessions: Array<{ id: string; createdAt: string; expiresAt: string; userAgent: string; ip: string }>;
  sessionStats: { sessions: number; averageMinutes: number; totalMinutes: number };
};

export default function AdminUserAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const data = useApi<UserAnalytics>(params.id ? `/admin/analytics/users/${params.id}` : null, [params.id]);
  if (data.loading) return <Card><Skeleton lines={8} /></Card>;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data?.user) return <Card title="找不到使用者">這個帳號可能已刪除。</Card>;

  const user = data.data.user;
  const analytics = data.data;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin" className="text-xs text-[#7dd3fc] underline">← 返回會員管理</Link>
          <h1 className="mt-2 break-words text-2xl font-black">{user.displayName} 的使用行為分析</h1>
          <p className="break-all text-sm text-muted">{user.email}</p>
        </div>
        <Badge tone="cyan">真實資料・台北時間</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="註冊時間" value={formatTaipeiDateTime(user.createdAt)} />
        <Stat label="最後登入" value={formatTaipeiDateTime(user.lastLoginAt)} />
        <Stat label="最後上線" value={formatTaipeiDateTime(user.lastSeenAt)} />
        <Stat label="Sessions" value={analytics.sessionStats.sessions} />
        <Stat label="使用時間" value={`${analytics.sessionStats.totalMinutes} 分`} tone="gold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="功能使用" subtitle="依 feature_use / feature_start 真實事件；時間含秒">
          <div className="space-y-2">
            {analytics.featureUsage.length ? analytics.featureUsage.map((item) => (
              <div key={item.feature} className="rounded-xl border border-[var(--line)] bg-white/[.03] p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-1"><strong>{item.feature}</strong><span>{item.uses} 次</span></div>
                <p className="mt-1 break-words text-xs text-muted">首次：{formatTaipeiDateTime(item.firstUsed)} ・最近：{formatTaipeiDateTime(item.lastUsed)}</p>
              </div>
            )) : <p className="text-sm text-muted">目前資料不足。</p>}
          </div>
        </Card>
        <Card title="Session 摘要">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted">平均 Session</span><strong>{analytics.sessionStats.averageMinutes} 分鐘</strong></div>
            <div className="flex justify-between gap-2"><span className="text-muted">最近登入 Session</span><strong>{analytics.loginSessions.length} 筆</strong></div>
            <div className="flex justify-between gap-2"><span className="text-muted">目前裝置</span><strong className="max-w-[220px] break-words text-right">{analytics.loginSessions[0]?.userAgent || "尚無資料"}</strong></div>
          </div>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card title="最近活動時間軸" subtitle="時間固定顯示到秒">
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {analytics.activity.length ? analytics.activity.map((item) => (
              <div key={item.id} className="border-l-2 border-[#37d3ff]/40 pl-3 text-sm">
                <p className="break-words">{item.action} <span className="text-xs text-muted">· {item.module}</span></p>
                <p className="break-words text-xs text-muted">{formatTaipeiDateTime(item.occurredAt)} · {item.outcome}</p>
              </div>
            )) : <p className="text-sm text-muted">目前資料不足。</p>}
          </div>
        </Card>
        <Card title="事件明細" subtitle="開發者詳細資訊・台北年月日時分秒">
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {analytics.events.length ? analytics.events.map((item) => (
              <div key={item.id} className="min-w-0 rounded-xl bg-white/[.03] p-2 text-xs">
                <div className="flex flex-wrap justify-between gap-1"><strong className="break-words">{item.eventName}</strong><span className="text-muted">{formatTaipeiDateTime(item.occurredAt)}</span></div>
                <p className="mt-1 break-all font-mono text-muted">{item.route || "—"}{item.durationMs ? ` · ${Math.round(item.durationMs / 60000)} 分鐘` : ""}</p>
              </div>
            )) : <p className="text-sm text-muted">目前資料不足。</p>}
          </div>
        </Card>
      </div>

      <Card title="登入 Session 紀錄" subtitle="最多顯示最近 50 筆；只顯示裝置資訊，不顯示 IP">
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {analytics.loginSessions.length ? analytics.loginSessions.map((session) => (
            <div key={session.id} className="min-w-0 rounded-xl border border-[var(--line)] bg-white/[.03] p-3 text-xs">
              <p className="break-words font-semibold">建立：{formatTaipeiDateTime(session.createdAt)} <span className="font-normal text-muted">・到期：{formatTaipeiDateTime(session.expiresAt)}</span></p>
              <p className="mt-1 break-words text-muted">{session.userAgent || "裝置資訊未提供"}</p>
            </div>
          )) : <p className="text-sm text-muted">目前沒有登入 Session 紀錄。</p>}
        </div>
      </Card>
    </div>
  );
}
