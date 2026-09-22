"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";

type Log = { id: string; userId: string | null; userName: string | null; userNovaId: string | null; level: string; scope: string; message: string; meta: Record<string, unknown>; createdAt: string };
export default function ErrorLogsPage() {
  const [level, setLevel] = useState("error");
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useMemo(() => `/admin/error-logs?level=${encodeURIComponent(level)}&scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(q)}${from ? `&from=${encodeURIComponent(new Date(from).toISOString())}` : ""}${to ? `&to=${encodeURIComponent(new Date(to).toISOString())}` : ""}`, [level, scope, q, from, to]);
  const logs = useApi<{ logs: Log[] }>(query, [query]);
  const pdfUrl = `/api/v1/admin/error-logs/pdf?level=${encodeURIComponent(level)}&scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(q)}${from ? `&from=${encodeURIComponent(new Date(from).toISOString())}` : ""}${to ? `&to=${encodeURIComponent(new Date(to).toISOString())}` : ""}`;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.24em] text-[#37d3ff]">Control Center / Error Logs</p><h1 className="mt-1 text-2xl font-black">錯誤日誌與診斷</h1><p className="mt-1 text-sm text-muted">查看 API、資料庫、效能與背景工作的錯誤，並依指定日期與範圍匯出 PDF。</p></div><a href={pdfUrl} className="rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-semibold text-[#07131b]" target="_blank" rel="noreferrer">列印／下載 PDF</a></div>
    <Card title="篩選錯誤範圍"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Select value={level} onChange={(e) => setLevel(e.target.value)}><option value="error">錯誤</option><option value="perf">效能</option><option value="metric">指標</option><option value="all">全部</option></Select><Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="範圍，例如 weekly" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋錯誤訊息" /><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Card>
    {logs.loading && <Card><Skeleton lines={7} /></Card>}
    {logs.error && <ErrorState message={logs.error} onRetry={logs.reload} />}
    <Card title={`錯誤紀錄（${logs.data?.logs.length ?? 0} 筆）`} action={<Button size="sm" variant="ghost" onClick={logs.reload}>重新整理</Button>}>
      <div className="space-y-2">{logs.data?.logs.map((log) => <details key={log.id} className="glass-soft rounded-xl p-3 text-xs"><summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><Badge tone={log.level === "error" ? "rose" : "gold"}>{log.level}</Badge><b>{log.scope}</b><span className="max-w-[520px] truncate">{log.message}</span></span><time className="text-muted">{new Date(log.createdAt).toLocaleString("zh-TW")}</time></summary><div className="mt-3 grid gap-1 text-muted sm:grid-cols-2"><span>使用者：<b>{log.userName ?? "系統／排程"}</b></span><span>Nova ID：<code>{log.userNovaId ?? "—"}</code></span><span>User ID：<code>{log.userId ?? "—"}</code></span></div><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px]">{JSON.stringify(log.meta, null, 2)}</pre></details>)}{!logs.loading && !logs.data?.logs.length && <EmptyState icon="!" title="沒有符合條件的錯誤" hint="可以放寬日期、範圍或 Level 篩選。" />}</div>
    </Card>
  </div>;
}
