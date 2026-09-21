"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPost, apiPut, errorMessage, useApi } from "@/lib/api";

type TestResult = { name: string; group: string; status: "PASS" | "FAIL" | "SKIP"; durationMs: number; detail: string };
type ServiceControl = { enabled: boolean; title: string; description: string; badgeText: string; estimatedRecoveryAt: string | null; message: string; startedAt: string | null; updatedByName: string | null; updatedAt: string | null };
type MaintenanceAction = "start" | "restore";

export default function AdminSystemPage() {
  const toast = useToast();
  const [tab, setTab] = useState("tests");
  const health = useApi<{ services: Array<{ name: string; status: string; detail: string }>; checkedAt: string }>("/admin/system/health");
  const cron = useApi<{ tasks: Array<{ task: string; label: string; schedule: string }>; jobs: Array<{ id: string; name: string; status: string; lastError: string; createdAt: string }>; adapter: string; health: { status: string; detail: string; pending: number }; secretConfigured: boolean }>("/admin/cron");
  const settings = useApi<{ settings: Array<{ key: string; value: Record<string, unknown> }> }>("/admin/settings");
  const gradeWindow = (settings.data?.settings.find((s) => s.key === "grade_input_window")?.value ?? {}) as { enabled?: boolean; startsAt?: string; endsAt?: string };
  const examDateWindow = (settings.data?.settings.find((s) => s.key === "exam_date_input_window")?.value ?? {}) as { enabled?: boolean; startsAt?: string; endsAt?: string };
  const countdowns = (settings.data?.settings.find((s) => s.key === "exam_countdowns")?.value ?? {}) as { exam?: { name?: string; date?: string; enabled?: boolean }; gsat?: { name?: string; date?: string; enabled?: boolean } };
  const exportConfig = (settings.data?.settings.find((s) => s.key === "learning_exports")?.value ?? {}) as { enabled?: boolean; proOnly?: boolean; novaPerKb?: number; minimumNova?: number; allowedKinds?: string[] };
  const logs = useApi<{ logs: Array<{ id: string; level: string; scope: string; message: string; createdAt: string }> }>("/admin/logs?kind=system");
  const service = useApi<ServiceControl>("/admin/service-control");
  const [maintenanceAction, setMaintenanceAction] = useState<MaintenanceAction | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({ title: "系統施工中", description: "StudyNova 目前正在進行系統維護，暫時無法使用。", badgeText: "系統維護中，請稍候", estimatedRecoveryAt: "", message: "維護完成後會自動通知。" });
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; pass: number; fail: number; skip: number; durationMs: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!service.data) return;
    setMaintenanceForm({
      title: service.data.title,
      description: service.data.description,
      badgeText: service.data.badgeText,
      estimatedRecoveryAt: service.data.estimatedRecoveryAt ? service.data.estimatedRecoveryAt.slice(0, 16) : "",
      message: service.data.message,
    });
  }, [service.data]);

  async function saveMaintenance() {
    if (!maintenanceAction) return;
    if (maintenanceAction === "start" && maintenanceForm.estimatedRecoveryAt && new Date(maintenanceForm.estimatedRecoveryAt) <= new Date()) {
      toast.push("error", "預計恢復時間必須晚於現在");
      return;
    }
    try {
      await apiPatch("/admin/service-control", {
        enabled: maintenanceAction === "restore",
        ...maintenanceForm,
        estimatedRecoveryAt: maintenanceForm.estimatedRecoveryAt ? new Date(maintenanceForm.estimatedRecoveryAt).toISOString() : null,
        announceOnEnable: maintenanceAction === "restore",
      });
      toast.push("success", maintenanceAction === "start" ? "已依照設定開啟維護模式" : "已依照設定恢復網站並發送維護完成通知");
      setMaintenanceAction(null);
      await service.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

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
      <Card title="⚡ 維護快捷中心" subtitle={service.data?.enabled === false ? "目前網站維護中；任何變更都必須先完成詳細設定。" : "目前網站正常運作；開始或結束維護前會先顯示完整設定確認。"} action={<Button size="sm" variant="ghost" onClick={service.reload}>重新整理</Button>}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-amber-200">網站維護</p><p className="mt-2 text-sm font-semibold">開始維護模式</p><p className="mt-1 text-xs leading-5 text-muted">設定維護標題、使用者提示、預計恢復時間與維護期間顯示內容。</p><Button className="mt-3" variant="gold" onClick={() => setMaintenanceAction("start")}>設定並開始維護</Button></div>
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">服務恢復</p><p className="mt-2 text-sm font-semibold">恢復網站並通知</p><p className="mt-1 text-xs leading-5 text-muted">設定恢復後的公告內容，確認後才會解除維護並發送站內通知與推播。</p><Button className="mt-3" variant="outline" onClick={() => setMaintenanceAction("restore")}>設定並恢復網站</Button></div>
        </div>
        {service.data && <div className="mt-3 grid gap-1 rounded-xl border border-[var(--line)] bg-white/[0.03] p-3 text-xs text-muted sm:grid-cols-3"><span>狀態：<b className={service.data.enabled ? "text-emerald-200" : "text-amber-200"}>{service.data.enabled ? "正常運作" : "維護中"}</b></span><span>預計恢復：{service.data.estimatedRecoveryAt ? new Date(service.data.estimatedRecoveryAt).toLocaleString("zh-TW") : "未設定"}</span><span>最後修改：{service.data.updatedByName ?? "—"}</span></div>}
      </Card>
      <Tabs
        tabs={[
          { key: "tests", label: "System Test Center", icon: "🧪" },
          { key: "health", label: "系統健康", icon: "❤️" },
          { key: "cron", label: "Cron / Queue", icon: "⏰" },
          { key: "settings", label: "開放設定", icon: "⚙" },
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
        <Card title="● 系統健康" subtitle={health.data ? `檢查於 ${new Date(health.data.checkedAt).toLocaleString("zh-TW")}` : ""} action={<Button size="sm" variant="ghost" onClick={health.reload}>重新檢查</Button>}>
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

      {tab === "settings" && (
        <Card title="⚙ 成績輸入時段" subtitle="只有管理員能控制；前端與後端都會阻擋非開放時段的新增成績。">
          {settings.loading && <Skeleton lines={3} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="目前狀態"><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input id="grade-window-enabled" type="checkbox" defaultChecked={gradeWindow.enabled !== false} className="accent-[#7c5cff]" /> 開放成績輸入</label></Field>
            <Field label="開始時間"><Input id="grade-window-start" type="datetime-local" defaultValue={gradeWindow.startsAt ? new Date(gradeWindow.startsAt).toISOString().slice(0, 16) : ""} /></Field>
            <Field label="結束時間"><Input id="grade-window-end" type="datetime-local" defaultValue={gradeWindow.endsAt ? new Date(gradeWindow.endsAt).toISOString().slice(0, 16) : ""} /></Field>
          </div>
          <Button className="mt-3" onClick={async () => { const enabled = (document.getElementById("grade-window-enabled") as HTMLInputElement).checked; const startsAt = (document.getElementById("grade-window-start") as HTMLInputElement).value; const endsAt = (document.getElementById("grade-window-end") as HTMLInputElement).value; if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) return toast.push("error", "結束時間必須晚於開始時間"); try { await apiPut("/admin/settings/grade_input_window", { value: { enabled, startsAt: startsAt ? new Date(startsAt).toISOString() : "", endsAt: endsAt ? new Date(endsAt).toISOString() : "" } }); toast.push("success", "成績輸入時段已更新"); await settings.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存成績設定</Button>
          <div className="mt-6 border-t border-[var(--line)] pt-4"><p className="mb-3 text-sm font-semibold">⌁ 使用者端段考日期輸入</p><div className="grid gap-3 sm:grid-cols-3"><Field label="目前狀態"><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input id="exam-date-window-enabled" type="checkbox" defaultChecked={examDateWindow.enabled !== false} className="accent-[#7c5cff]" /> 開放段考日期輸入</label></Field><Field label="開始時間"><Input id="exam-date-window-start" type="datetime-local" defaultValue={examDateWindow.startsAt ? new Date(examDateWindow.startsAt).toISOString().slice(0, 16) : ""} /></Field><Field label="結束時間"><Input id="exam-date-window-end" type="datetime-local" defaultValue={examDateWindow.endsAt ? new Date(examDateWindow.endsAt).toISOString().slice(0, 16) : ""} /></Field></div><Button className="mt-3" onClick={async () => { const enabled = (document.getElementById("exam-date-window-enabled") as HTMLInputElement).checked; const startsAt = (document.getElementById("exam-date-window-start") as HTMLInputElement).value; const endsAt = (document.getElementById("exam-date-window-end") as HTMLInputElement).value; if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) return toast.push("error", "結束時間必須晚於開始時間"); try { await apiPut("/admin/settings/exam_date_input_window", { value: { enabled, startsAt: startsAt ? new Date(startsAt).toISOString() : "", endsAt: endsAt ? new Date(endsAt).toISOString() : "" } }); toast.push("success", "段考日期輸入時段已更新"); await settings.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存段考日期設定</Button></div>
          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <p className="mb-3 text-sm font-semibold">⌁ 首頁考試／學測倒數</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="考試名稱"><Input id="countdown-exam-name" defaultValue={countdowns.exam?.name ?? "段考倒數"} /></Field>
              <Field label="考試日期"><Input id="countdown-exam-date" type="date" defaultValue={countdowns.exam?.date ?? ""} /></Field>
              <Field label="學測名稱"><Input id="countdown-gsat-name" defaultValue={countdowns.gsat?.name ?? "學測倒數"} /></Field>
              <Field label="學測日期"><Input id="countdown-gsat-date" type="date" defaultValue={countdowns.gsat?.date ?? ""} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input id="countdown-exam-enabled" type="checkbox" defaultChecked={countdowns.exam?.enabled !== false} className="accent-[#7c5cff]" /> 顯示考試倒數</label><label className="flex items-center gap-2"><input id="countdown-gsat-enabled" type="checkbox" defaultChecked={countdowns.gsat?.enabled !== false} className="accent-[#7c5cff]" /> 顯示學測倒數</label></div>
            <Button className="mt-3" onClick={async () => { try { await apiPut("/admin/settings/exam_countdowns", { value: { exam: { name: (document.getElementById("countdown-exam-name") as HTMLInputElement).value, date: (document.getElementById("countdown-exam-date") as HTMLInputElement).value, enabled: (document.getElementById("countdown-exam-enabled") as HTMLInputElement).checked }, gsat: { name: (document.getElementById("countdown-gsat-name") as HTMLInputElement).value, date: (document.getElementById("countdown-gsat-date") as HTMLInputElement).value, enabled: (document.getElementById("countdown-gsat-enabled") as HTMLInputElement).checked } } }); toast.push("success", "倒數設定已更新"); await settings.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存倒數設定</Button>
          </div>
          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <p className="mb-3 text-sm font-semibold">↥ PRO 匯出與 Nova 收費</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="匯出功能"><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input id="export-enabled" type="checkbox" defaultChecked={exportConfig.enabled !== false} className="accent-[#7c5cff]" /> 開放匯出</label></Field>
              <Field label="會員限制"><label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-sm"><input id="export-pro-only" type="checkbox" defaultChecked={exportConfig.proOnly !== false} className="accent-[#7c5cff]" /> 僅限 PRO</label></Field>
              <Field label="每 KB Nova"><Input id="export-nova-kb" type="number" min={0} step={0.1} defaultValue={String(exportConfig.novaPerKb ?? 1)} /></Field>
              <Field label="最低 Nova"><Input id="export-min-nova" type="number" min={0} defaultValue={String(exportConfig.minimumNova ?? 5)} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input id="export-vocab" type="checkbox" defaultChecked={exportConfig.allowedKinds?.includes("vocabulary") ?? true} className="accent-[#7c5cff]" /> 我的單字</label><label className="flex items-center gap-2"><input id="export-wrong" type="checkbox" defaultChecked={exportConfig.allowedKinds?.includes("wrong") ?? true} className="accent-[#7c5cff]" /> 錯題本</label></div>
            <Button className="mt-3" onClick={async () => { const allowedKinds = [((document.getElementById("export-vocab") as HTMLInputElement).checked ? "vocabulary" : ""), ((document.getElementById("export-wrong") as HTMLInputElement).checked ? "wrong" : "")].filter(Boolean); try { await apiPut("/admin/settings/learning_exports", { value: { enabled: (document.getElementById("export-enabled") as HTMLInputElement).checked, proOnly: (document.getElementById("export-pro-only") as HTMLInputElement).checked, novaPerKb: Number((document.getElementById("export-nova-kb") as HTMLInputElement).value), minimumNova: Number((document.getElementById("export-min-nova") as HTMLInputElement).value), allowedKinds } }); toast.push("success", "匯出收費設定已更新"); await settings.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存匯出設定</Button>
          </div>
        </Card>
      )}
      {tab === "cron" && (
        <Card title="◷ Cron / Queue" subtitle={cron.data ? `Adapter：${cron.data.adapter}・待處理 ${cron.data.health.pending}・CRON_SECRET ${cron.data.secretConfigured ? "已設定" : "未設定"}` : ""}>
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
        <Card title="↥ CSV 匯出" subtitle="所有 CSV 皆為 UTF-8 with BOM，Excel 可直接開啟">
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
        <Card title="▤ System Log">
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
            {!logs.loading && !logs.data?.logs.length && <EmptyState icon="✓" title="沒有系統錯誤紀錄" />}
          </div>
        </Card>
      )}
      <Modal open={maintenanceAction !== null} onClose={() => setMaintenanceAction(null)} title={maintenanceAction === "start" ? "設定網站維護" : "設定恢復網站與通知"} wide>
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-muted">{maintenanceAction === "start" ? "儲存後會立即暫停學生端主要 API。請先確認所有文字、時間與通知內容。" : "儲存後會立即解除維護模式，並依照下方內容建立維護完成公告及通知。"}</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="頁面標題" required><Input value={maintenanceForm.title} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })} /></Field><Field label="徽章文字" required><Input value={maintenanceForm.badgeText} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, badgeText: e.target.value })} /></Field></div>
          <Field label={maintenanceAction === "start" ? "維護說明" : "恢復後公告內容"} required><Textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} className="!min-h-[100px]" /></Field>
          <Field label="使用者提示／通知訊息" required><Textarea value={maintenanceForm.message} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, message: e.target.value })} className="!min-h-[80px]" /></Field>
          <Field label="預計恢復時間" hint="可留空；開始維護時會顯示給使用者"><Input type="datetime-local" value={maintenanceForm.estimatedRecoveryAt} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, estimatedRecoveryAt: e.target.value })} /></Field>
          <Button full onClick={saveMaintenance}>{maintenanceAction === "start" ? "確認設定並開始維護" : "確認設定並恢復網站、發送通知"}</Button>
        </div>
      </Modal>
    </div>
  );
}
