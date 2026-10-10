"use client";

import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { useApi } from "@/lib/api";

type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openAt: string | null; closeAt: string | null; effectiveStatus: string; subjects: Array<{ subject: string; chapters: string[]; units: string[] }> };

const statusLabel: Record<string, { label: string; tone: "green" | "gold" | "rose" | "muted" | "cyan" }> = {
  open: { label: "開放中", tone: "green" },
  scheduled: { label: "預約開放", tone: "gold" },
  closed: { label: "已關閉", tone: "rose" },
  pending_review: { label: "題目審核中", tone: "gold" },
  draft: { label: "準備中", tone: "muted" },
  archived: { label: "已封存", tone: "muted" },
};

export default function ExamPrepPage() {
  const api = useApi<{ timezone: string; profile: { schoolLevel: string | null; grade: number | null } | null; activities: Activity[] }>("/exam-prep/available");
  return <div className="space-y-6 pb-24"><header className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#7c5cff]/15 to-[#20c5e8]/10 p-6 sm:p-8"><p className="text-xs font-black tracking-[.25em] text-cyan-200">STUDYNOVA · EXAM PREP</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">段考衝刺中心</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">把不會的題目找出來，把會的題目練熟。所有開放時間以 {api.data?.timezone ?? "Asia/Taipei"} 判定。</p></header>
    {api.loading && <Card><Skeleton lines={6} /></Card>}
    {api.error && <ErrorState message={api.error} onRetry={api.reload} />}
    {api.data && !api.data.activities.length && <EmptyState icon="⌁" title="目前沒有可查看的段考活動" hint="管理員建立並開放段考衝刺活動後，活動會出現在這裡。" />}
    {api.data?.activities.map((activity) => { const status = statusLabel[activity.effectiveStatus] ?? statusLabel.draft; return <Link href={`/exam-prep/${activity.id}`} key={activity.id} className="group block"><Card className="transition group-hover:-translate-y-0.5 group-hover:border-cyan-300/50" title={activity.name} subtitle={`${activity.examName}・${activity.educationLevel === "senior" ? "高中" : "國中"}${activity.grade}${activity.semester ? `・${activity.semester}` : ""}`}><div className="flex flex-wrap items-center gap-2"><Badge tone={status.tone}>{status.label}</Badge>{activity.openAt && <span className="text-xs text-muted">開放：{formatTaipeiDateTime(activity.openAt)}</span>}{activity.closeAt && <span className="text-xs text-muted">截止：{formatTaipeiDateTime(activity.closeAt)}</span>}</div><p className="mt-3 text-sm leading-6 text-muted">{activity.description || activity.scope || "本活動的題目與章節範圍將依管理員設定顯示。"}</p><div className="mt-4 flex flex-wrap gap-2">{activity.subjects.map((subject) => <span key={subject.subject} className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted">{subject.subject}</span>)}</div><p className="mt-4 text-sm font-semibold text-cyan-200">查看活動資訊 →</p></Card></Link>; })}
  </div>;
}
