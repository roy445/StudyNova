"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Stat, Tabs, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type TestResult = { name: string; group: string; status: "PASS" | "FAIL" | "SKIP"; durationMs: number; detail: string };

export default function AdminSystemPage() {
  const toast = useToast();
  const [tab, setTab] = useState("tests");
  const health = useApi<{ services: Array<{ name: string; status: string; detail: string }>; checkedAt: string }>("/admin/system/health");
  const cron = useApi<{ tasks: Array<{ task: string; label: string; schedule: string }>; jobs: Array<{ id: string; name: string; status: string; lastError: string; createdAt: string }>; adapter: string; health: { status: string; detail: string; pending: number }; secretConfigured: boolean }>("/admin/cron");
  const logs = useApi<{ logs: Array<{ id: string; level: string; scope: string; message: string; createdAt: string }> }>("/admin/logs?kind=system");
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; pass: number; fail: number; skip: number; durationMs: number } | null>(null);
  const [running, setRunning] = useState(false);

  const EXPORTS = [
    ["users", "使用者"],
    ["grades", "成績"],
    ["nova", "Nova Ledger"],
    ["ai", "AI 使用量"],
    ["weekly", "每週小考成績"],
    ["activities", "活動參與"],
    ["students", "學生統計"],
  ];

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "tests", label: "System Test Center", icon: "🧪" },
          { key: "health", label: "系統健康", icon: "❤️" },
          { key: "cron", label: "Cron / Queue", icon: "⏰" },
          { key: "export", label: "CSV 匯出", icon: "📤" },
          { key: "logs", label: "System Log", icon: "📜" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tests" && (
        <Card
          title="🧪 System Test Center"
          subtitle="一鍵執行真實整合測試：資料庫、Auth、RBAC、Nova 冪等性、Storage、Queue、AI、Weekly、CSV"
          action={
            <Button
              loading={running}
              onClick={async () => {
                setRunning(true);
                try {
                  const res = await apiPost<{ results: TestResult[]; summary: typeof summary }>("/admin/tests/run");
                  setResults(res.results);
                  setSummary(res.summary);
                  toast.push(res.summary && res.summary.fail === 0 ? "success" : "error", `完成：PASS ${res.summary?.pass}／FAIL ${res.summary?.fail}`);
                } catch (err) {
                  toast.push("error", errorMessage(err));
                } finally {
                  setRunning(false);
                }
              }}
            >
              執行全部測試
            </Button>
          }
        >
          {summary && (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="總數" value={summary.total} />
              <Stat label="PASS" value={summary.pass} tone="cyan" />
              <Stat label="FAIL" value={summary.fail} tone="gold" />
              <Stat label="SKIP" value={summary.skip} />
              <Stat label="總耗時" value={`${summary.durationMs}ms`} />
            </div>
          )}
          {!results && <EmptyState icon="🧪" title="尚未執行測試" hint="點擊右上角按鈕開始執行系統自我測試。" />}
          <div className="space-y-1.5">
            {results?.map((r) => (
              <div key={r.name} className="glass-soft flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "PASS" ? "green" : r.status === "FAIL" ? "rose" : "muted"}>{r.status}</Badge>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted">[{r.group}]</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">{r.detail}</span>
                  <span className="tabular-nums text-muted">{r.durationMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "health" && (
        <Card title="❤️ 系統健康" subtitle={health.data ? `檢查於 ${new Date(health.data.checkedAt).toLocaleString("zh-TW")}` : ""} action={<Button size="sm" variant="ghost" onClick={health.reload}>重新檢查</Button>}>
          {health.loading && <Skeleton lines={5} />}
          {health.error && <ErrorState message={health.error} onRetry={health.reload} />}
          <div className="grid gap-2 sm:grid-cols-2">
            {health.data?.services.map((s) => (
              <div key={s.name} className="glass-soft flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="truncate text-[11px] text-muted">{s.detail}</p>
                </div>
                <Badge tone={s.status === "healthy" ? "green" : s.status === "warning" ? "gold" : "rose"}>{s.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "cron" && (
        <Card title="⏰ Cron / Queue" subtitle={cron.data ? `Adapter：${cron.data.adapter}・待處理 ${cron.data.health.pending}・CRON_SECRET ${cron.data.secretConfigured ? "已設定" : "未設定"}` : ""}>
          {cron.loading && <Skeleton lines={4} />}
          <div className="grid gap-2 sm:grid-cols-2">
            {cron.data?.tasks.map((t) => (
              <div key={t.task} className="glass-soft flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-[11px] text-muted">
                    {t.task}・{t.schedule}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const res = await apiPost<{ deduped: boolean; processed: number; failed: number; results: Array<{ detail: string }> }>("/admin/cron/run", { task: t.task });
                      toast.push(res.failed ? "error" : "success", res.deduped ? "此任務已執行過（冪等保護）" : `完成 ${res.processed} 個工作：${res.results[0]?.detail ?? ""}`);
                      await cron.reload();
                    } catch (err) {
                      toast.push("error", errorMessage(err));
                    }
                  }}
                >
                  立即執行
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-xs">
            <p className="text-muted">最近工作</p>
            {cron.data?.jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between border-b border-[var(--line)] py-1">
                <span>{j.name}</span>
                <span className={j.status === "failed" ? "text-rose-300" : "text-muted"}>
                  {j.status}
                  {j.lastError ? `・${j.lastError.slice(0, 60)}` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-black/25 p-2 text-[11px] text-muted">
            外部排程呼叫方式：<code>POST /api/v1/system/cron?task=daily_tasks_refresh&amp;uid=YYYY-MM-DD</code>，需帶 <code>x-cron-secret</code> 標頭。
          </p>
        </Card>
      )}

      {tab === "export" && (
        <Card title="📤 CSV 匯出" subtitle="所有 CSV 皆為 UTF-8 with BOM，Excel 可直接開啟">
          <div className="grid gap-2 sm:grid-cols-3">
            {EXPORTS.map(([kind, label]) => (
              <a
                key={kind}
                href={`/api/v1/admin/export/${kind}`}
                className="focus-ring glass-soft flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5"
              >
                <span>{label}</span>
                <span className="text-muted">下載 ↓</span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {tab === "logs" && (
        <Card title="📜 System Log">
          {logs.loading && <Skeleton lines={5} />}
          <div className="max-h-[70vh] space-y-1 overflow-y-auto scroll-thin text-xs">
            {logs.data?.logs.map((l) => (
              <div key={l.id} className="glass-soft px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={l.level === "error" ? "rose" : "muted"}>{l.level}</Badge>
                  <span className="text-muted">{new Date(l.createdAt).toLocaleString("zh-TW")}</span>
                </div>
                <p className="mt-0.5">
                  <span className="text-muted">{l.scope}</span>｜{l.message}
                </p>
              </div>
            ))}
            {!logs.loading && !logs.data?.logs.length && <EmptyState icon="✅" title="沒有系統錯誤紀錄" />}
          </div>
        </Card>
      )}
    </div>
  );
}
