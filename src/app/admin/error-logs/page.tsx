"use client";

import { formatTaipeiDateTime, parseTaipeiDateTimeInput } from "@/lib/date-time";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import { apiGet, apiPost, useApi } from "@/lib/api";

type Log = {
  id: string;
  userId: string | null;
  userName: string | null;
  userNovaId: string | null;
  level: string;
  scope: string;
  message: string;
  meta: Record<string, unknown>;
  occurrenceCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  createdAt: string;
};

type DebugResult = {
  sourceLogId: string;
  errorCode: string;
  requestId: string;
  summary: string;
  severity: string;
  probableCause: string;
  userSteps: string[];
  adminChecks: string[];
  repairPrompt: string;
  safeToRetry: boolean;
  aiLatencyMs: number | null;
};

type DebugRun = {
  id: string;
  runType: string;
  status: string;
  result: Record<string, unknown>;
  note: string;
  createdAt: string;
};

function fallbackDebug(log: Log): DebugResult {
  const errorCode = String(log.meta.code ?? "SN-SYS-9901");
  const requestId = String(log.meta.requestId ?? "未提供");
  return {
    sourceLogId: log.id,
    errorCode,
    requestId,
    summary: "自動除錯服務暫時無法使用。",
    severity: "中",
    probableCause: "需要稍後重試或人工查看完整錯誤上下文。",
    userSteps: ["保留錯誤代碼與 requestId", "重新整理後再試一次"],
    adminChecks: ["依錯誤代碼查閱 /faq", "稍後重試自動除錯"],
    repairPrompt: `請分析 ${errorCode}（requestId: ${requestId}）並提出最小修復方案。`,
    safeToRetry: true,
    aiLatencyMs: null,
  };
}

export default function ErrorLogsPage() {
  const [level, setLevel] = useState("error");
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [debuggingId, setDebuggingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [debugResults, setDebugResults] = useState<Record<string, DebugResult>>({});
  const [debugHistory, setDebugHistory] = useState<Record<string, DebugRun[]>>({});
  const fromTaipei = parseTaipeiDateTimeInput(from);
  const toTaipei = parseTaipeiDateTimeInput(to);
  const query = useMemo(() => `/admin/error-logs?level=${encodeURIComponent(level)}&scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(q)}${fromTaipei ? `&from=${encodeURIComponent(fromTaipei)}` : ""}${toTaipei ? `&to=${encodeURIComponent(toTaipei)}` : ""}`, [level, scope, q, fromTaipei, toTaipei]);
  const logs = useApi<{ logs: Log[] }>(query, [query]);
  const pdfUrl = `/api/v1/admin/error-logs/pdf?level=${encodeURIComponent(level)}&scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(q)}${fromTaipei ? `&from=${encodeURIComponent(fromTaipei)}` : ""}${toTaipei ? `&to=${encodeURIComponent(toTaipei)}` : ""}`;

  async function loadHistory(logId: string) {
    const history = await apiGet<{ runs: DebugRun[] }>(`/admin/error-logs/${logId}/debug-history`);
    setDebugHistory((current) => ({ ...current, [logId]: history.runs }));
  }

  async function runAutoDebug(log: Log) {
    setDebuggingId(log.id);
    try {
      const result = await apiPost<DebugResult>(`/admin/error-logs/${log.id}/auto-debug`, {});
      setDebugResults((current) => ({ ...current, [log.id]: result }));
      await loadHistory(log.id);
    } catch (error) {
      setDebugResults((current) => ({ ...current, [log.id]: { ...fallbackDebug(log), summary: error instanceof Error ? error.message : "自動除錯失敗" } }));
    } finally {
      setDebuggingId(null);
    }
  }

  async function validateFix(log: Log) {
    setValidatingId(log.id);
    try {
      const result = await apiPost<{ status: string; message: string }>(`/admin/error-logs/${log.id}/validate-fix`, { note: "管理員手動執行修復驗證" });
      setDebugResults((current) => ({ ...current, [log.id]: { ...(current[log.id] ?? fallbackDebug(log)), summary: result.message, severity: result.status === "passed" ? "低" : "高" } }));
      await loadHistory(log.id);
    } catch (error) {
      setDebugResults((current) => ({ ...current, [log.id]: { ...(current[log.id] ?? fallbackDebug(log)), summary: error instanceof Error ? error.message : "修復驗證失敗" } }));
    } finally {
      setValidatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[.24em] text-[#37d3ff]">Control Center / Error Logs</p><h1 className="mt-1 text-2xl font-black">錯誤日誌與診斷</h1><p className="mt-1 text-sm text-muted">錯誤會自動聚合；可查看簡易排除方法、除錯歷史與修復驗證結果。</p></div>
        <a href={pdfUrl} className="rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-semibold text-[#07131b]" target="_blank" rel="noreferrer">列印／下載 PDF</a>
      </div>
      <Card title="篩選錯誤範圍"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Select value={level} onChange={(e) => setLevel(e.target.value)}><option value="error">錯誤</option><option value="perf">效能</option><option value="metric">指標</option><option value="all">全部</option></Select><Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="範圍，例如 weekly" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋錯誤訊息" /><Input aria-label="開始時間（台灣）" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Input aria-label="結束時間（台灣）" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div><p className="mt-2 text-xs text-muted">日期時間篩選以 Asia/Taipei（台灣時間）輸入。</p></Card>
      {logs.loading && <Card><Skeleton lines={7} /></Card>}
      {logs.error && <ErrorState message={logs.error} onRetry={logs.reload} />}
      <Card title={`錯誤紀錄（${logs.data?.logs.length ?? 0} 筆）`} action={<Button size="sm" variant="ghost" onClick={logs.reload}>重新整理</Button>}>
        <div className="space-y-2">
          {logs.data?.logs.map((log) => {
            const debug = debugResults[log.id];
            const history = debugHistory[log.id] ?? [];
            return <details key={log.id} className="glass-soft rounded-xl p-3 text-xs">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><Badge tone={log.level === "error" ? "rose" : "gold"}>{log.level}</Badge><b>{log.scope}</b><span className="max-w-[520px] truncate">{log.message}</span>{(log.occurrenceCount ?? 1) > 1 && <Badge tone="gold">聚合 {log.occurrenceCount} 次</Badge>}</span><time className="text-muted">{formatTaipeiDateTime(log.lastSeenAt ?? log.createdAt)}</time></summary>
              <div className="mt-3 grid gap-1 text-muted sm:grid-cols-2"><span>使用者：<b>{log.userName ?? "系統／排程"}</b></span><span>Nova ID：<code>{log.userNovaId ?? "—"}</code></span><span>User ID：<code>{log.userId ?? "—"}</code></span><span>錯誤代碼：<code>{String(log.meta.code ?? "未提供")}</code></span><span>追蹤編號：<code>{String(log.meta.requestId ?? "未提供")}</code></span><span>首次發生：<time>{formatTaipeiDateTime(log.firstSeenAt ?? log.createdAt)}</time></span></div>
              <p className="mt-3 rounded-lg border border-[#ffc857]/25 bg-[#ffc857]/5 p-3 leading-5 text-[#ffe7ad]"><b>簡易排除方法：</b>{String(log.meta.hint ?? "請保留錯誤代碼與追蹤編號，必要時執行自動除錯。")}</p>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px]">{JSON.stringify(log.meta, null, 2)}</pre>
              <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" loading={debuggingId === log.id} onClick={() => void runAutoDebug(log)}>需要自動除錯</Button><Button size="sm" variant="ghost" loading={validatingId === log.id} onClick={() => void validateFix(log)}>驗證修復</Button><span className="text-[11px] text-muted">診斷與驗證結果都會保留</span></div>
              {debug && <div className="mt-3 space-y-2 rounded-xl border border-cyan-300/35 bg-cyan-300/5 p-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">自動除錯結果</Badge><Badge tone={debug.severity === "高" || debug.severity === "阻斷" ? "rose" : "gold"}>{debug.severity}</Badge><span className="font-mono text-[11px]">{debug.errorCode}・{debug.requestId}</span></div><p><b>摘要：</b>{debug.summary}</p><p><b>可能原因：</b>{debug.probableCause}</p><div><b>建議排除：</b><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{debug.userSteps.map((step) => <li key={step}>{step}</li>)}</ul></div><div><b>管理員檢查：</b><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{debug.adminChecks.map((step) => <li key={step}>{step}</li>)}</ul></div><div><div className="flex items-center justify-between gap-2"><b>直接交給修復 AI：</b><Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(debug.repairPrompt)}>複製指令</Button></div><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-black/25 p-2 leading-5 text-cyan-50">{debug.repairPrompt}</pre></div></div>}
              {history.length > 0 && <div className="mt-3 border-t border-white/10 pt-3"><b>除錯歷史（{history.length} 次）</b><div className="mt-2 space-y-1">{history.map((run) => <div key={run.id} className="flex flex-wrap justify-between gap-2 text-[11px] text-muted"><span>{run.runType === "diagnose" ? "AI 診斷" : "修復驗證"}・{run.status}</span><time>{formatTaipeiDateTime(run.createdAt)}</time></div>)}</div></div>}
            </details>;
          })}
          {!logs.loading && !logs.data?.logs.length && <EmptyState icon="!" title="沒有符合條件的錯誤" hint="可以放寬日期、範圍或 Level 篩選。" />}
        </div>
      </Card>
    </div>
  );
}
