"use client";

import Link from "next/link";
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
  lastSeenAt: string | null;
  tier: string | null;
  expiresAt: string | null;
  nova: number | null;
  level: number | null;
  xp: number | null;
};
type GradeGoal = { id: string; subject: string; targetScore: number | null; baselineScore: number | null; achievedAt: string | null };
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
const DEFAULT_PK_ACTIVITY_START = "2026-09-26T09:00";
const DEFAULT_PK_ACTIVITY_END = "2026-10-03T23:59";
type ServiceControl = { enabled: boolean; title: string; description: string; badgeText: string; estimatedRecoveryAt: string | null; message: string; startedAt: string | null; updatedByName: string | null; updatedAt: string | null };
type PkAdminConfig = { enabled: boolean; quickMatchEnabled: boolean; friendMatchEnabled: boolean; customRoomEnabled: boolean; publicArenaEnabled: boolean; allowedModes: string[]; maxPlayers: number; minQuestions: number; maxQuestions: number; minTimeSec: number; maxTimeSec: number; defaultRewardNova: number; defaultRewardXp: number; activityId: string | null };
type PkAdminOverview = { config: PkAdminConfig; stats: { online: number; pkOnline: number; waitingRooms: number; liveMatches: number; matching: number }; matches: Array<{ id: string; status: string; subject: string; mode: string; difficulty: string; questionCount: number; createdAt: string; roomName: string | null; playerCount: number }>; anomalies: Array<{ id: string; matchId: string; eventType: string; payload: Record<string, unknown>; createdAt: string }> };
type PkActivity = { id: string; name: string; cover: string; subject: string; scope: string; description: string; startsAt: string; endsAt: string; questionCount: number; difficulty: string; rewardNova: number; rewardXp: number; status: string };

const ACTIONS = [
  { key: "gift_nova", label: "調整 Nova（可負數）", needAmount: true },
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
  { key: "delete_account", label: "永久刪除帳號與資料" },
];

export default function AdminOverviewPage() {
  const toast = useToast();
  const [tab, setTab] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "online-pk" ? "online-pk" : "overview");
  const [q, setQ] = useState("");
  const [userPage, setUserPage] = useState(1);
  const overview = useApi<{ users: number; pro: number; novaCirculating: number; aiCallsThisMonth: number; totalMinutes: number; weeks: number; newUsers: Array<{ day: string; c: number }> }>("/admin/overview");
  const users = useApi<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(`/admin/users?q=${encodeURIComponent(q)}&page=${userPage}&pageSize=25`, [q, userPage]);
  const logs = useApi<{ logs: Array<{ id: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string; actor: string | null }> }>("/admin/logs?kind=admin");
  const features = useApi<{ features: Array<{ id: string; feature: string; label: string }> }>("/admin/features");
  const challengeAdmin = useApi<{ challenges: Array<{ id: string; title: string; kind: string; status: string; expiresAt: string; createdAt: string; creatorName: string; participants: number }> }>("/admin/challenges");
  const settings = useApi<{ settings: Array<{ key: string; value: Record<string, unknown> }> }>("/admin/settings");
  const serviceControl = useApi<ServiceControl>("/admin/service-control");
  const pkOverview = useApi<PkAdminOverview>("/admin/pk/overview");
  const pkActivities = useApi<{ activities: PkActivity[] }>("/admin/pk/activities");

  const [selected, setSelected] = useState<string[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [form, setForm] = useState({ action: "gift_nova", reason: "", amount: 100, days: 30, feature: "", role: "student", title: "🎁 StudyNova 最新通知", message: "Novi 有一則新消息想告訴你！", link: "/dashboard" });
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [renameReason, setRenameReason] = useState("");
  const [goalForm, setGoalForm] = useState({ subject: "數學", targetScore: 85, baselineScore: "", reason: "" });
  const [themeForm, setThemeForm] = useState<ChristmasTheme>(DEFAULT_CHRISTMAS_THEME);
  const [compressionForm, setCompressionForm] = useState<CompressionSettings>(DEFAULT_COMPRESSION_SETTINGS);
  const [pkConfigForm, setPkConfigForm] = useState<PkAdminConfig | null>(null);
  const [pkActivityForm, setPkActivityForm] = useState({ name: "", cover: "⚔️", subject: "英文", scope: "", description: "", startsAt: DEFAULT_PK_ACTIVITY_START, endsAt: DEFAULT_PK_ACTIVITY_END, questionCount: 10, difficulty: "normal", rewardNova: 50, rewardXp: 100, status: "draft" });

  const currentAction = ACTIONS.find((a) => a.key === form.action);
  useEffect(() => {
    const timer = window.setTimeout(() => { setUserPage(1); setSelected([]); }, 0);
    return () => window.clearTimeout(timer);
  }, [q]);
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
  useEffect(() => {
    if (!pkOverview.data?.config) return undefined;
    const timer = window.setTimeout(() => setPkConfigForm(pkOverview.data?.config ?? null), 0);
    return () => window.clearTimeout(timer);
  }, [pkOverview.data?.config]);

  async function runBulk() {
    if (!selected.length) return toast.push("error", "請先選擇使用者");
    if (!form.reason.trim()) return toast.push("error", "請填寫操作原因（會寫入 Audit Log）");
    if (form.action === "delete_account" && !window.confirm(`確定永久刪除已選取的 ${selected.length} 個帳號及其資料？此操作不可復原。`)) return;
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

  async function restoreService() {
    if (!window.confirm("確定要立即恢復網站嗎？所有一般使用者將可重新進入網站。")) return;
    try {
      await apiPatch("/admin/service-control", { enabled: true, title: serviceControl.data?.title ?? "系統施工中", description: serviceControl.data?.description ?? "", badgeText: serviceControl.data?.badgeText ?? "", estimatedRecoveryAt: null, message: serviceControl.data?.message ?? "" });
      await serviceControl.reload();
      toast.push("success", "🚀 網站已立即恢復");
    } catch (err) { toast.push("error", errorMessage(err)); }
  }

  async function savePkConfig() {
    if (!pkConfigForm) return;
    try {
      await apiPut("/admin/pk/config", { value: pkConfigForm });
      await pkOverview.reload();
      toast.push("success", "線上 PK 設定已更新");
    } catch (err) { toast.push("error", errorMessage(err)); }
  }

  async function controlPkMatch(matchId: string, action: "pause" | "resume" | "end" | "cancel" | "close_join" | "remove_player" | "lock_room") {
    const reason = window.prompt("請輸入操作原因（會寫入 PK Audit Log）", action === "end" ? "管理員手動結算" : "管理員調整賽場狀態");
    if (!reason?.trim()) return;
    try {
      await apiPost(`/admin/pk/matches/${matchId}/control`, { action, reason });
      await pkOverview.reload();
      toast.push("success", `PK 已執行：${action}`);
    } catch (err) { toast.push("error", errorMessage(err)); }
  }

  async function createPkActivity() {
    if (!pkActivityForm.name.trim()) return toast.push("error", "請輸入活動名稱");
    try {
      await apiPost("/admin/pk/activities", { ...pkActivityForm, startsAt: new Date(pkActivityForm.startsAt).toISOString(), endsAt: new Date(pkActivityForm.endsAt).toISOString(), eligibility: {} });
      await pkActivities.reload();
      setPkActivityForm((current) => ({ ...current, name: "", description: "" }));
      toast.push("success", "PK 活動已建立");
    } catch (err) { toast.push("error", errorMessage(err)); }
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "overview", label: "總覽", icon: "◒" },
          { key: "users", label: "使用者管理", icon: "◎" },
          { key: "logs", label: "Audit Log", icon: "▤" },
          { key: "challenges", label: "挑戰管理", icon: "⚔️" },
          { key: "online-pk", label: "線上 PK", icon: "⚡" },
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
              <Card title="⚙️ 網站維護" subtitle="維護模式不會清除任何 session 或 cookie；管理員可從 /admin-access 返回此處恢復網站。" action={<Badge tone={serviceControl.data?.enabled === false ? "gold" : "green"}>{serviceControl.data?.enabled === false ? "🟠 維護模式" : "🟢 正常運作"}</Badge>}>
                <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => void restoreService()} disabled={serviceControl.data?.enabled !== false}>🚀 立即恢復網站</Button><a href="/admin/features" className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-white/85 hover:bg-white/10">開啟完整維護設定</a></div>
                {serviceControl.data?.enabled === false && <p className="mt-3 text-xs text-amber-100/80">目前顯示：{serviceControl.data.message || serviceControl.data.description}</p>}
              </Card>
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
                  <th className="pb-2">最後上線</th>
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
                    <td className="py-2 text-muted">{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("zh-TW") : "—"}</td>
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
                          setNameDraft(String((res.user as { displayName?: string } | undefined)?.displayName ?? ""));
                          setRenameReason("");
                          setGoalForm({ subject: "數學", targetScore: 85, baselineScore: "", reason: "" });
                        }}
                      >
                        詳細
                      </button>
                      <Link href={`/admin/users/${u.userId}`} className="ml-2 underline text-[#7dd3fc]">分析</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.data && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-xs text-muted"><span>共 {users.data.total} 位會員 · 第 {users.data.page} / {Math.max(1, Math.ceil(users.data.total / users.data.pageSize))} 頁</span><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={userPage <= 1} onClick={() => setUserPage((page) => Math.max(1, page - 1))}>上一頁</Button><Button size="sm" variant="ghost" disabled={userPage >= Math.max(1, Math.ceil(users.data.total / users.data.pageSize))} onClick={() => setUserPage((page) => page + 1)}>下一頁</Button></div></div>}
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

      {tab === "online-pk" && (
        <div className="space-y-4">
          {pkOverview.loading && !pkOverview.data && <Card><Skeleton lines={5} /></Card>}
          {pkOverview.error && <ErrorState message={pkOverview.error} onRetry={pkOverview.reload} />}
          {pkOverview.data && <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="全站在線" value={pkOverview.data.stats.online} tone="cyan" />
              <Stat label="PK 中" value={pkOverview.data.stats.pkOnline} tone="gold" />
              <Stat label="配對中" value={pkOverview.data.stats.matching} tone="violet" />
              <Stat label="等候房" value={pkOverview.data.stats.waitingRooms} />
              <Stat label="進行中" value={pkOverview.data.stats.liveMatches} tone="cyan" />
            </div>
            <Card title="⚡ PK 總開關與規則" subtitle="設定由伺服器作為唯一來源；所有變更會寫入一般 Admin Log 與 PK Audit Log。" action={<Badge tone={pkOverview.data.config.enabled ? "green" : "rose"}>{pkOverview.data.config.enabled ? "啟用" : "已暫停"}</Badge>}>
              {pkConfigForm && <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{([["enabled", "啟用線上 PK"], ["quickMatchEnabled", "快速配對"], ["friendMatchEnabled", "好友 PK"], ["customRoomEnabled", "自訂房間"], ["publicArenaEnabled", "公開競技場"]] as Array<[keyof PkAdminConfig, string]>).map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={Boolean(pkConfigForm[key])} onChange={(event) => setPkConfigForm({ ...pkConfigForm, [key]: event.target.checked })} className="accent-[#37d3ff]" /></label>)}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Field label="最大人數"><Input type="number" min={2} max={12} value={pkConfigForm.maxPlayers} onChange={(event) => setPkConfigForm({ ...pkConfigForm, maxPlayers: Number(event.target.value) })} /></Field><Field label="最少題數"><Input type="number" min={5} max={50} value={pkConfigForm.minQuestions} onChange={(event) => setPkConfigForm({ ...pkConfigForm, minQuestions: Number(event.target.value) })} /></Field><Field label="最多題數"><Input type="number" min={5} max={50} value={pkConfigForm.maxQuestions} onChange={(event) => setPkConfigForm({ ...pkConfigForm, maxQuestions: Number(event.target.value) })} /></Field><Field label="最短秒數"><Input type="number" min={5} max={120} value={pkConfigForm.minTimeSec} onChange={(event) => setPkConfigForm({ ...pkConfigForm, minTimeSec: Number(event.target.value) })} /></Field><Field label="最長秒數"><Input type="number" min={5} max={120} value={pkConfigForm.maxTimeSec} onChange={(event) => setPkConfigForm({ ...pkConfigForm, maxTimeSec: Number(event.target.value) })} /></Field><Field label="冠軍加成 Nova"><Input type="number" min={0} max={1000} value={pkConfigForm.defaultRewardNova} onChange={(event) => setPkConfigForm({ ...pkConfigForm, defaultRewardNova: Number(event.target.value) })} /></Field></div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs text-muted"><span>允許模式：{pkConfigForm.allowedModes.join("、")} · 基本 XP {pkConfigForm.defaultRewardXp}</span><Button onClick={() => void savePkConfig()}>儲存 PK 設定</Button></div>
              </div>}
            </Card>
            <Card title="▣ 進行中的賽場" subtitle="可暫停、恢復、結算、關閉加入或鎖定房間；每項操作都需要原因。">
              <div className="space-y-2">{pkOverview.data.matches.map((item) => <div key={item.id} className="glass-soft flex flex-wrap items-center justify-between gap-3 p-3 text-xs"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={item.status === "in_progress" ? "green" : item.status === "completed" ? "gold" : "muted"}>{item.status}</Badge><span className="font-mono text-muted">{item.id.slice(0, 8)}</span><span className="font-semibold">{item.subject}・{item.mode}</span></div><p className="mt-1 text-muted">{item.roomName || "快速配對"}・{item.playerCount} 位玩家・{item.questionCount} 題・{new Date(item.createdAt).toLocaleString("zh-TW")}</p></div><div className="flex flex-wrap gap-1.5">{item.status === "in_progress" && <Button size="sm" variant="ghost" onClick={() => void controlPkMatch(item.id, "pause")}>暫停</Button>}{item.status === "paused" && <Button size="sm" variant="ghost" onClick={() => void controlPkMatch(item.id, "resume")}>恢復</Button>}{["in_progress", "paused", "countdown"].includes(item.status) && <Button size="sm" onClick={() => void controlPkMatch(item.id, "end")}>結算</Button>}{["waiting", "matching"].includes(item.status) && <Button size="sm" variant="ghost" onClick={() => void controlPkMatch(item.id, "close_join")}>關閉加入</Button>}{!["completed", "cancelled"].includes(item.status) && <Button size="sm" variant="ghost" onClick={() => void controlPkMatch(item.id, "cancel")}>取消</Button>}</div></div>)}{!pkOverview.data.matches.length && <EmptyState icon="⚡" title="目前沒有 PK 賽場" hint="真實玩家建立房間或進入配對後會顯示在這裡。" />}</div>
            </Card>
            <Card title="🚨 異常事件" subtitle="顯示伺服器觀察到的極短作答等異常訊號，不自動判定作弊。">
              <div className="max-h-56 space-y-2 overflow-y-auto scroll-thin">{pkOverview.data.anomalies.map((event) => <div key={event.id} className="glass-soft px-3 py-2 text-xs"><div className="flex justify-between gap-2"><span className="font-semibold">{event.eventType}</span><span className="text-muted">{new Date(event.createdAt).toLocaleString("zh-TW")}</span></div><p className="mt-1 text-muted">Match {event.matchId.slice(0, 8)} · {JSON.stringify(event.payload)}</p></div>)}{!pkOverview.data.anomalies.length && <EmptyState icon="✓" title="目前沒有異常事件" />}</div>
            </Card>
          </>}
          <Card title="✦ PK 活動管理" subtitle="建立活動時只儲存規則與時段；題目仍由每場 PK 的伺服器題庫選擇。">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="活動名稱"><Input value={pkActivityForm.name} onChange={(event) => setPkActivityForm({ ...pkActivityForm, name: event.target.value })} placeholder="例：週末英文閃電戰" /></Field><Field label="科目"><Input value={pkActivityForm.subject} onChange={(event) => setPkActivityForm({ ...pkActivityForm, subject: event.target.value })} /></Field><Field label="開始"><Input type="datetime-local" value={pkActivityForm.startsAt} onChange={(event) => setPkActivityForm({ ...pkActivityForm, startsAt: event.target.value })} /></Field><Field label="結束"><Input type="datetime-local" value={pkActivityForm.endsAt} onChange={(event) => setPkActivityForm({ ...pkActivityForm, endsAt: event.target.value })} /></Field></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="範圍"><Input value={pkActivityForm.scope} onChange={(event) => setPkActivityForm({ ...pkActivityForm, scope: event.target.value })} /></Field><Field label="題數"><Input type="number" min={5} max={50} value={pkActivityForm.questionCount} onChange={(event) => setPkActivityForm({ ...pkActivityForm, questionCount: Number(event.target.value) })} /></Field><Field label="難度"><Select value={pkActivityForm.difficulty} onChange={(event) => setPkActivityForm({ ...pkActivityForm, difficulty: event.target.value })}><option value="easy">基礎</option><option value="normal">標準</option><option value="hard">進階</option></Select></Field><Field label="Nova 獎勵"><Input type="number" min={0} max={1000} value={pkActivityForm.rewardNova} onChange={(event) => setPkActivityForm({ ...pkActivityForm, rewardNova: Number(event.target.value) })} /></Field><Field label="狀態"><Select value={pkActivityForm.status} onChange={(event) => setPkActivityForm({ ...pkActivityForm, status: event.target.value })}><option value="draft">草稿</option><option value="published">發布</option><option value="closed">關閉</option></Select></Field></div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><Field label="活動說明"><Input value={pkActivityForm.description} onChange={(event) => setPkActivityForm({ ...pkActivityForm, description: event.target.value })} placeholder="活動規則與參加說明" /></Field><Button onClick={() => void createPkActivity()}>建立活動</Button></div>
            <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">{pkActivities.loading && <Skeleton lines={3} />}{pkActivities.data?.activities.map((activity) => <div key={activity.id} className="glass-soft flex flex-wrap items-center justify-between gap-3 p-3 text-xs"><div><p className="font-semibold">{activity.cover} {activity.name} <Badge tone={activity.status === "published" ? "green" : activity.status === "closed" ? "rose" : "muted"}>{activity.status}</Badge></p><p className="mt-1 text-muted">{activity.subject}・{activity.questionCount} 題・{new Date(activity.startsAt).toLocaleString("zh-TW")} ～ {new Date(activity.endsAt).toLocaleString("zh-TW")}・{activity.rewardNova} Nova</p></div><Button size="sm" variant="ghost" onClick={async () => { try { await apiPatch(`/admin/pk/activities/${activity.id}`, { status: activity.status === "published" ? "closed" : "published" }); await pkActivities.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>{activity.status === "published" ? "關閉" : "發布"}</Button></div>)}{pkActivities.data && !pkActivities.data.activities.length && <EmptyState icon="✦" title="尚未建立 PK 活動" />}</div>
          </Card>
        </div>
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
            <Field label={form.action === "gift_nova" ? "調整數量（可輸入負數，例如 -100）" : "數量"}>
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
        {Boolean(detail?.user) && <div className="mb-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-[var(--line)] p-3 text-xs"><p className="text-muted">帳號註冊日期</p><strong>{detail?.user && (detail.user as { createdAt?: string }).createdAt ? new Date((detail.user as { createdAt: string }).createdAt).toLocaleString("zh-TW") : "—"}</strong></div><div className="rounded-xl border border-[var(--line)] p-3 text-xs"><p className="text-muted">最後登入時間</p><strong>{detail?.user && (detail.user as { lastLoginAt?: string | null }).lastLoginAt ? new Date((detail.user as { lastLoginAt: string }).lastLoginAt).toLocaleString("zh-TW") : "尚未登入"}</strong></div><div className="rounded-xl border border-[var(--line)] p-3 text-xs"><p className="text-muted">目前有效 Session</p><strong>{Array.isArray(detail?.loginSessions) ? detail.loginSessions.length : 0} 筆</strong></div></div>}
        {Boolean(detail?.user) && <div className="mb-3 space-y-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3"><p className="text-xs font-semibold text-[#b9f2ff]">管理員代改名稱</p><div className="flex flex-wrap gap-2"><Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="新的顯示名稱" className="flex-1" /><Input value={renameReason} onChange={(e) => setRenameReason(e.target.value)} placeholder="修改原因（必填）" className="flex-1" /><Button size="sm" onClick={async () => { const user = detail?.user as { userId?: string } | undefined; if (!user?.userId || !renameReason.trim()) { toast.push("error", "請填寫名稱與修改原因"); return; } try { await apiPatch(`/admin/users/${user.userId}/profile`, { displayName: nameDraft, reason: renameReason }); toast.push("success", "名稱已更新並通知使用者"); setDetail(null); await users.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存名稱</Button></div></div>}
        {Boolean(detail?.user) && <div className="mb-3 space-y-3 rounded-xl border border-[#ffc857]/25 bg-[#ffc857]/5 p-3"><div><p className="text-xs font-semibold text-[#ffe09a]">◇ 成績分析目標分數</p><p className="mt-1 text-xs text-muted">這裡設定的是該使用者在學生端「成績分析」看到的科目目標，不是段考專區的預設分數。</p></div><div className="space-y-1 text-xs">{((detail?.gradeGoals as GradeGoal[] | undefined) ?? []).map((goal) => <p key={goal.id}>{goal.subject}：<strong>{goal.targetScore ?? "—"} 分</strong>{goal.achievedAt ? "・已達成" : ""}</p>)}{!((detail?.gradeGoals as GradeGoal[] | undefined) ?? []).length && <p className="text-muted">尚未設定任何科目目標。</p>}</div><div className="grid gap-2 sm:grid-cols-4"><Field label="科目"><Input value={goalForm.subject} onChange={(e) => setGoalForm({ ...goalForm, subject: e.target.value })} placeholder="例如：數學" /></Field><Field label="目標分數"><Input type="number" min={1} max={100} value={goalForm.targetScore} onChange={(e) => setGoalForm({ ...goalForm, targetScore: Number(e.target.value) })} /></Field><Field label="基準分數（選填）"><Input type="number" min={0} max={100} value={goalForm.baselineScore} onChange={(e) => setGoalForm({ ...goalForm, baselineScore: e.target.value })} /></Field><Field label="設定原因"><Input value={goalForm.reason} onChange={(e) => setGoalForm({ ...goalForm, reason: e.target.value })} placeholder="必填，會寫入 Audit Log" /></Field></div><Button size="sm" onClick={async () => { const user = detail?.user as { userId?: string } | undefined; if (!user?.userId || !goalForm.subject.trim() || !goalForm.reason.trim()) { toast.push("error", "請填寫科目與設定原因"); return; } try { const result = await apiPut<{ goal: GradeGoal }>(`/admin/users/${user.userId}/grade-goals`, { subject: goalForm.subject.trim(), targetScore: goalForm.targetScore, baselineScore: goalForm.baselineScore === "" ? null : Number(goalForm.baselineScore), reason: goalForm.reason.trim() }); setDetail((current) => current ? { ...current, gradeGoals: [...(((current.gradeGoals as GradeGoal[] | undefined) ?? []).filter((goal) => goal.subject !== result.goal.subject)), result.goal] } : current); setGoalForm({ ...goalForm, reason: "" }); toast.push("success", "學生端目標分數已更新"); } catch (err) { toast.push("error", errorMessage(err)); } }}>儲存目標分數</Button></div>}
        {Boolean(detail?.user) && <div className="mb-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3"><p className="mb-2 text-xs font-semibold text-[#b9f2ff]">▤ 使用者詳細操作日誌</p><div className="max-h-56 space-y-1 overflow-auto text-[11px]">{((detail?.activityLogs as Array<{ id: string; action: string; module: string; outcome: string; occurredAt: string; errorCategory?: string | null }> | undefined) ?? []).map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/50 py-1"><span><b>{log.action}</b>・{log.module}・{log.outcome}{log.errorCategory ? `・${log.errorCategory}` : ""}</span><time className="text-muted">{new Date(log.occurredAt).toLocaleString("zh-TW")}</time></div>)}{!((detail?.activityLogs as unknown[] | undefined) ?? []).length && <p className="text-muted">尚無操作紀錄。</p>}</div></div>}
        <pre className="max-h-[60vh] overflow-auto scroll-thin whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[11px]">{JSON.stringify(detail, null, 2)}</pre>
      </Modal>
    </div>
  );
}
