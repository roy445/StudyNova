"use client";

import { Card, ErrorState, Skeleton, Stat } from "@/components/ui";
import { SymbolIcon } from "@/components/Symbol";
import { useApi } from "@/lib/api";

type Metric = { count: number; p50: number | null; p95: number | null };
type Performance = { homepage: Record<string, Metric>; api: { requests: number; p50: number | null; p95: number | null; p99: number | null; errorRate: number }; ai: { requests: number; averageMs: number | null; p95: number | null; failures: number }; upload: { averageSpeedBytesPerSecond: number | null; failureRate: number | null }; database: { p95: number | null }; cache: { hitRate: number | null }; recent: Array<{ route: string; method: string; status: number; durationMs: number; requestId: string; timestamp: string }>; collectedAt: string };

function value(value: number | null, suffix = "") { return value === null ? "尚無資料" : `${Math.round(value * 100) / 100}${suffix}`; }

export default function PerformancePage() {
  const data = useApi<Performance>("/admin/performance");
  return <div className="space-y-4">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.24em] text-[#37d3ff]">System Observability</p><h1 className="mt-1 text-2xl font-black">系統效能</h1><p className="mt-1 text-sm text-muted">近 7 日 Production telemetry；不記錄密碼、Token、API Key、私人教材內容或 AI secret。</p></div><SymbolIcon name="grades" size={30} className="text-[#37d3ff]" /></div>
    {data.loading && <Skeleton lines={6} />}
    {data.error && <ErrorState message={data.error} onRetry={data.reload} />}
    {data.data && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="API P50" value={value(data.data.api.p50, " ms")} hint={`${data.data.api.requests} requests`} /><Stat label="API P95" value={value(data.data.api.p95, " ms")} hint="全站 API" /><Stat label="API P99" value={value(data.data.api.p99, " ms")} hint="全站 API" /><Stat label="錯誤率" value={`${(data.data.api.errorRate * 100).toFixed(2)}%`} hint="HTTP status >= 400" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="首頁 Web Vitals" subtitle="瀏覽器回報的 FCP、LCP、CLS、TTI；樣本不足時顯示尚無資料。">
          <div className="grid gap-2 sm:grid-cols-2">{Object.entries(data.data.homepage).map(([name, metric]) => <div key={name} className="rounded-xl border border-[var(--line)] p-3"><div className="flex items-center justify-between text-sm font-semibold"><span>{name}</span><span className="text-xs text-muted">{metric.count} samples</span></div><p className="mt-2 text-xs text-muted">P50：{value(metric.p50, name === "CLS" ? "" : " ms")}</p><p className="mt-1 text-xs text-muted">P95：{value(metric.p95, name === "CLS" ? "" : " ms")}</p></div>)}</div>
        </Card>
        <Card title="AI／上傳／資料庫" subtitle="未接入完整 storage 或 DB tracer 的指標會明確顯示尚無資料，不以猜測代替測量。">
          <div className="space-y-2 text-sm"><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>AI 平均延遲</span><strong>{value(data.data.ai.averageMs, " ms")}</strong></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>AI P95</span><strong>{value(data.data.ai.p95, " ms")}</strong></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>AI 失敗</span><strong>{data.data.ai.failures}</strong></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>Upload 平均速度</span><strong>{data.data.upload.averageSpeedBytesPerSecond === null ? "尚無資料" : `${Math.round(data.data.upload.averageSpeedBytesPerSecond / 1024)} KB/s`}</strong></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>Database P95</span><strong>{value(data.data.database.p95, " ms")}</strong></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3"><span>Cache Hit Rate</span><strong>{data.data.cache.hitRate === null ? "尚無資料" : `${(data.data.cache.hitRate * 100).toFixed(1)}%`}</strong></div></div>
        </Card>
      </div>
      <Card title="最近 API request" subtitle={`資料更新於 ${new Date(data.data.collectedAt).toLocaleString("zh-TW")}；requestId 僅供追蹤。`}>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b border-[var(--line)] text-left text-muted"><th className="p-2">Route</th><th className="p-2">Method</th><th className="p-2">Status</th><th className="p-2">Duration</th><th className="p-2">requestId</th><th className="p-2">Timestamp</th></tr></thead><tbody>{data.data.recent.map((row, index) => <tr key={`${row.requestId}-${index}`} className="border-b border-[var(--line)]/50"><td className="p-2 font-mono">{row.route}</td><td className="p-2">{row.method}</td><td className={`p-2 ${Number(row.status) >= 400 ? "text-rose-300" : "text-[#9ff3c9]"}`}>{row.status}</td><td className="p-2">{row.durationMs} ms</td><td className="p-2 font-mono text-muted">{row.requestId}</td><td className="p-2 text-muted">{new Date(row.timestamp).toLocaleString("zh-TW")}</td></tr>)}</tbody></table>{!data.data.recent.length && <p className="p-4 text-sm text-muted">尚無 API telemetry，使用者請求後會在此顯示。</p>}</div>
      </Card>
    </>}
  </div>;
}
