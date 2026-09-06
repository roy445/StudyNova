"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Tabs, useToast } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { apiGet, apiPatch, apiPost, apiPut, errorMessage, useApi } from "@/lib/api";

type AdminUser = {
  userId: string;
  novaId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  blockedReason: string;
  blockedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  tier: string | null;
  expiresAt: string | null;
  nova: number | null;
  level: number | null;
  xp: number | null;
};
type ChristmasTheme = {
  enabled: boolean;
  snow: boolean;
  decorations: boolean;
  novi: boolean;
  particles: boolean;
  sound: boolean;
  intensity: "soft" | "balanced" | "festive";
  title: string;
  subtitle: string;
  reindeer: boolean;
  reindeerNova: number;
  reindeerXp: number;
  primary: string;
  accent: string;
  red: string;
};
const DEFAULT_CHRISTMAS_THEME: ChristmasTheme = {
  enabled: true,
  snow: true,
  decorations: true,
  novi: true,
  particles: true,
  sound: false,
  intensity: "balanced",
  title: "StudyNova Winter Festival",
  subtitle: "今年冬天，一起把知識裝進聖誕禮物裡。",
  reindeer: true,
  reindeerNova: 8,
  reindeerXp: 12,
  primary: "#66e0ff",
  accent: "#ffc857",
  red: "#c83b4b",
};
type CompressionSettings = { enabled: boolean; maxOriginalBytes: number; maxBatchFiles: number; maxProcessingSeconds: number; maxPdfPages: number; maxImagePixels: number; minImageQuality: number; maxIterations: number; allowPdf: boolean; allowImages: boolean; allowBatch: boolean; proOnly: boolean; dailyFree: number; dailyPro: number };
const DEFAULT_COMPRESSION_SETTINGS: CompressionSettings = { enabled: true, maxOriginalBytes: 100 * 1024 * 1024, maxBatchFiles: 20, maxProcessingSeconds: 120, maxPdfPages: 100, maxImagePixels: 144000000, minImageQuality: 35, maxIterations: 8, allowPdf: true, allowImages: true, allowBatch: true, proOnly: false, dailyFree: 10, dailyPro: 100 };

const ACTIONS = [
  { key: "gift_nova", label: "贈送 Nova", needAmount: true },
  { key: "gift_xp", label: "贈送 XP", needAmount: true },
  { key: "grant_pro", label: "授予 Nova Pro", needDays: true },
  { key: "extend_pro", label: "延長 Nova Pro", needDays: true },
  { key: "revoke_pro", label: "回收 Nova Pro" },
  { key: "block", label: "封鎖帳號", needDays: true },
  { key: "unblock", label: "解除封鎖" },
  { key: "reset_quota", label: "重設今日／本月額度" },
  { key: "logout", label: "一鍵登出" },
  { key: "set_unlimited", label: "設定功能無限", needFeature: true },
  { key: "set_role", label: "設定角色", needRole: true },
  { key: "send_notification", label: "發送通知／推播", needNotification: true },
];

export default function AdminOverviewPage() {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [q, setQ] = useState("");
  const overview = useApi<{ users: number; pro: number; novaCirculating: number; aiCallsThisMonth: number; totalMinutes: number; weeks: number; newUsers: Array<{ day: string; c: number }> }>("/admin/overview");
  const users = useApi<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(q)}`, [q]);
  const logs = useApi<{ logs: Array<{ id: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string; actor: string | null }> }>("/admin/logs?kind=admin");
  const features = useApi<{ features: Array<{ id: string; feature: string; label: string }> }>("/admin/features");
  const challengeAdmin = useApi<{ challenges: Array<{ id: string; title: string; kind: string; status: string; expiresAt: string; createdAt: string; creatorName: string; participants: number }> }>("/admin/challenges");
  const settings = useApi<{ settings: Array<{ key: string; value: Record<string, unknown> }> }>("/admin/settings");

  const [selected, setSelected] = useState<string[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [form, setForm] = useState({ action: "gift_nova", reason: "", amount: 100, days: 30, feature: "", role: "student", title: "🎁 StudyNova 最新通知", message: "Novi 有一則新消息想告訴你！", link: "/dashboard" });
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [themeForm, setThemeForm] = useState<ChristmasTheme>(DEFAULT_CHRISTMAS_THEME);
  const [compressionForm, setCompressionForm] = useState<CompressionSettings>(DEFAULT_COMPRESSION_SETTINGS);

  const currentAction = ACTIONS.find((a) => a.key === form.action);
  useEffect(() => {
    const saved = settings.data?.settings.find((setting) => setting.key === "christmas_theme")?.value;
    if (!saved) return;
    const timer = window.setTimeout(() => setThemeForm({ ...DEFAULT_CHRISTMAS_THEME, ...saved } as ChristmasTheme), 0);
    return () => window.clearTimeout(timer);
  }, [settings.data]);
  useEffect(() => {
    const saved = settings.data?.settings.find((setting) => setting.key === "compression_settings")?.value;
    if (saved) {
      const timer = window.setTimeout(() => setCompressionForm({ ...DEFAULT_COMPRESSION_SETTINGS, ...saved } as CompressionSettings), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [settings.data]);

  async function runBulk() {
    if (!selected.length) return toast.push("error", "請先選擇使用者");
    if (!form.reason.trim()) return toast.push("error", "請填寫操作原因（會寫入 Audit Log）");
    try {
      const res = await apiPost<{ results: Array<{ userId: string; ok: boolean; detail: string }> }>("/admin/users/bulk", {
        userIds: selected,
        action: form.action,
        reason: form.reason,
        amount: form.amount,
        days: form.days,
        feature: form.feature || undefined,
        role: form.role,
        title: form.title,
        message: form.message,
        link: form.link,
      });
      const ok = res.results.filter((r) => r.ok).length;
      toast.push(ok === res.results.length ? "success" : "info", `完成 ${ok}/${res.results.length} 筆操作`);
      setActionOpen(false);
      setSelected([]);
      await Promise.all([users.reload(), logs.reload(), overview.reload()]);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "overview", label: "總覽", icon: "◒" },
          { key: "users", label: "使用者管理", icon: "◎" },
          { key: "logs", label: "Audit Log", icon: "▤" },
          { key: "challenges", label: "挑戰管理", icon: "⚔️" },
          { key: "appearance", label: "外觀・NOVA", icon: "✦" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <>
          {overview.loading && <Card><Skeleton lines={4} /></Card>}
          {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
          {overview.data && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <Stat label="總使用者" value={overview.data.users} tone="cyan" />
                <Stat label="Nova Pro" value={overview.data.pro} tone="gold" />
                <Stat label="流通 Nova" value={overview.data.novaCirculating} />
                <Stat label="本月 AI 呼叫" value={overview.data.aiCallsThisMonth} tone="violet" />
                <Stat label="總學習分鐘" value={overview.data.totalMinutes} />
                <Stat label="週次數" value={overview.data.weeks} />
              </div>
              <Card title="近 14 天新註冊">
                {overview.data.newUsers.length ? (
                  <BarChart series={overview.data.newUsers.map((d) => ({ label: d.day.slice(5), value: d.c }))} suffix=" 人" />
                ) : (
                  <EmptyState icon="⌁" title="近期沒有新註冊" />
                )}
              </Card>
            </>
          )}
        </>
      )}

      {tab === "users" && (
        <Card
          title="◎ 使用者管理"
          subtitle={`已選取 ${selected.length} 位・所有操作都會記錄 Audit Log`}
          action={
            <div className="flex flex-wrap gap-1.5">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋 NOVA ID / Email / 名稱" className="!w-auto !py-1.5 text-xs" />
              <Button size="sm" variant="ghost" onClick={async () => { const reason = window.prompt("請輸入重置全體使用量的原因"); if (!reason) return; try { await apiPost("/admin/usage/reset-all", { reason }); toast.push("success", "已重置全體使用量"); } catch (err) { toast.push("error", errorMessage(err)); } }}>重置全體使用量</Button>
              <Button size="sm" onClick={() => setActionOpen(true)} disabled={!selected.length}>
                批次操作
              </Button>
            </div>
          }
        >
          {users.loading && <Skeleton lines={5} />}
          {users.error && <ErrorState message={users.error} onRetry={users.reload} />}
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2">
                    <input
                      type="checkbox"
                      checked={Boolean(users.data?.users.length) && selected.length === users.data?.users.length}
                      onChange={(e) => setSelected(e.target.checked ? (users.data?.users ?? []).map((u) => u.userId) : [])}
                      className="accent-[#7c5cff]"
                    />
                  </th>
                  <th className="pb-2">NOVA ID</th>
                  <th className="pb-2">名稱</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">角色</th>
                  <th className="pb-2">狀態</th>
                  <th className="pb-2 text-right">Nova</th>
                  <th className="pb-2 text-right">Lv/XP</th>
                  <th className="pb-2">會員</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.data?.users.map((u) => (
                  <tr key={u.userId} className="border-t border-[var(--line)]">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(u.userId)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.userId] : s.filter((x) => x !== u.userId)))}
                        className="accent-[#7c5cff]"
                      />
                    </td>
                    <td className="py-2 font-mono">{u.novaId}</td>
                    <td className="py-2">{u.displayName}</td>
                    <td className="max-w-[160px] truncate py-2 text-muted">{u.email}</td>
                    <td className="py-2">{u.role}</td>
                    <td className="py-2">
                      <span title={u.status === "blocked" ? `原因：${u.blockedReason || "未填寫"}｜日期：${u.blockedAt ? new Date(u.blockedAt).toLocaleString("zh-TW") : "—"}` : "帳號正常"}><Badge tone={u.status === "active" ? "green" : "rose"}>{u.status}</Badge></span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{u.nova ?? 0}</td>
                    <td className="py-2 text-right tabular-nums">
                      {u.level ?? 1}/{u.xp ?? 0}
                    </td>
                    <td className="py-2">{u.tier === "pro" ? <Badge tone="gold">Pro</Badge> : "free"}</td>
                    <td className="py-2 text-right">
                      <button
                        className="underline"
                        onClick={async () => {
                          const res = await apiGet<Record<string, unknown>>(`/admin/users/${u.userId}`);
                          setDetail(res);
                        }}
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "logs" && (
        <Card title="▤ Audit Log">
          {logs.loading && <Skeleton lines={5} />}
          <div className="max-h-[70vh] space-y-1 overflow-y-auto scroll-thin">
            {logs.data?.logs.map((l) => (
              <div key={l.id} className="glass-soft px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{l.action}</span>
                  <span className="text-muted">{new Date(l.createdAt).toLocaleString("zh-TW")}</span>
                </div>
                <p className="text-muted">
                  操作者：{l.actor ?? "系統"}｜對象：{l.targetType} {l.targetId.slice(0, 8)}
                  {l.reason ? `｜原因：${l.reason}` : ""}
                </p>
              </div>
            ))}
            {!logs.loading && !logs.data?.logs.length && <EmptyState icon="▤" title="尚無管理紀錄" />}
          </div>
        </Card>
      )}

      {tab === "challenges" && (
        <Card title="⚔️ 挑戰管理" subtitle="查看目前挑戰、暫停或關閉；關閉只停止作答，參與紀錄會保留。">
          {challengeAdmin.loading && <Skeleton lines={5} />}
          {challengeAdmin.error && <ErrorState message={challengeAdmin.error} onRetry={challengeAdmin.reload} />}
          <div className="space-y-2">
            {challengeAdmin.data?.challenges.map((c) => (
              <div key={c.id} className="glass-soft flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                <div><p className="font-medium">{c.title}</p><p className="text-muted">{c.kind}・發起人 {c.creatorName}・{c.participants} 人・截止 {new Date(c.expiresAt).toLocaleString("zh-TW")}</p></div>
                <div className="flex gap-1.5"><Badge tone={c.status === "open" ? "green" : "muted"}>{c.status}</Badge><Button size="sm" variant="ghost" onClick={async () => { await apiPatch(`/admin/challenges/${c.id}`, { status: "paused" }); await challengeAdmin.reload(); }}>暫停</Button><Button size="sm" variant="ghost" onClick={async () => { if (!confirm("關閉這個挑戰？參與紀錄會保留。")) return; await fetch(`/api/v1/admin/challenges/${c.id}`, { method: "DELETE", credentials: "same-origin" }); await challengeAdmin.reload(); }}>關閉</Button></div>
              </div>
            ))}
            {!challengeAdmin.loading && !challengeAdmin.data?.challenges.length && <EmptyState icon="⚔️" title="目前沒有挑戰" />}
          </div>
        </Card>
      )}

      {tab === "appearance" && (
        <>
        <Card title="✦ 節慶外觀與 NOVA 助理" subtitle="只有管理員可以修改；儲存後全站立即套用，操作會寫入 Audit Log。">
          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-muted">目前聖誕主題透過全站共用的 <span className="font-mono text-[#37d3ff]">christmas_theme</span> 設定同步；智慧壓縮中心會自動沿用相同的主色、輔色與節慶背景，不需要另外設定。</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[["enabled", "Christmas Theme"], ["novi", "聖誕 NOVA 外觀"], ["snow", "雪花效果"], ["particles", "NOVA 閃爍粒子"], ["decorations", "進階聖誕裝飾"], ["sound", "馴鹿鈴聲"], ["reindeer", "隨機馴鹿事件"]].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={themeForm[key as keyof ChristmasTheme] as boolean} onChange={(e) => setThemeForm({ ...themeForm, [key]: e.target.checked })} className="accent-[#37d3ff]" /></label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="主題強度"><Select value={themeForm.intensity} onChange={(e) => setThemeForm({ ...themeForm, intensity: e.target.value as ChristmasTheme["intensity"] })}><option value="soft">柔和</option><option value="balanced">平衡</option><option value="festive">節慶</option></Select></Field>
              <Field label="Hero 標題"><Input value={themeForm.title} onChange={(e) => setThemeForm({ ...themeForm, title: e.target.value })} /></Field>
              <Field label="Hero 副標題"><Input value={themeForm.subtitle} onChange={(e) => setThemeForm({ ...themeForm, subtitle: e.target.value })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="馴鹿 Nova 獎勵"><Input type="number" min={1} max={100} value={themeForm.reindeerNova} onChange={(e) => setThemeForm({ ...themeForm, reindeerNova: Number(e.target.value) })} /></Field>
              <Field label="馴鹿 XP 獎勵"><Input type="number" min={1} max={200} value={themeForm.reindeerXp} onChange={(e) => setThemeForm({ ...themeForm, reindeerXp: Number(e.target.value) })} /></Field>
              <div className="flex items-end gap-3 rounded-xl border border-[var(--line)] px-3 py-2"><label className="flex items-center gap-2 text-xs"><span>主色</span><input type="color" value={themeForm.primary} onChange={(e) => setThemeForm({ ...themeForm, primary: e.target.value })} /></label><label className="flex items-center gap-2 text-xs"><span>金色</span><input type="color" value={themeForm.accent} onChange={(e) => setThemeForm({ ...themeForm, accent: e.target.value })} /></label><label className="flex items-center gap-2 text-xs"><span>紅色</span><input type="color" value={themeForm.red} onChange={(e) => setThemeForm({ ...themeForm, red: e.target.value })} /></label></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-muted">
              <span>{themeForm.enabled ? "目前套用午夜藍、冰藍、金色光暈與低負載雪花。" : "目前維持原本 StudyNova 科技主題。"}</span>
              <Button onClick={async () => { try { await apiPut("/admin/settings/christmas_theme", { value: themeForm }); await settings.reload(); window.dispatchEvent(new Event("studynova:theme-refresh")); toast.push("success", "節慶主題與 NOVA 外觀已更新"); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存並套用</Button>
            </div>
          </div>
        </Card>
        <Card title="▣ 智慧檔案壓縮設定" subtitle="控制檔案大小、品質下限、PDF 限制與每日使用額度。">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["enabled", "啟用智慧壓縮"], ["allowImages", "允許圖片壓縮"], ["allowPdf", "允許 PDF 壓縮"], ["allowBatch", "允許批次壓縮"], ["proOnly", "僅限 Nova Pro"]].map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={compressionForm[key as keyof CompressionSettings] as boolean} onChange={(e) => setCompressionForm({ ...compressionForm, [key]: e.target.checked })} className="accent-[#37d3ff]" /></label>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="最大原始檔案（MB）" hint="範例：100，允許 1–500"><Input type="number" min={1} max={500} value={Math.round(compressionForm.maxOriginalBytes / 1024 / 1024)} onChange={(e) => setCompressionForm({ ...compressionForm, maxOriginalBytes: Number(e.target.value) * 1024 * 1024 })} /></Field>
              <Field label="最大處理時間（秒）"><Input type="number" min={10} max={600} value={compressionForm.maxProcessingSeconds} onChange={(e) => setCompressionForm({ ...compressionForm, maxProcessingSeconds: Number(e.target.value) })} /></Field>
              <Field label="最大 PDF 頁數"><Input type="number" min={1} max={500} value={compressionForm.maxPdfPages} onChange={(e) => setCompressionForm({ ...compressionForm, maxPdfPages: Number(e.target.value) })} /></Field>
              <Field label="批次最多檔案"><Input type="number" min={1} max={100} value={compressionForm.maxBatchFiles} onChange={(e) => setCompressionForm({ ...compressionForm, maxBatchFiles: Number(e.target.value) })} /></Field>
              <Field label="最大壓縮迭代"><Input type="number" min={1} max={12} value={compressionForm.maxIterations} onChange={(e) => setCompressionForm({ ...compressionForm, maxIterations: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="最低圖片品質" hint="JPEG/WebP/AVIF，35–90"><Input type="number" min={20} max={90} value={compressionForm.minImageQuality} onChange={(e) => setCompressionForm({ ...compressionForm, minImageQuality: Number(e.target.value) })} /></Field>
              <Field label="最大圖片解析度（MP）"><Input type="number" min={1} max={300} value={Math.round(compressionForm.maxImagePixels / 1000000)} onChange={(e) => setCompressionForm({ ...compressionForm, maxImagePixels: Number(e.target.value) * 1000000 })} /></Field>
              <Field label="Free 每日次數"><Input type="number" min={0} max={1000} value={compressionForm.dailyFree} onChange={(e) => setCompressionForm({ ...compressionForm, dailyFree: Number(e.target.value) })} /></Field>
              <Field label="Pro 每日次數"><Input type="number" min={0} max={10000} value={compressionForm.dailyPro} onChange={(e) => setCompressionForm({ ...compressionForm, dailyPro: Number(e.target.value) })} /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-muted"><span>{compressionForm.enabled ? "智慧壓縮已開啟：目標大小導向、保留學習文件可讀性。" : "智慧壓縮目前關閉，使用者無法建立新的壓縮工作。"}</span><Button onClick={async () => { try { await apiPut("/admin/settings/compression_settings", { value: compressionForm }); await settings.reload(); toast.push("success", "智慧壓縮設定已更新"); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存壓縮設定</Button></div>
          </div>
        </Card>
        </>
      )}

      <Modal open={actionOpen} onClose={() => setActionOpen(false)} title={`批次操作（${selected.length} 位使用者）`}>
        <div className="space-y-3">
          <Field label="操作">
            <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              {ACTIONS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          {currentAction?.needAmount && (
            <Field label="數量">
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </Field>
          )}
          {currentAction?.needDays && (
            <Field label={form.action === "block" ? "封鎖天數（留空或 0 代表永久）" : "天數"}>
              <Input type="number" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} />
            </Field>
          )}
          {currentAction?.needFeature && (
            <Field label="功能">
              <Select value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })}>
                <option value="">請選擇…</option>
                {features.data?.features.map((f) => (
                  <option key={f.id} value={f.feature}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {currentAction?.needRole && (
            <Field label="角色">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="student">學生</option>
                <option value="admin">管理員</option>
              </Select>
            </Field>
          )}
          {currentAction?.needNotification && (
            <>
              <Field label="通知標題"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="通知內容"><Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
              <Field label="點擊後連結"><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></Field>
            </>
          )}
          <Field label="操作原因" required hint="會完整記錄於 Audit Log">
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="例如：參加測試活動獎勵" />
          </Field>
          <Button full onClick={runBulk}>
            執行
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="使用者詳細" wide>
        <pre className="max-h-[60vh] overflow-auto scroll-thin whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[11px]">{JSON.stringify(detail, null, 2)}</pre>
      </Modal>
    </div>
  );
}
