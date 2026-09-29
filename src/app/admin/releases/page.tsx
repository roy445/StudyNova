"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";
import { formatTaipeiDateTime, formatTaipeiDateTimeInput, parseTaipeiDateTimeInput } from "@/lib/date-time";

type ReleaseStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type Release = { id: string; version: string; versionCode: number; previousVersion: string; title: string; subtitle: string; description: string; releaseNotes: string; releaseType: string; status: ReleaseStatus; migrationRequired: boolean; migrationStatus: string; migrationStartedAt: string | null; migrationCompletedAt: string | null; migrationErrorLog: string; minimumSupportedVersion: string; scheduledAt: string | null; releasedAt: string | null; publishedBy: string | null; createdBy: string; newFeatures: string[]; improvements: string[]; bugFixes: string[]; breakingChanges: string[] };
type FeatureGate = { id: string; featureKey: string; featureName: string; requiredVersion: string; minimumVersion: string; enabled: boolean; releaseStatus: ReleaseStatus; releaseDate: string | null };
type ReleaseForm = { version: string; releaseType: string; title: string; subtitle: string; description: string; releaseNotes: string; newFeatures: string; improvements: string; bugFixes: string; breakingChanges: string; migrationRequired: boolean; minimumSupportedVersion: string };
type FeatureForm = { featureKey: string; featureName: string; requiredVersion: string; minimumVersion: string; enabled: boolean; releaseStatus: ReleaseStatus; releaseDate: string };

const EMPTY_RELEASE: ReleaseForm = { version: "", releaseType: "PATCH", title: "", subtitle: "", description: "", releaseNotes: "", newFeatures: "", improvements: "", bugFixes: "", breakingChanges: "", migrationRequired: false, minimumSupportedVersion: "1.0.0" };
const EMPTY_FEATURE: FeatureForm = { featureKey: "", featureName: "", requiredVersion: "1.1.0", minimumVersion: "1.1.0", enabled: true, releaseStatus: "DRAFT", releaseDate: "" };
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

export default function AdminReleasesPage() {
  const toast = useToast();
  const releases = useApi<{ currentVersion: string; releases: Release[] }>("/admin/releases");
  const analytics = useApi<{ windowDays: number; checkedAt: string; totalActiveSessions: number; totalActiveUsers: number; versions: Array<{ appVersion: string; activeSessions: number; activeUsers: number; lastSeenAt: string }> }>("/admin/releases/analytics");
  const featureData = useApi<{ features: FeatureGate[] }>("/admin/releases/features");
  const [form, setForm] = useState<ReleaseForm>(EMPTY_RELEASE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [featureForm, setFeatureForm] = useState<FeatureForm>(EMPTY_FEATURE);
  const [editingFeatureKey, setEditingFeatureKey] = useState<string | null>(null);
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");

  async function reloadAll() {
    await Promise.all([releases.reload(), analytics.reload(), featureData.reload()]);
  }

  async function withBusy(key: string, successText: string, action: () => Promise<unknown>) {
    setBusyKey(key);
    try { await action(); await reloadAll(); toast.push("success", successText); }
    catch (error) { toast.push("error", errorMessage(error)); }
    finally { setBusyKey(""); }
  }

  function releasePayload() {
    return { ...form, newFeatures: lines(form.newFeatures), improvements: lines(form.improvements), bugFixes: lines(form.bugFixes), breakingChanges: lines(form.breakingChanges) };
  }

  async function saveRelease() {
    const payload = releasePayload();
    await withBusy("release-save", editingId ? "版本草稿已更新" : "版本草稿已建立", async () => {
      if (editingId) await apiPatch(`/admin/releases/${editingId}`, payload);
      else await apiPost("/admin/releases", payload);
      setForm(EMPTY_RELEASE);
      setEditingId(null);
    });
  }

  function editRelease(item: Release) {
    setEditingId(item.id);
    setForm({ version: item.version, releaseType: item.releaseType, title: item.title, subtitle: item.subtitle ?? "", description: item.description ?? "", releaseNotes: item.releaseNotes ?? "", newFeatures: (item.newFeatures ?? []).join("\n"), improvements: (item.improvements ?? []).join("\n"), bugFixes: (item.bugFixes ?? []).join("\n"), breakingChanges: (item.breakingChanges ?? []).join("\n"), migrationRequired: item.migrationRequired, minimumSupportedVersion: item.minimumSupportedVersion });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateMigration(item: Release, status: "RUNNING" | "SUCCEEDED" | "FAILED") {
    const errorLog = status === "FAILED" ? window.prompt("請輸入不含密碼、Token 或資料庫 URL 的錯誤摘要：", item.migrationErrorLog || "") ?? "" : "";
    if (status === "FAILED" && !errorLog.trim()) return;
    await withBusy(`migration-${item.id}`, `Migration 狀態已更新為 ${status}`, () => apiPost(`/admin/releases/${item.id}/migration`, { status, errorLog }));
  }

  async function scheduleRelease(item: Release) {
    const scheduledAt = parseTaipeiDateTimeInput(scheduleInputs[item.id]);
    if (!scheduledAt) { toast.push("error", "請輸入有效的台灣時間排程日期與時間。" ); return; }
    await withBusy(`schedule-${item.id}`, `v${item.version} 已排程發布`, () => apiPost(`/admin/releases/${item.id}/schedule`, { scheduledAt }));
  }

  async function saveFeature() {
    const releaseDate = featureForm.releaseDate ? parseTaipeiDateTimeInput(featureForm.releaseDate) : null;
    if (featureForm.releaseDate && !releaseDate) { toast.push("error", "Feature 發布時間格式無效。" ); return; }
    const payload = { ...featureForm, releaseDate };
    await withBusy("feature-save", editingFeatureKey ? "Feature gate 已更新" : "Feature gate 已建立", async () => {
      await apiPost("/admin/releases/features", payload);
      setFeatureForm(EMPTY_FEATURE);
      setEditingFeatureKey(null);
    });
  }

  function editFeature(item: FeatureGate) {
    setEditingFeatureKey(item.featureKey);
    setFeatureForm({ featureKey: item.featureKey, featureName: item.featureName, requiredVersion: item.requiredVersion, minimumVersion: item.minimumVersion, enabled: item.enabled, releaseStatus: item.releaseStatus, releaseDate: formatTaipeiDateTimeInput(item.releaseDate) });
  }

  const currentVersion = releases.data?.currentVersion ?? "—";
  const allReleases = releases.data?.releases ?? [];
  const allFeatures = featureData.data?.features ?? [];
  const activeSessionTotal = analytics.data?.totalActiveSessions ?? 0;

  return <div className="space-y-4">
    <Card title="版本更新中心" subtitle="草稿、遷移檢查、發布與 feature gate 集中管理；實際客戶端版本只從登入後送出的版本標頭與匿名工作階段紀錄計算。正式發布必須與已部署的程式版本相同，避免只更新公告而未部署程式。">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">目前部署版本</p><p className="mt-1 font-mono text-lg">v{currentVersion}</p></div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">近 30 日活躍工作階段</p><p className="mt-1 text-lg font-semibold">{analytics.data?.totalActiveSessions ?? 0}</p></div>
        <div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">近 30 日活躍使用者</p><p className="mt-1 text-lg font-semibold">{analytics.data?.totalActiveUsers ?? 0}</p></div>
      </div>
      <p className="mt-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs leading-5 text-muted">版本統計由已登入客戶端回報的版本與 session key 計算；資料庫中的問題回報 app_version 不會被當成活躍版本。session key 僅以雜湊形式保存。要讓新部署回報正確版本，Vercel Production 請設定 NEXT_PUBLIC_APP_VERSION 與該版 SemVer 相同，再重新部署。</p>
    </Card>

    <Card title="版本分析（近 30 日）" subtitle="只列出近 30 日有活動的真實客戶端版本／匿名工作階段資料。">
      {analytics.data?.versions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-2">客戶端版本</th><th>工作階段</th><th>使用者</th><th>工作階段占比</th><th>最近回報（台北）</th></tr></thead><tbody>{analytics.data.versions.map((item) => <tr key={item.appVersion} className="border-t border-[var(--line)]"><td className="py-2 font-mono">v{item.appVersion}</td><td>{item.activeSessions}</td><td>{item.activeUsers}</td><td>{activeSessionTotal ? `${((item.activeSessions / activeSessionTotal) * 100).toFixed(1)}%` : "0.0%"}</td><td>{formatTaipeiDateTime(item.lastSeenAt)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted">尚無近 30 日客戶端 session 版本回報；使用者打開新版後會自動開始累積。</p>}
    </Card>

    <Card title={editingId ? `編輯 v${form.version} 草稿` : "建立版本草稿"} subtitle="SemVer 格式 major.minor.patch；PATCH／HOTFIX、MINOR、MAJOR 會檢查版本號是否相符。最低支援版本不可高於新版本。">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="版本號"><Input placeholder="1.2.0" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></Field>
        <Field label="版本類型"><select className="h-10 rounded-xl border border-[var(--line)] bg-transparent px-3 text-sm" value={form.releaseType} onChange={(event) => setForm({ ...form, releaseType: event.target.value })}><option value="PATCH">PATCH</option><option value="HOTFIX">HOTFIX</option><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option></select></Field>
        <Field label="標題"><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
        <Field label="摘要"><Input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} /></Field>
        <Field label="最低支援版本"><Input value={form.minimumSupportedVersion} onChange={(event) => setForm({ ...form, minimumSupportedVersion: event.target.value })} /></Field>
        <Field label="詳細說明"><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label="Release notes"><Textarea value={form.releaseNotes} onChange={(event) => setForm({ ...form, releaseNotes: event.target.value })} /></Field>
        <Field label="新功能（每行一項）"><Textarea value={form.newFeatures} onChange={(event) => setForm({ ...form, newFeatures: event.target.value })} /></Field>
        <Field label="改善（每行一項）"><Textarea value={form.improvements} onChange={(event) => setForm({ ...form, improvements: event.target.value })} /></Field>
        <Field label="Bug 修正（每行一項）"><Textarea value={form.bugFixes} onChange={(event) => setForm({ ...form, bugFixes: event.target.value })} /></Field>
        <Field label="重大變更（每行一項）"><Textarea value={form.breakingChanges} onChange={(event) => setForm({ ...form, breakingChanges: event.target.value })} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.migrationRequired} onChange={(event) => setForm({ ...form, migrationRequired: event.target.checked })} />此版本需要 database migration</label>
      <p className="mt-1 text-xs text-muted">migration 需先在線上資料庫執行；版本中心不會自行連線或執行 production SQL。只有管理員記錄 migration 成功後才可發布。</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button loading={busyKey === "release-save"} onClick={() => void saveRelease()}>{editingId ? "儲存草稿" : "建立版本草稿"}</Button>{editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_RELEASE); }}>取消編輯</Button>}</div>
    </Card>

    <Card title="版本與發布狀態" subtitle="versionCode 由資料庫 sequence 自動遞增。排程以 Asia/Taipei 輸入，後端保存 UTC，透過既有每分鐘 queue drain 到期發布。">
      <div className="space-y-3">{allReleases.map((item) => <div key={item.id} className="glass-soft min-w-0 rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono">v{item.version}</strong><span className="text-xs text-muted">Build #{item.versionCode}</span><Badge tone={item.status === "PUBLISHED" ? "green" : item.status === "SCHEDULED" ? "cyan" : item.status === "ARCHIVED" ? "rose" : "gold"}>{item.status}</Badge><Badge tone={item.migrationStatus === "SUCCEEDED" || item.migrationStatus === "NOT_REQUIRED" ? "green" : item.migrationStatus === "FAILED" ? "rose" : "gold"}>Migration: {item.migrationStatus}</Badge></div><p className="mt-1 truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted">{item.releaseType} · 最低支援 v{item.minimumSupportedVersion}{item.releasedAt ? ` · 發布 ${formatTaipeiDateTime(item.releasedAt)}` : ""}{item.scheduledAt ? ` · 預定 ${formatTaipeiDateTime(item.scheduledAt)}` : ""}{item.migrationStartedAt ? ` · migration 開始 ${formatTaipeiDateTime(item.migrationStartedAt)}` : ""}{item.migrationCompletedAt ? ` · migration 完成 ${formatTaipeiDateTime(item.migrationCompletedAt)}` : ""}{item.publishedBy ? ` · 發布者 ${item.publishedBy}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">{item.status === "DRAFT" && <><Button size="sm" variant="outline" onClick={() => editRelease(item)}>編輯</Button>{item.migrationRequired && <><Button size="sm" variant="outline" disabled={busyKey === `migration-${item.id}`} onClick={() => void updateMigration(item, "RUNNING")}>開始 migration</Button><Button size="sm" variant="outline" disabled={busyKey === `migration-${item.id}`} onClick={() => void updateMigration(item, "SUCCEEDED")}>記錄成功</Button><Button size="sm" variant="outline" disabled={busyKey === `migration-${item.id}`} onClick={() => void updateMigration(item, "FAILED")}>記錄失敗</Button></>}<Button size="sm" disabled={item.migrationRequired && item.migrationStatus !== "SUCCEEDED" || busyKey === `release-${item.id}`} onClick={() => void withBusy(`release-${item.id}`, `v${item.version} 已發布`, () => apiPost(`/admin/releases/${item.id}/publish`, {}))}>立即發布</Button><Button size="sm" variant="outline" onClick={() => void withBusy(`archive-${item.id}`, "版本已封存", () => apiPost(`/admin/releases/${item.id}/archive`, {}))}>封存</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm(`確定永久刪除 v${item.version} 草稿？`)) void withBusy(`delete-${item.id}`, "草稿已刪除", () => apiDelete(`/admin/releases/${item.id}`)); }}>刪除草稿</Button></>}{item.status === "SCHEDULED" && <Button size="sm" variant="outline" onClick={() => void withBusy(`cancel-${item.id}`, "發布排程已取消", () => apiPost(`/admin/releases/${item.id}/cancel`, {}))}>取消排程</Button>}{item.status === "PUBLISHED" && item.version !== allReleases.filter((release) => release.status === "PUBLISHED").map((release) => release.version).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) && <Button size="sm" variant="outline" onClick={() => void withBusy(`archive-${item.id}`, "版本已封存", () => apiPost(`/admin/releases/${item.id}/archive`, {}))}>封存舊版本</Button>}</div>
        </div>
        {item.status === "DRAFT" && <div className="mt-3 flex flex-wrap items-end gap-2"><Field label="排程發布時間（台灣）"><Input type="datetime-local" value={scheduleInputs[item.id] ?? ""} onChange={(event) => setScheduleInputs({ ...scheduleInputs, [item.id]: event.target.value })} /></Field><Button size="sm" variant="outline" disabled={item.migrationRequired && item.migrationStatus !== "SUCCEEDED" || busyKey === `schedule-${item.id}`} onClick={() => void scheduleRelease(item)}>排程發布</Button></div>}
        <details className="mt-3"><summary className="cursor-pointer text-xs text-[#b9f2ff]">預覽更新內容</summary><div className="mt-2 space-y-2 rounded-xl bg-black/15 p-3 text-xs"><p className="whitespace-pre-wrap">{item.releaseNotes || item.description || item.subtitle}</p>{item.newFeatures?.length > 0 && <p><strong>新功能：</strong>{item.newFeatures.join("、")}</p>}{item.improvements?.length > 0 && <p><strong>改善：</strong>{item.improvements.join("、")}</p>}{item.bugFixes?.length > 0 && <p><strong>修復：</strong>{item.bugFixes.join("、")}</p>}{item.breakingChanges?.length > 0 && <p><strong>重大變更：</strong>{item.breakingChanges.join("、")}</p>}</div></details>
        {item.migrationErrorLog && <details className="mt-3"><summary className="cursor-pointer text-xs text-red-300">檢視 migration 失敗摘要</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-xs">{item.migrationErrorLog}</pre></details>}
      </div>)}{!allReleases.length && <p className="text-sm text-muted">尚無版本草稿或發布紀錄。</p>}</div>
    </Card>

    <Card title="Feature Version Gates" subtitle="新功能可設定 required version、minimum version、啟用狀態與發布／排程狀態。已接上 server route 的功能會拒絕過舊或未回報版本的直接 API 請求。">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Feature key"><Input placeholder="lesson_tts" value={featureForm.featureKey} disabled={Boolean(editingFeatureKey)} onChange={(event) => setFeatureForm({ ...featureForm, featureKey: event.target.value })} /></Field>
        <Field label="功能名稱"><Input value={featureForm.featureName} onChange={(event) => setFeatureForm({ ...featureForm, featureName: event.target.value })} /></Field>
        <Field label="Required version"><Input value={featureForm.requiredVersion} onChange={(event) => setFeatureForm({ ...featureForm, requiredVersion: event.target.value })} /></Field>
        <Field label="Minimum version"><Input value={featureForm.minimumVersion} onChange={(event) => setFeatureForm({ ...featureForm, minimumVersion: event.target.value })} /></Field>
        <Field label="發布狀態"><select className="h-10 rounded-xl border border-[var(--line)] bg-transparent px-3 text-sm" value={featureForm.releaseStatus} onChange={(event) => setFeatureForm({ ...featureForm, releaseStatus: event.target.value as ReleaseStatus })}><option value="DRAFT">DRAFT</option><option value="SCHEDULED">SCHEDULED</option><option value="PUBLISHED">PUBLISHED</option><option value="ARCHIVED">ARCHIVED</option></select></Field>
        <Field label="Feature 發布／啟用時間（台灣，可留空）"><Input type="datetime-local" value={featureForm.releaseDate} onChange={(event) => setFeatureForm({ ...featureForm, releaseDate: event.target.value })} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={featureForm.enabled} onChange={(event) => setFeatureForm({ ...featureForm, enabled: event.target.checked })} />啟用此功能</label>
      <div className="mt-3 flex flex-wrap gap-2"><Button loading={busyKey === "feature-save"} onClick={() => void saveFeature()}>{editingFeatureKey ? "儲存 Feature Gate" : "建立 Feature Gate"}</Button>{editingFeatureKey && <Button variant="outline" onClick={() => { setEditingFeatureKey(null); setFeatureForm(EMPTY_FEATURE); }}>取消編輯</Button>}</div>
      <div className="mt-4 space-y-2">{allFeatures.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white/[0.02] p-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.featureName}</strong><code className="text-xs text-[#b9f2ff]">{item.featureKey}</code><Badge tone={item.releaseStatus === "PUBLISHED" ? "green" : item.releaseStatus === "ARCHIVED" ? "rose" : "gold"}>{item.releaseStatus}</Badge><Badge tone={item.enabled ? "green" : "rose"}>{item.enabled ? "已啟用" : "已停用"}</Badge></div><p className="mt-1 text-xs text-muted">需要 v{item.requiredVersion} · 最低 v{item.minimumVersion}{item.releaseDate ? ` · ${formatTaipeiDateTime(item.releaseDate)}` : ""}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => editFeature(item)}>編輯</Button>{item.releaseStatus !== "PUBLISHED" && item.releaseStatus !== "ARCHIVED" && <Button size="sm" onClick={() => void withBusy(`feature-publish-${item.featureKey}`, "Feature gate 已發布", () => apiPost(`/admin/releases/features/${item.featureKey}/publish`, {}))}>立即發布</Button>}{item.releaseStatus !== "ARCHIVED" && <Button size="sm" variant="outline" onClick={() => void withBusy(`feature-archive-${item.featureKey}`, "Feature gate 已封存", () => apiPost(`/admin/releases/features/${item.featureKey}/archive`, {}))}>封存</Button>}</div></div>)}{!allFeatures.length && <p className="text-sm text-muted">尚未設定 feature version gate。</p>}</div>
    </Card>
  </div>;
}
