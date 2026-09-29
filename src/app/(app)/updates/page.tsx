"use client";

import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { useApi } from "@/lib/api";
import { APP_VERSION } from "@/lib/app-version";
import { formatTaipeiDateTime } from "@/lib/date-time";

type ReleaseSummary = { id: string; version: string; versionCode: number; releaseType: string; title: string; subtitle: string; description: string; releaseNotes: string; newFeatures: string[]; improvements: string[]; bugFixes: string[]; breakingChanges: string[]; releasedAt: string | null };

function NoteList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return <section className="mt-4"><h3 className="text-sm font-semibold text-[#b9f2ff]">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>;
}

export default function UpdatesPage() {
  const latest = useApi<{ currentVersion: string; latestVersion: string; minimumSupportedVersion: string; updateAvailable: boolean; forceUpdate: boolean; release: ReleaseSummary | null }>(`/releases/latest?currentVersion=${encodeURIComponent(APP_VERSION)}`);
  const history = useApi<{ releases: ReleaseSummary[] }>("/releases/history");
  const releases = history.data?.releases ?? [];

  return <main className="mx-auto min-h-dvh w-full max-w-5xl space-y-5 px-3 py-6 sm:px-6 sm:py-10">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-[#7dd3fc]">StudyNova</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">更新紀錄</h1><p className="mt-2 text-sm text-muted">查看目前版本、最新版本與每次更新內容。</p></div><Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--line)] px-3 text-sm hover:bg-white/5">回首頁</Link></header>
    <Card title="版本狀態" subtitle="版本資訊以正式部署版本與資料庫已發布 release 為準。">
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">目前客戶端</p><p className="mt-1 font-mono text-lg">v{latest.data?.currentVersion ?? APP_VERSION}</p></div><div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">最新已發布</p><p className="mt-1 font-mono text-lg">v{latest.data?.latestVersion ?? "—"}</p></div><div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3"><p className="text-xs text-muted">最低支援</p><p className="mt-1 font-mono text-lg">v{latest.data?.minimumSupportedVersion ?? "—"}</p></div></div>
      {latest.data?.forceUpdate && <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/5 p-3 text-sm text-rose-100">目前版本已停止支援，請更新至 v{latest.data.minimumSupportedVersion} 或更新版本後繼續使用。</div>}
      {latest.data?.updateAvailable && <p className="mt-3 text-sm text-[#ffe7ad]">有新版可用：v{latest.data.latestVersion}。</p>}
      {latest.data?.release && <div className="mt-4 rounded-2xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-4"><div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">最新版本</Badge><Badge tone="gold">{latest.data.release.releaseType}</Badge><strong>v{latest.data.release.version} · {latest.data.release.title}</strong></div><p className="mt-2 text-sm leading-6 text-muted">{latest.data.release.subtitle || latest.data.release.description}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{latest.data.release.releaseNotes}</p><NoteList title="新功能" items={latest.data.release.newFeatures} /><NoteList title="改善" items={latest.data.release.improvements} /><NoteList title="錯誤修復" items={latest.data.release.bugFixes} /><NoteList title="重大變更" items={latest.data.release.breakingChanges} /></div>}
    </Card>
    <Card title="版本歷史" subtitle="依版本新到舊排列；每個版本保留發布說明與時間。">
      <div className="space-y-3">{releases.map((item) => <details key={item.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4" open={item.version === latest.data?.latestVersion}><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">v{item.version} <span className="ml-1 text-xs font-normal text-muted">Build #{item.versionCode} · {item.releaseType}</span></p><p className="mt-1 text-sm text-muted">{item.title}{item.subtitle ? ` · ${item.subtitle}` : ""}</p></div><span className="text-xs text-muted">{item.releasedAt ? formatTaipeiDateTime(item.releasedAt) : "發布時間未提供"}</span></div></summary><div className="mt-4 border-t border-[var(--line)] pt-3"><p className="whitespace-pre-wrap text-sm leading-7">{item.releaseNotes || item.description}</p><NoteList title="新功能" items={item.newFeatures} /><NoteList title="改善" items={item.improvements} /><NoteList title="錯誤修復" items={item.bugFixes} /><NoteList title="重大變更" items={item.breakingChanges} /></div></details>)}{!releases.length && <p className="text-sm text-muted">目前尚無公開的版本紀錄。</p>}</div>
    </Card>
  </main>;
}
