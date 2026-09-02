"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Provider = {
  provider: string;
  priority: number;
  model: string;
  configured: boolean;
  enabled: boolean;
  requests: number;
  success: number;
  failure: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  fallbacks: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: string;
  cooldownUntil: string | null;
  estimatedCostUsd: number;
  inputRatePerMillion: number;
  outputRatePerMillion: number;
};

export default function AdminOpsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("ai");
  const [tick, setTick] = useState(0);
  const ai = useApi<{ providers: Provider[]; failures: Array<{ id: string; provider: string; feature: string; failureCategory: string; createdAt: string }>; byFeature: Array<{ feature: string; c: number; ok: number }>; configured: boolean }>(
    "/admin/ai/health",
    [tick],
  );
  const features = useApi<{ features: Array<{ id: string; feature: string; label: string; enabled: boolean; proOnly: boolean; freeDailyLimit: number; proDailyLimit: number; novaCost: number }> }>("/admin/features");
  const anns = useApi<{ announcements: Array<{ id: string; title: string; body: string; audience: string; pinned: boolean; marquee: boolean; startsAt: string }> }>("/admin/announcements");
  const acts = useApi<{ activities: Array<{ id: string; title: string; cover: string; kind: string; goalMetric: string; goalValue: number; rewardNova: number; rewardXp: number; published: boolean; startsAt: string; endsAt: string; participants: number; completed: number }> }>("/admin/activities");
  const coupons = useApi<{ coupons: Array<{ id: string; code: string; kind: string; value: number; maxRedemptions: number; redeemedCount: number; enabled: boolean }> }>("/admin/coupons");
  const bank = useApi<{ questions: Array<{ id: string; subject: string; stem: string; difficulty: string }>; total: number }>("/admin/questions");
  const usage = useApi<{ usage: Array<{ feature: string; total: number; users: number }> }>("/admin/usage");

  const [annOpen, setAnnOpen] = useState(false);
  const [annForm, setAnnForm] = useState({ title: "", body: "", audience: "all", pinned: false, marquee: false, notify: true, push: false });
  const [actOpen, setActOpen] = useState(false);
  const [actForm, setActForm] = useState({
    title: "",
    description: "",
    cover: "🎉",
    kind: "weekend_double",
    goalMetric: "minutes",
    goalValue: 60,
    rewardNova: 50,
    rewardXp: 100,
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    published: true,
  });
  const [couponForm, setCouponForm] = useState({ code: "", kind: "nova", value: 100, maxRedemptions: 50 });
  const [importJson, setImportJson] = useState("");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (tab !== "ai") return;
    const t = setInterval(() => setTick((v) => v + 1), 15000);
    return () => clearInterval(t);
  }, [tab]);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "ai", label: "AI Health", icon: "🤖" },
          { key: "features", label: "功能權限", icon: "🎛️" },
          { key: "ann", label: "公告", icon: "📢" },
          { key: "act", label: "活動", icon: "🎉" },
          { key: "coupon", label: "優惠碼", icon: "🎫" },
          { key: "bank", label: "題庫匯入", icon: "🗃️" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "ai" && (
        <>
          <Card title="🤖 Gemini API Health" subtitle="每 15 秒自動更新・各 API slot 的用量、成功率、fallback 與冷卻狀態；成本為本地估算">
            {ai.loading && <Skeleton lines={4} />}
            {ai.error && <ErrorState message={ai.error} onRetry={ai.reload} />}
            {!ai.data?.configured && <p className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">尚未設定任何 AI API Key，AI 功能將回傳明確錯誤。</p>}
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2">優先</th>
                    <th className="pb-2">Provider / API Slot / Model</th>
                    <th className="pb-2 text-right">本月請求</th>
                    <th className="pb-2 text-right">成功/失敗</th>
                    <th className="pb-2 text-right">Token 進/出</th>
                    <th className="pb-2 text-right">平均延遲</th>
                    <th className="pb-2 text-right">Fallback</th>
                    <th className="pb-2">最近狀態</th>
                    <th className="pb-2 text-right">估算成本</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {ai.data?.providers.map((p) => (
                    <tr key={p.provider} className="border-t border-[var(--line)]">
                      <td className="py-2">{p.priority}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.provider.startsWith("gemini_") ? `Gemini API ${p.provider.slice(-1)}` : p.provider}</span>
                          <Badge tone={p.configured ? (p.enabled ? "green" : "muted") : "rose"}>{p.configured ? (p.enabled ? "啟用" : "停用") : "未設定"}</Badge>
                        </div>
                        <span className="text-muted">{p.model}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.requests}</td>
                      <td className="py-2 text-right tabular-nums">
                        {p.success}/{p.failure}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {p.inputTokens}/{p.outputTokens}
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.avgLatencyMs}ms</td>
                      <td className="py-2 text-right tabular-nums">{p.fallbacks}</td>
                      <td className="py-2 text-[11px] text-muted">
                        {p.lastSuccessAt && <div>✅ {new Date(p.lastSuccessAt).toLocaleString("zh-TW")}</div>}
                        {p.lastFailureAt && <div>❌ {p.lastFailureCategory}</div>}
                        {p.cooldownUntil && <div className="text-rose-300">冷卻至 {new Date(p.cooldownUntil).toLocaleDateString("zh-TW")}</div>}
                      </td>
                      <td className="py-2 text-right tabular-nums">${p.estimatedCostUsd}</td>
                      <td className="py-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <button
                            className="underline"
                            onClick={async () => {
                              await apiPatch(`/admin/ai/providers/${p.provider}`, { enabled: !p.enabled });
                              await ai.reload();
                            }}
                          >
                            {p.enabled ? "停用" : "啟用"}
                          </button>
                          {p.cooldownUntil && (
                            <button
                              className="underline"
                              onClick={async () => {
                                await apiPatch(`/admin/ai/providers/${p.provider}`, { clearCooldown: true });
                                toast.push("success", "已清除冷卻");
                                await ai.reload();
                              }}
                            >
                              清除冷卻
                            </button>
                          )}
                          <button
                            className="underline"
                            onClick={async () => {
                              const rate = prompt("輸入 input 費率（USD / 1M tokens）", String(p.inputRatePerMillion));
                              if (rate === null) return;
                              const out = prompt("輸入 output 費率（USD / 1M tokens）", String(p.outputRatePerMillion));
                              await apiPatch(`/admin/ai/providers/${p.provider}`, { inputRatePerMillion: Number(rate), outputRatePerMillion: Number(out) });
                              await ai.reload();
                            }}
                          >
                            設定費率
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="本月各功能 AI 使用">
              <div className="space-y-1 text-xs">
                {ai.data?.byFeature.map((f) => (
                  <div key={f.feature} className="flex justify-between border-b border-[var(--line)] py-1">
                    <span>{f.feature}</span>
                    <span className="tabular-nums text-muted">
                      {f.ok}/{f.c} 成功
                    </span>
                  </div>
                ))}
                {!ai.data?.byFeature.length && <EmptyState icon="📉" title="本月尚無 AI 使用紀錄" />}
              </div>
            </Card>
            <Card title="最近失敗紀錄">
              <div className="space-y-1 text-xs">
                {ai.data?.failures.map((f) => (
                  <div key={f.id} className="flex justify-between border-b border-[var(--line)] py-1">
                    <span>
                      {f.provider}・{f.feature}
                    </span>
                    <span className="text-rose-300">{f.failureCategory}</span>
                  </div>
                ))}
                {!ai.data?.failures.length && <EmptyState icon="✅" title="沒有失敗紀錄" />}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === "features" && (
        <Card title="🎛️ 功能權限與額度" subtitle="所有免費／Nova Pro 額度都可在此調整，立即生效">
          {features.loading && <Skeleton lines={5} />}
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2">功能</th>
                  <th className="pb-2">啟用</th>
                  <th className="pb-2">Pro 專屬</th>
                  <th className="pb-2 text-right">免費／日</th>
                  <th className="pb-2 text-right">Pro／日</th>
                  <th className="pb-2 text-right">Nova 消耗</th>
                </tr>
              </thead>
              <tbody>
                {features.data?.features.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--line)]">
                    <td className="py-2">{f.label}</td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        onChange={async (e) => {
                          await apiPatch(`/admin/features/${f.id}`, { enabled: e.target.checked });
                          await features.reload();
                        }}
                        className="accent-[#7c5cff]"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={f.proOnly}
                        onChange={async (e) => {
                          await apiPatch(`/admin/features/${f.id}`, { proOnly: e.target.checked });
                          await features.reload();
                        }}
                        className="accent-[#ffc857]"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        defaultValue={f.freeDailyLimit}
                        onBlur={async (e) => {
                          await apiPatch(`/admin/features/${f.id}`, { freeDailyLimit: Number(e.target.value) });
                          toast.push("success", "已更新");
                        }}
                        className="w-16 rounded border border-[var(--line)] bg-black/20 px-1.5 py-1 text-right"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        defaultValue={f.proDailyLimit}
                        onBlur={async (e) => {
                          await apiPatch(`/admin/features/${f.id}`, { proDailyLimit: Number(e.target.value) });
                          toast.push("success", "已更新");
                        }}
                        className="w-16 rounded border border-[var(--line)] bg-black/20 px-1.5 py-1 text-right"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        defaultValue={f.novaCost}
                        onBlur={async (e) => {
                          await apiPatch(`/admin/features/${f.id}`, { novaCost: Number(e.target.value) });
                          toast.push("success", "已更新");
                        }}
                        className="w-16 rounded border border-[var(--line)] bg-black/20 px-1.5 py-1 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {usage.data?.usage.map((u) => (
              <Stat key={u.feature} label={u.feature} value={u.total} hint={`${u.users} 位使用者（30 天）`} />
            ))}
          </div>
        </Card>
      )}

      {tab === "ann" && (
        <Card title="📢 公告" action={<Button size="sm" onClick={() => setAnnOpen(true)}>＋ 發布公告</Button>}>
          {anns.loading && <Skeleton lines={3} />}
          <div className="space-y-2">
            {anns.data?.announcements.map((a) => (
              <div key={a.id} className="glass-soft p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.pinned && "📌 "}
                    {a.title}
                  </span>
                  <div className="flex gap-1.5">
                    <Badge tone="muted">{a.audience}</Badge>
                    {a.marquee && <Badge tone="cyan">跑馬燈</Badge>}
                    <button
                      className="text-xs underline"
                      onClick={async () => {
                        await apiPatch(`/admin/announcements/${a.id}`, { pinned: !a.pinned });
                        await anns.reload();
                      }}
                    >
                      {a.pinned ? "取消置頂" : "置頂"}
                    </button>
                    <button
                      className="text-xs text-rose-300 underline"
                      onClick={async () => {
                        await apiDelete(`/admin/announcements/${a.id}`);
                        await anns.reload();
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted">{a.body}</p>
              </div>
            ))}
            {!anns.loading && !anns.data?.announcements.length && <EmptyState icon="📭" title="尚未發布公告" />}
          </div>
        </Card>
      )}

      {tab === "act" && (
        <Card title="🎉 活動" action={<Button size="sm" onClick={() => setActOpen(true)}>＋ 建立活動</Button>}>
          {acts.loading && <Skeleton lines={3} />}
          <div className="grid gap-2 sm:grid-cols-2">
            {acts.data?.activities.map((a) => (
              <div key={a.id} className="glass-soft p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.cover} {a.title}
                  </span>
                  <Badge tone={a.published ? "green" : "muted"}>{a.published ? "已發布" : "草稿"}</Badge>
                </div>
                <p className="text-[11px] text-muted">
                  {a.goalMetric} ≥ {a.goalValue}・+{a.rewardNova} Nova / +{a.rewardXp} XP
                </p>
                <p className="text-[11px] text-muted">
                  {new Date(a.startsAt).toLocaleDateString("zh-TW")} ~ {new Date(a.endsAt).toLocaleDateString("zh-TW")}・參加 {a.participants}・完成 {a.completed}
                </p>
                <div className="mt-1.5 flex gap-2 text-xs">
                  <button
                    className="underline"
                    onClick={async () => {
                      await apiPatch(`/admin/activities/${a.id}`, { published: !a.published });
                      await acts.reload();
                    }}
                  >
                    {a.published ? "取消發布" : "發布"}
                  </button>
                  <button
                    className="underline"
                    onClick={async () => {
                      await apiPost(`/admin/activities/${a.id}/duplicate`);
                      toast.push("success", "已複製活動");
                      await acts.reload();
                    }}
                  >
                    複製
                  </button>
                  <button
                    className="text-rose-300 underline"
                    onClick={async () => {
                      await apiDelete(`/admin/activities/${a.id}`);
                      await acts.reload();
                    }}
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
            {!acts.loading && !acts.data?.activities.length && <EmptyState icon="🎈" title="尚未建立活動" />}
          </div>
        </Card>
      )}

      {tab === "coupon" && (
        <Card title="🎫 優惠碼">
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="代碼">
              <Input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="類型">
              <Select value={couponForm.kind} onChange={(e) => setCouponForm({ ...couponForm, kind: e.target.value })}>
                <option value="nova">Nova</option>
                <option value="xp">XP</option>
                <option value="pro">Nova Pro 天數</option>
              </Select>
            </Field>
            <Field label="數值">
              <Input type="number" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: Number(e.target.value) })} />
            </Field>
            <Field label="總使用上限">
              <Input type="number" value={couponForm.maxRedemptions} onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: Number(e.target.value) })} />
            </Field>
          </div>
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              try {
                await apiPost("/admin/coupons", couponForm);
                toast.push("success", "優惠碼已建立");
                setCouponForm({ code: "", kind: "nova", value: 100, maxRedemptions: 50 });
                await coupons.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立優惠碼
          </Button>
          <div className="mt-3 space-y-1 text-xs">
            {coupons.data?.coupons.map((c) => (
              <div key={c.id} className="glass-soft flex items-center justify-between px-3 py-2">
                <span className="font-mono">{c.code}</span>
                <span className="text-muted">
                  {c.kind} +{c.value}・{c.redeemedCount}/{c.maxRedemptions}
                </span>
                <button
                  className="underline"
                  onClick={async () => {
                    await apiPatch(`/admin/coupons/${c.id}`, { enabled: !c.enabled });
                    await coupons.reload();
                  }}
                >
                  {c.enabled ? "停用" : "啟用"}
                </button>
              </div>
            ))}
            {!coupons.data?.coupons.length && <EmptyState icon="🎫" title="尚未建立優惠碼" />}
          </div>
        </Card>
      )}

      {tab === "bank" && (
        <Card title={`🗃️ 題庫（目前 ${bank.data?.total ?? 0} 題）`} subtitle="JSON 陣列格式匯入，無效題目不會阻擋有效題目">
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            className="!min-h-[180px] font-mono text-[11px]"
            placeholder='[{"subject":"英文","topic":"時態","level":"junior","difficulty":"normal","type":"single","stem":"...","options":["A","B","C","D"],"answer":["A"],"explanation":"..."}]'
          />
          <div className="mt-2 flex gap-2">
            <Button
              onClick={async () => {
                try {
                  const items = JSON.parse(importJson);
                  const res = await apiPost<Record<string, unknown>>("/admin/questions/import", { items });
                  setImportResult(res);
                  toast.push("success", `匯入完成：${res.imported} 題`);
                  await bank.reload();
                } catch (err) {
                  toast.push("error", err instanceof SyntaxError ? "JSON 格式錯誤" : errorMessage(err));
                }
              }}
            >
              匯入題庫
            </Button>
          </div>
          {importResult && <pre className="mt-2 max-h-52 overflow-auto scroll-thin rounded-xl bg-black/30 p-2 text-[11px]">{JSON.stringify(importResult, null, 2)}</pre>}
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto scroll-thin text-xs">
            {bank.data?.questions.map((q) => (
              <div key={q.id} className="glass-soft flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="min-w-0 truncate">
                  [{q.subject}] {q.stem}
                </span>
                <button
                  className="text-rose-300"
                  onClick={async () => {
                    await apiDelete(`/admin/questions/${q.id}`);
                    await bank.reload();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={annOpen} onClose={() => setAnnOpen(false)} title="發布公告">
        <div className="space-y-3">
          <Field label="標題" required>
            <Input value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} />
          </Field>
          <Field label="內容">
            <Textarea value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} />
          </Field>
          <Field label="對象">
            <Select value={annForm.audience} onChange={(e) => setAnnForm({ ...annForm, audience: e.target.value })}>
              <option value="all">全體學生</option>
              <option value="pro">Nova Pro 會員</option>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-3 text-xs">
            {([
              ["pinned", "置頂"],
              ["marquee", "首頁跑馬燈"],
              ["notify", "站內通知"],
              ["push", "Web Push"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={annForm[key]}
                  onChange={(e) => setAnnForm({ ...annForm, [key]: e.target.checked })}
                  className="accent-[#7c5cff]"
                />
                {label}
              </label>
            ))}
          </div>
          <Button
            full
            onClick={async () => {
              try {
                const res = await apiPost<{ notified: number }>("/admin/announcements", annForm);
                toast.push("success", `公告已發布，通知 ${res.notified} 位學生`);
                setAnnOpen(false);
                await anns.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            發布
          </Button>
        </div>
      </Modal>

      <Modal open={actOpen} onClose={() => setActOpen(false)} title="建立活動">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="標題" required>
            <Input value={actForm.title} onChange={(e) => setActForm({ ...actForm, title: e.target.value })} />
          </Field>
          <Field label="圖示">
            <Input value={actForm.cover} onChange={(e) => setActForm({ ...actForm, cover: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="說明">
              <Textarea value={actForm.description} onChange={(e) => setActForm({ ...actForm, description: e.target.value })} className="!min-h-[70px]" />
            </Field>
          </div>
          <Field label="類型">
            <Select value={actForm.kind} onChange={(e) => setActForm({ ...actForm, kind: e.target.value })}>
              <option value="weekend_double">週末加倍</option>
              <option value="festival">節日挑戰</option>
              <option value="limited">限時挑戰</option>
              <option value="streak">連續學習</option>
              <option value="quiz">測驗活動</option>
              <option value="focus">專注活動</option>
            </Select>
          </Field>
          <Field label="目標指標">
            <Select value={actForm.goalMetric} onChange={(e) => setActForm({ ...actForm, goalMetric: e.target.value })}>
              <option value="minutes">學習分鐘</option>
              <option value="quiz">完成測驗數</option>
              <option value="words">單字練習數</option>
            </Select>
          </Field>
          <Field label="目標值">
            <Input type="number" value={actForm.goalValue} onChange={(e) => setActForm({ ...actForm, goalValue: Number(e.target.value) })} />
          </Field>
          <Field label="Nova 獎勵">
            <Input type="number" value={actForm.rewardNova} onChange={(e) => setActForm({ ...actForm, rewardNova: Number(e.target.value) })} />
          </Field>
          <Field label="XP 獎勵">
            <Input type="number" value={actForm.rewardXp} onChange={(e) => setActForm({ ...actForm, rewardXp: Number(e.target.value) })} />
          </Field>
          <Field label="開始">
            <Input type="datetime-local" value={actForm.startsAt} onChange={(e) => setActForm({ ...actForm, startsAt: e.target.value })} />
          </Field>
          <Field label="結束">
            <Input type="datetime-local" value={actForm.endsAt} onChange={(e) => setActForm({ ...actForm, endsAt: e.target.value })} />
          </Field>
        </div>
        <Button
          full
          className="mt-3"
          onClick={async () => {
            try {
              await apiPost("/admin/activities", {
                ...actForm,
                startsAt: new Date(actForm.startsAt).toISOString(),
                endsAt: new Date(actForm.endsAt).toISOString(),
              });
              toast.push("success", "活動已建立");
              setActOpen(false);
              await acts.reload();
            } catch (err) {
              toast.push("error", errorMessage(err));
            }
          }}
        >
          建立活動
        </Button>
      </Modal>
    </div>
  );
}
