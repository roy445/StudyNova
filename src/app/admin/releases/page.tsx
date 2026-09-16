"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input, Textarea, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Release = { id: string; version: string; title: string; status: string; releaseType: string; migrationRequired: boolean; minimumSupportedVersion: string; releasedAt: string | null; newFeatures: string[]; improvements: string[]; bugFixes: string[] };

export default function AdminReleasesPage() {
  const toast = useToast();
  const releases = useApi<{ releases: Release[] }>("/admin/releases");
  const [form, setForm] = useState({ version: "", title: "", releaseType: "PATCH", minimumSupportedVersion: "1.0.0", releaseNotes: "", newFeatures: "", improvements: "", bugFixes: "", migrationRequired: false });
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      await apiPost("/admin/releases", { ...form, newFeatures: form.newFeatures.split("\n").map((v) => v.trim()).filter(Boolean), improvements: form.improvements.split("\n").map((v) => v.trim()).filter(Boolean), bugFixes: form.bugFixes.split("\n").map((v) => v.trim()).filter(Boolean) });
      await releases.reload();
      toast.push("success", "版本草稿已建立；完成 Release Gate 後才能發布。" );
    } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  async function publish(id: string) {
    try { await apiPost(`/admin/releases/${id}/publish`, {}); await releases.reload(); toast.push("success", "版本已發布"); } catch (err) { toast.push("error", errorMessage(err)); }
  }
  return <div className="space-y-4">
    <Card title="版本更新中心" subtitle="Release 與一般公告分離管理；版本正式發布前必須完成檢查。">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="版本"><Input placeholder="1.1.0" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></Field>
        <Field label="發布類型"><select className="h-10 rounded-xl border border-[var(--line)] bg-transparent px-3 text-sm" value={form.releaseType} onChange={(e) => setForm({ ...form, releaseType: e.target.value })}><option value="PATCH">PATCH</option><option value="MINOR">MINOR</option><option value="MAJOR">MAJOR</option></select></Field>
        <Field label="標題"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="最低支援版本"><Input value={form.minimumSupportedVersion} onChange={(e) => setForm({ ...form, minimumSupportedVersion: e.target.value })} /></Field>
        <Field label="Release Notes"><Textarea value={form.releaseNotes} onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })} /></Field>
        <Field label="新功能（每行一項）"><Textarea value={form.newFeatures} onChange={(e) => setForm({ ...form, newFeatures: e.target.value })} /></Field>
        <Field label="改善（每行一項）"><Textarea value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} /></Field>
        <Field label="Bug 修正（每行一項）"><Textarea value={form.bugFixes} onChange={(e) => setForm({ ...form, bugFixes: e.target.value })} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.migrationRequired} onChange={(e) => setForm({ ...form, migrationRequired: e.target.checked })} />需要 Database Migration</label>
      <Button className="mt-3" loading={busy} onClick={() => void create()}>建立版本草稿</Button>
    </Card>
    <Card title="版本歷史與草稿" subtitle="草稿必須完成 Release Gate 後才能發布；發布後才會通知使用者更新。">
      <div className="space-y-2">{releases.data?.releases.map((release) => <div key={release.id} className="glass-soft flex flex-wrap items-center justify-between gap-3 p-3"><div><div className="flex items-center gap-2"><strong>{release.version}</strong><Badge tone={release.status === "PUBLISHED" ? "green" : "gold"}>{release.status}</Badge></div><p className="mt-1 text-sm">{release.title}</p></div>{release.status !== "PUBLISHED" && <Button size="sm" variant="outline" onClick={() => void publish(release.id)}>發布</Button>}</div>)}</div>
    </Card>
  </div>;
}
