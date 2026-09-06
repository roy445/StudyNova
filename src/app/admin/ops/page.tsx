"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { SymbolIcon } from "@/components/Symbol";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

const DEFAULT_ACTIVITY_START = new Date().toISOString().slice(0, 16);
const DEFAULT_ACTIVITY_END = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
async function prepareQuestionFile(file: File) {
  if (!file.type.startsWith("image/") || file.size <= 3 * 1024 * 1024 || typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp", lastModified: file.lastModified }) : file;
  } catch { return file; }
}

async function uploadQuestionFiles(files: File[], uploadOne: (file: File) => Promise<void>, concurrency = 3) {
  let cursor = 0;
  const worker = async () => { while (cursor < files.length) { const index = cursor; cursor += 1; await uploadOne(await prepareQuestionFile(files[index])); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));
}

const ANNOUNCEMENT_TEMPLATES = [
  { key: "weekly", label: "每週小考開放", title: "每週小考已開放！", body: "本週單字、句子與多元題型測驗已上線，現在就開始挑戰。", link: "/weekly", marquee: true },
  { key: "knowledge", label: "每日知識更新", title: "今日課外知識已更新", body: "前往每日知識，閱讀跨學科內容並完成素養小測驗。", link: "/dashboard#daily-knowledge", marquee: false },
  { key: "challenge", label: "好友挑戰開放", title: "好友挑戰等你來戰！", body: "邀請同學一起進行公平對戰，題目與選項將保持一致。", link: "/challenges", marquee: true },
  { key: "activity", label: "限時活動開始", title: "StudyNova 限時活動開始", body: "活動題庫已開放，完成任務即可獲得 Nova 與 XP 獎勵。", link: "/activities", marquee: true },
  { key: "maintenance", label: "系統維護通知", title: "系統維護通知", body: "StudyNova 將進行例行維護，請提前保存學習進度。", link: "/dashboard", marquee: false },
] as const;

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
  const ai = useApi<{ providers: Provider[]; failures: Array<{ id: string; provider: string; feature: string; failureCategory: string; createdAt: string }>; byFeature: Array<{ feature: string; c: number; ok: number }>; configured: boolean }>(
    "/admin/ai/health",
  );
  const features = useApi<{ features: Array<{ id: string; feature: string; label: string; enabled: boolean; proOnly: boolean; freeDailyLimit: number; proDailyLimit: number; novaCost: number }> }>("/admin/features");
  const anns = useApi<{ announcements: Array<{ id: string; title: string; body: string; link: string; audience: string; pinned: boolean; marquee: boolean; startsAt: string }> }>("/admin/announcements");
  const acts = useApi<{ activities: Array<{ id: string; title: string; cover: string; kind: string; goalMetric: string; goalValue: number; rewardNova: number; rewardXp: number; published: boolean; startsAt: string; endsAt: string; participants: number; completed: number }> }>("/admin/activities");
  const coupons = useApi<{ coupons: Array<{ id: string; code: string; kind: string; value: number; maxRedemptions: number; redeemedCount: number; enabled: boolean }> }>("/admin/coupons");
  const bank = useApi<{ questions: Array<{ id: string; subject: string; topic: string; bankCategory: string; sourceLabel: string; origin: string; type: string; stem: string; difficulty: string; appearedCount: number }>; total: number }>("/admin/questions");
  const usage = useApi<{ usage: Array<{ feature: string; total: number; users: number }> }>("/admin/usage");
  const shop = useApi<{ items: Array<{ id: string; code: string; name: string; category: string; priceNova: number; description: string; requiredLevel: number; proOnly: boolean; enabled: boolean }> }>("/admin/shop/items");
  const essayService = useApi<{ service: { status: "ENABLED" | "PAUSED" | "DISABLED"; proOnly: boolean; novaCost: number; dailyLimit: number; monthlyLimit: number; maintenanceNotice: string; showScores: boolean } }>("/admin/essay-service");

  const [annOpen, setAnnOpen] = useState(false);
  const [annForm, setAnnForm] = useState({ title: "", body: "", link: "/dashboard", category: "general", tags: "", audience: "all", pinned: false, marquee: false, notify: true, push: false, email: false });
  const [pushForm, setPushForm] = useState({ title: "🐦 Novi 測試提醒", message: "你再不來複習，我就要拿望遠鏡找你啦 🔭", link: "/dashboard", audience: "all" });
  const [pushResult, setPushResult] = useState<{ targets: number; notified: number; pushSent: number; configured: boolean } | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const [actForm, setActForm] = useState({
    title: "",
    description: "",
    cover: "✦",
    kind: "weekend_double",
    goalMetric: "minutes",
    goalValue: 60,
    rewardNova: 50,
    rewardXp: 100,
    questionSources: ["activity"] as string[],
    startsAt: DEFAULT_ACTIVITY_START,
    endsAt: DEFAULT_ACTIVITY_END,
    published: true,
  });
  const [couponForm, setCouponForm] = useState({ code: "", kind: "nova", value: 100, maxRedemptions: 50 });
  const [importJson, setImportJson] = useState("");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [bankUploadBusy, setBankUploadBusy] = useState(false);
  const [bankUploadMeta, setBankUploadMeta] = useState({ category: "高中英文", source: "線上上傳題目檔案", target: "general" });
  const [importJob, setImportJob] = useState<{ id: string; status: string; progress: number; processedFiles: number; totalFiles: number; totalQuestions: number; preview: Array<Record<string, unknown>>; errorMessage: string } | null>(null);
  async function patchImportItem(indexes: number[], payload: Record<string, unknown>) {
    if (!importJob) return;
    try {
      const result = await apiPatch<{ job: typeof importJob }>(`/admin/question-imports/${importJob.id}/items`, { indexes, ...payload });
      setImportJob({ ...result.job, id: importJob.id, progress: importJob.progress });
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  async function watchImport(jobId: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const next = await apiGet<{ id: string; status: string; progress: number; processedFiles: number; totalFiles: number; totalQuestions: number; preview: Array<Record<string, unknown>>; errorMessage: string }>(`/admin/question-imports/${jobId}`);
      setImportJob({ ...next, id: jobId });
      if (["ready", "failed", "confirmed"].includes(next.status)) return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }


  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "ai", label: "AI Health", icon: <SymbolIcon name="nova" size={15} /> },
          { key: "features", label: "功能權限", icon: <SymbolIcon name="settings" size={15} /> },
          { key: "essay", label: "作文服務", icon: <SymbolIcon name="pen" size={15} /> },
          { key: "shop", label: "商城管理", icon: <SymbolIcon name="shop" size={15} /> },
          { key: "ann", label: "公告", icon: <SymbolIcon name="report" size={15} /> },
          { key: "act", label: "活動", icon: <SymbolIcon name="challenge" size={15} /> },
          { key: "coupon", label: "優惠碼", icon: <SymbolIcon name="badge" size={15} /> },
          { key: "bank", label: "題庫匯入", icon: <SymbolIcon name="question" size={15} /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "ai" && (
        <>
          <Card
            title="✦ Gemini API Health"
            subtitle="資料只在首次進入或你手動重新整理時更新；各 API slot 的用量、成功率、fallback 與冷卻狀態"
            action={
              <Button size="sm" variant="ghost" onClick={() => ai.reload()} disabled={ai.loading}>
                {ai.loading ? "更新中…" : "重新整理"}
              </Button>
            }
          >
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
                        {p.lastSuccessAt && <div><span className="text-[#37d3ff]">●</span> {new Date(p.lastSuccessAt).toLocaleString("zh-TW")}</div>}
                        {p.lastFailureAt && <div><span className="text-rose-300">●</span> {p.lastFailureCategory}</div>}
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
                {!ai.data?.byFeature.length && <EmptyState icon="⌁" title="本月尚無 AI 使用紀錄" />}
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
                {!ai.data?.failures.length && <EmptyState icon="✓" title="沒有失敗紀錄" />}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === "features" && (
        <Card title="⌁ 功能權限與額度" subtitle="所有免費／Nova Pro 額度都可在此調整，立即生效">
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

      {tab === "essay" && (
        <Card title="英文作文批改服務設定" subtitle="服務狀態、PRO 限制、Nova 消耗與配額由 Backend 驗證；前端只負責顯示與提交設定。">
          {essayService.loading && <Skeleton lines={4} />}
          {essayService.error && <ErrorState message={essayService.error} onRetry={essayService.reload} />}
          {essayService.data?.service && <EssayServiceEditor value={essayService.data.service} onSaved={essayService.reload} toast={toast} />}
        </Card>
      )}

      {tab === "shop" && (
        <Card title="▧ Novi 商城管理" subtitle="調整 Nova 價格與上架狀態；下架或重新上架時會自動建立公告並通知使用者。">
          {shop.loading && <Skeleton lines={5} />}
          {shop.error && <ErrorState message={shop.error} onRetry={shop.reload} />}
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[760px] text-xs">
              <thead><tr className="text-left text-muted"><th className="pb-2">商品</th><th className="pb-2">分類</th><th className="pb-2">限制</th><th className="pb-2 text-right">Nova 價格</th><th className="pb-2 text-center">上架</th></tr></thead>
              <tbody>
                {shop.data?.items.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--line)]">
                    <td className="py-2"><p className="font-medium">{item.name}</p><p className="text-[10px] text-muted">{item.description}</p></td>
                    <td className="py-2 text-muted">{item.category}</td>
                    <td className="py-2">{item.proOnly ? <Badge tone="gold">PRO</Badge> : `Lv.${item.requiredLevel}`}</td>
                    <td className="py-2 text-right"><input type="number" min={0} max={100000} defaultValue={item.priceNova} onBlur={async (e) => { const priceNova = Number(e.target.value); if (!Number.isInteger(priceNova) || priceNova < 0) return toast.push("error", "價格必須是 0 以上整數"); try { await apiPatch(`/admin/shop/items/${item.id}`, { priceNova }); toast.push("success", `${item.name} 價格已更新`); await shop.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }} className="w-24 rounded border border-[var(--line)] bg-black/20 px-1.5 py-1 text-right" /></td>
                    <td className="py-2 text-center"><input type="checkbox" checked={item.enabled} onChange={async (e) => { try { await apiPatch(`/admin/shop/items/${item.id}`, { enabled: e.target.checked, announce: true }); toast.push("success", e.target.checked ? "商品已上架並發出公告" : "商品已下架並發出公告"); await shop.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }} className="accent-[#7c5cff]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "ann" && (
        <>
        <Card title="⌁ 推播測試" subtitle="可選擇全部使用者、PRO、一般使用者或管理員／後台權力擁有者；每位符合條件者都會建立站內通知並嘗試發送 Web Push。">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="測試範例">
              <Select value="custom" onChange={(e) => {
                const examples: Record<string, typeof pushForm> = {
                  custom: pushForm,
                  welcome: { title: "🌟 Novi 歡迎你回來", message: "今天先完成 10 個單字，讓進步從一小步開始！", link: "/dashboard", audience: "all" },
                  inactive: { title: "🐦 Novi 的小提醒", message: "你再不來複習，我就要拿望遠鏡找你啦 🔭", link: "/study", audience: "users" },
                  weekly: { title: "🏁 每週小考開放", message: "準備好和好友比一場了嗎？現在就來挑戰！", link: "/weekly", audience: "all" },
                  reward: { title: "🎁 限定獎勵解鎖", message: "完成今日任務即可領取 Nova 與 XP，快來看看！", link: "/profile?tab=nova", audience: "pro" },
                };
                setPushForm(examples[e.target.value] ?? examples.custom);
              }}>
                <option value="custom">自訂內容</option><option value="welcome">歡迎回來</option><option value="inactive">久未登入</option><option value="weekly">每週小考</option><option value="reward">限定獎勵</option>
              </Select>
            </Field>
            <Field label="收件身分組"><Select value={pushForm.audience} onChange={(e) => setPushForm({ ...pushForm, audience: e.target.value })}><option value="all">全部啟用帳號</option><option value="pro">PRO 使用者</option><option value="users">一般使用者</option><option value="admin">管理員／後台權力擁有者</option></Select></Field>
            <Field label="標題"><Input value={pushForm.title} onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })} /></Field>
            <Field label="跳轉連結"><Input value={pushForm.link} onChange={(e) => setPushForm({ ...pushForm, link: e.target.value })} /></Field>
          </div>
          <Field label="通知內容"><Textarea value={pushForm.message} onChange={(e) => setPushForm({ ...pushForm, message: e.target.value })} /></Field>
          <Button size="sm" className="mt-2" onClick={async () => { try { const result = await apiPost<{ targets: number; notified: number; pushSent: number; configured: boolean }>("/admin/push/test", pushForm); setPushResult(result); toast.push("success", `已通知 ${result.notified} 人，Web Push 發送 ${result.pushSent} 台裝置`); } catch (err) { toast.push("error", errorMessage(err)); } }}>立即發送給選定身分組</Button>
          {pushResult && <p className="mt-2 text-xs text-muted">最近一次：目標 {pushResult.targets} 人・站內通知 {pushResult.notified} 人・Web Push {pushResult.pushSent} 台・VAPID {pushResult.configured ? "已設定" : "未設定（僅站內通知）"}</p>}
        </Card>
        <Card title="▤ 公告範例" subtitle="以下範例尚未發布；可在發布視窗快速套用並修改。">
          <div className="grid gap-2 sm:grid-cols-2">
            {ANNOUNCEMENT_TEMPLATES.map((preset) => <button key={preset.key} type="button" className="glass-soft text-left p-3 transition hover:bg-white/10" onClick={() => { setAnnForm({ ...annForm, title: preset.title, body: preset.body, link: preset.link, marquee: preset.marquee }); setAnnOpen(true); }}><p className="text-sm font-semibold">{preset.title}</p><p className="mt-1 text-xs text-muted">{preset.body}</p><p className="mt-1 text-[11px] text-[#7dd3fc]">點擊跳轉：{preset.link}</p></button>)}
          </div>
        </Card>
        <Card title="▤ 公告" action={<Button size="sm" onClick={() => setAnnOpen(true)}>＋ 發布公告</Button>}>
          {anns.loading && <Skeleton lines={3} />}
          <div className="space-y-2">
            {anns.data?.announcements.map((a) => (
              <div key={a.id} className="glass-soft p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.pinned && "• "}
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
            {!anns.loading && !anns.data?.announcements.length && <EmptyState icon="▤" title="尚未發布公告" />}
                    </div>
        </Card>
        </>
      )}
      {tab === "act" && (
        <Card title="◇ 活動" action={<Button size="sm" onClick={() => setActOpen(true)}>＋ 建立活動</Button>}>
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
            {!acts.loading && !acts.data?.activities.length && <EmptyState icon="◇" title="尚未建立活動" />}
          </div>
        </Card>
      )}

      {tab === "coupon" && (
        <Card title="▧ 優惠碼">
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
            {!coupons.data?.coupons.length && <EmptyState icon="▧" title="尚未建立優惠碼" />}
          </div>
        </Card>
      )}

      {tab === "bank" && (
        <Card title={`▦ 題庫（目前 ${bank.data?.total ?? 0} 題）`} subtitle="可直接上傳 PDF／圖片，系統會在線上儲存、解析、去重並匯入題庫">
          <div className="mb-4 rounded-2xl border border-[#37d3ff]/30 bg-[#37d3ff]/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">▤ 線上匯入題目檔案</p><p className="mt-1 text-xs leading-5 text-muted">PDF、PNG、JPG、WEBP、MP3、WAV、M4A，單檔最多 50MB。AI 會掃描整份文件與最後幾頁；無法確認的題目保留並標記 NEEDS_REVIEW。</p></div><Badge tone="cyan">Vercel Blob ・ AI OCR</Badge></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><Field label="題庫分類"><Input value={bankUploadMeta.category} onChange={(e) => setBankUploadMeta({ ...bankUploadMeta, category: e.target.value })} placeholder="例如：高中英文" /></Field><Field label="來源名稱"><Input value={bankUploadMeta.source} onChange={(e) => setBankUploadMeta({ ...bankUploadMeta, source: e.target.value })} placeholder="例如：高一週考 PDF" /></Field><Field label="目標題庫"><Select value={bankUploadMeta.target} onChange={(e) => setBankUploadMeta({ ...bankUploadMeta, target: e.target.value })}><option value="general">一般題庫</option><option value="activity">活動題庫</option><option value="exclusive">專屬題庫</option><option value="weekly">每週小考題庫</option></Select></Field></div>
            <label className={`mt-3 flex min-h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed transition ${bankUploadBusy ? "cursor-wait border-white/10 opacity-60" : "border-[#37d3ff]/50 hover:bg-white/5"}`}><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/ogg,audio/webm" multiple disabled={bankUploadBusy} className="sr-only" onChange={async (e) => { const files = Array.from(e.target.files ?? []); if (!files.length) return; setBankUploadBusy(true); try { const created = await apiPost<{ jobId: string }>("/admin/question-imports", { totalFiles: files.length, bankCategory: bankUploadMeta.category, sourceLabel: bankUploadMeta.source, targetBank: bankUploadMeta.target }); setImportJob({ id: created.jobId, status: "uploading", progress: 0, processedFiles: 0, totalFiles: files.length, totalQuestions: 0, preview: [], errorMessage: "" }); await uploadQuestionFiles(files, async (file) => { await upload(file.name, file, { access: "private", handleUploadUrl: "/api/blob/question-bank-upload", clientPayload: JSON.stringify({ jobId: created.jobId, bankCategory: bankUploadMeta.category, sourceLabel: bankUploadMeta.source }), multipart: file.size > 5 * 1024 * 1024 }); }); setBankUploadBusy(false); void watchImport(created.jobId); } catch (err) { setBankUploadBusy(false); toast.push("error", errorMessage(err)); } finally { e.target.value = ""; } }} /><span className="text-center text-sm">{bankUploadBusy ? "正在上傳檔案…" : "點擊選擇 PDF 或圖片（可多選）"}<span className="mt-1 block text-xs text-muted">上傳後會顯示逐檔分析進度，完成後先預覽再確認匯入</span></span></label>
            {importJob && <div className="mt-3 rounded-xl bg-black/20 p-3"><div className="flex justify-between text-xs"><span>{importJob.status === "ready" ? "分析完成，等待確認" : importJob.status === "confirmed" ? "已確認匯入" : "AI 分析中…"}</span><span>{importJob.processedFiles}/{importJob.totalFiles} 個檔案・{importJob.totalQuestions} 題</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#37d3ff] to-[#7c5cff] transition-all" style={{ width: `${importJob.progress}%` }} /></div>{importJob.status === "ready" && <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted">請先檢查下方題目預覽，確認後才會正式寫入題庫。</span><Button size="sm" onClick={async () => { const result = await apiPost<{ imported: number }>(`/admin/question-imports/${importJob.id}/confirm`, {}); setImportJob({ ...importJob, status: "confirmed" }); toast.push("success", `已確認匯入 ${result.imported} 題`); await bank.reload(); }}>確認匯入</Button></div>}{importJob.errorMessage && <p className="mt-2 text-xs text-amber-300">{importJob.errorMessage}</p>}</div>}
            {importJob?.preview.length ? <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto rounded-xl bg-black/20 p-2 text-xs">{importJob.preview.slice(0, 100).map((item, index) => { const status = String(item.status || "NEEDS_REVIEW"); const excluded = item.importAction === "exclude"; const confidence = Number(item.confidence || (item.metadata as Record<string, unknown> | undefined)?.confidence || 0); const reasons = Array.isArray(item.reviewReasons) ? item.reviewReasons.map(String) : []; return <div key={`${String(item.stem)}-${index}`} className={`rounded-lg border p-3 ${excluded ? "border-white/10 opacity-50" : status === "READY" ? "border-[#9ff3c9]/30" : "border-amber-300/40"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="font-semibold">{index + 1}. {String(item.stem)}</div><Badge tone={status === "READY" ? "cyan" : status === "DUPLICATE" ? "rose" : "gold"}>{excluded ? "EXCLUDED" : status}</Badge></div><div className="mt-1 text-muted">{String(item.subject || "其他")}・{String(item.topic || "未分類")}・{String(item.type || "short")}・信心：{confidence ? `${Math.round(confidence * 100)}%` : "未提供"}</div><div className="mt-1 text-muted">AI答案：{Array.isArray(item.answer) && item.answer.length ? item.answer.join("／") : "答案無法確認"}・來源：{String(item.answerSource || "待人工確認")}{item.sourcePage ? `・第 ${String(item.sourcePage)} 頁` : ""}</div>{Array.isArray(item.options) && item.options.length > 0 && <div className="mt-1 text-muted">選項：{item.options.join("｜")}</div>}{Boolean(item.explanation) && <div className="mt-1 leading-5 text-sky-200/80">解析：{String(item.explanation)}</div>}{reasons.length > 0 && <p className="mt-2 rounded-lg bg-amber-300/10 p-2 text-amber-100">{reasons.join("；")}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => { const next = window.prompt("修改題目文字", String(item.stem || "")); if (next !== null) void patchImportItem([index], { patch: { stem: next } }); }}>編輯題目</Button><Button size="sm" variant="ghost" onClick={() => void patchImportItem([index], { action: excluded ? "include" : "exclude" })}>{excluded ? "納入匯入" : "排除本題"}</Button><Button size="sm" variant="ghost" onClick={() => void patchImportItem([index], { action: "review" })}>標記待審核</Button></div></div>; })}</div> : null}
          </div>
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            className="!min-h-[180px] font-mono text-[11px]"
            placeholder='[{"subject":"英文","topic":"時態","bankCategory":"高中英文","sourceLabel":"高一週考 PDF","level":"senior","difficulty":"normal","type":"single","stem":"...","options":["A","B","C","D"],"answer":["A"],"explanation":"..."}]'
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
                  [{q.subject}・{q.bankCategory || "一般"}・{q.sourceLabel || q.origin}・{q.topic || "未分類"}・{q.type}] {q.stem}
                </span>
                <span className="shrink-0 text-muted">出現 {q.appearedCount} 次</span>
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
          <Field label="快速套用範例">
            <Select value="" onChange={(e) => { const preset = ANNOUNCEMENT_TEMPLATES.find((item) => item.key === e.target.value); if (preset) setAnnForm({ ...annForm, title: preset.title, body: preset.body, link: preset.link, marquee: preset.marquee }); }}>
              <option value="">選擇公告範例…</option>
              {ANNOUNCEMENT_TEMPLATES.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
            </Select>
          </Field>
          <Field label="標題" required>
            <Input value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} />
          </Field>
          <Field label="內容">
            <Textarea value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} />
          </Field>
          <Field label="點擊後跳轉頁面" hint="例如 /weekly、/dashboard、/activities">
            <Input value={annForm.link} onChange={(e) => setAnnForm({ ...annForm, link: e.target.value })} placeholder="/weekly" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="公告分類"><Select value={annForm.category} onChange={(e) => setAnnForm({ ...annForm, category: e.target.value })}><option value="general">一般公告</option><option value="exam">考試／每週小考</option><option value="challenge">挑戰與競賽</option><option value="activity">活動</option><option value="reward">獎勵與 Pro</option><option value="system">系統與維護</option><option value="knowledge">每日知識</option><option value="policy">規則與政策</option></Select></Field>
            <Field label="自訂標籤" hint="以逗號分隔，例如：高中,重要,限時"><Input value={annForm.tags} onChange={(e) => setAnnForm({ ...annForm, tags: e.target.value })} placeholder="高中,重要,限時" /></Field>
          </div>
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
              ["email", "Email 通知"],
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
          <div className="sm:col-span-2 rounded-xl border border-[var(--line)] p-3">
            <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">出題範圍</p><p className="mt-1 text-xs text-muted">可複選，系統會在建立活動時自動整合題目。</p></div><Badge tone="cyan">已選 {actForm.questionSources.length} 個來源</Badge></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["activity", "專屬活動題庫", "只供本活動使用的題目", "✦"],
                ["general_bank", "一般題庫", "國英數自社的共用題目", "▦"],
                ["imported_files", "檔案匯入題庫", "之前 PDF／圖片／OCR 題目", "▤"],
                ["weekly_exams", "每週小考與歷屆題目", "已分析並發布的考卷題目", "◇"],
              ].map(([key, label, description, icon]) => { const selected = actForm.questionSources.includes(key); return <label key={key} className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? "border-[#37d3ff]/70 bg-[#37d3ff]/10 shadow-[0_0_20px_rgba(55,211,255,0.12)]" : "border-[var(--line)] hover:bg-white/5"}`}><input type="checkbox" checked={selected} onChange={(e) => setActForm({ ...actForm, questionSources: e.target.checked ? [...actForm.questionSources, key] : actForm.questionSources.filter((source) => source !== key) })} className="mt-1 accent-[#7c5cff]" /><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-[#37d3ff]/20 text-[#b8edff]" : "bg-white/5 text-muted"}`}>{icon}</span><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted">{description}</span></span>{selected && <span className="ml-auto text-[#37d3ff]">✓</span>}</label>; })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span className="text-muted">建立後仍可在活動題庫追加或刪除。</span><button type="button" className="text-[#37d3ff] underline" onClick={() => setActForm({ ...actForm, questionSources: ["activity", "general_bank", "imported_files", "weekly_exams"] })}>全選來源</button></div>
          </div>
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


type EssayServiceValue = { status: "ENABLED" | "PAUSED" | "DISABLED"; proOnly: boolean; novaCost: number; dailyLimit: number; monthlyLimit: number; maintenanceNotice: string; showScores: boolean };

function EssayServiceEditor({ value, onSaved, toast }: { value: EssayServiceValue; onSaved: () => Promise<void>; toast: ReturnType<typeof useToast> }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="服務狀態"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EssayServiceValue["status"] })}><option value="ENABLED">開放 ENABLED</option><option value="PAUSED">暫停 PAUSED</option><option value="DISABLED">關閉 DISABLED</option></Select></Field>
        <Field label="Nova 消耗／次"><Input type="number" min={0} value={form.novaCost} onChange={(e) => setForm({ ...form, novaCost: Number(e.target.value) })} /></Field>
        <Field label="每日上限（-1 無限）"><Input type="number" min={-1} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} /></Field>
        <Field label="每月上限（-1 無限）"><Input type="number" min={-1} value={form.monthlyLimit} onChange={(e) => setForm({ ...form, monthlyLimit: Number(e.target.value) })} /></Field>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><input type="checkbox" checked={form.proOnly} onChange={(e) => setForm({ ...form, proOnly: e.target.checked })} className="accent-[#7c5cff]" /> Nova Pro 專屬</label>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><input type="checkbox" checked={form.showScores} onChange={(e) => setForm({ ...form, showScores: e.target.checked })} className="accent-[#7c5cff]" /> 顯示 AI 分數</label>
      </div>
      <Field label="維護公告"><Textarea value={form.maintenanceNotice} onChange={(e) => setForm({ ...form, maintenanceNotice: e.target.value })} placeholder="服務暫停時顯示給學生的說明" /></Field>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 text-xs text-muted"><span>設定保存後，Backend 下一次請求立即檢查新狀態，不依賴前端隱藏按鈕。</span><Button disabled={saving} onClick={async () => { setSaving(true); try { await apiPatch("/admin/essay-service", form); await onSaved(); toast.push("success", "英文作文服務設定已更新"); } catch (error) { toast.push("error", errorMessage(error)); } finally { setSaving(false); } }}>{saving ? "保存中…" : "保存設定"}</Button></div>
    </div>
  );
}
