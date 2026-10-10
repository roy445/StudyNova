"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, ErrorState, Skeleton } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { useApi } from "@/lib/api";

type Subject = { id: string; subject: string; chapters: string[]; units: string[]; questionTypes: string[]; difficulty: string };
type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openMode: string; status: string; effectiveStatus: string; openAt: string | null; closeAt: string | null; timezone: string; subjects: Subject[] };
type ActivityResponse = { activity: Activity; subjects: Subject[]; access: { canEnter: boolean; reason: string } };

const statusText: Record<string, string> = { open: "開放中", scheduled: "尚未開放", closed: "已關閉", archived: "已封存", pending_review: "題目審核中", draft: "準備中" };

export default function ExamPrepActivityPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi<ActivityResponse>(id ? `/exam-prep/${id}` : null);
  const data = api.data;
  const activity = data?.activity;
  return <div className="space-y-6 pb-24"><Link href="/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺中心</Link>{api.loading && <Card><Skeleton lines={7} /></Card>}{api.error && <ErrorState message={api.error} onRetry={api.reload} />}{data && activity && <><header className="rounded-[2rem] border border-cyan-300/20 bg-white/[0.03] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP ACTIVITY</p><h1 className="mt-3 text-3xl font-black">{activity.name}</h1><p className="mt-3 text-sm leading-7 text-muted">{activity.description || activity.scope || "管理員尚未補充活動說明。"}</p></div><Badge tone={activity.effectiveStatus === "open" ? "green" : activity.effectiveStatus === "closed" ? "rose" : "gold"}>{statusText[activity.effectiveStatus] ?? activity.effectiveStatus}</Badge></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">考試名稱</p><p className="mt-1 font-semibold">{activity.examName}</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">適用對象</p><p className="mt-1 font-semibold">{activity.educationLevel === "senior" ? "高中" : "國中"}・{activity.grade} 年級</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">時間</p><p className="mt-1 font-semibold">{activity.openAt ? formatTaipeiDateTime(activity.openAt) : "手動開放"}{activity.closeAt ? ` ～ ${formatTaipeiDateTime(activity.closeAt)}` : ""}</p></div></div></header><Card title="考試範圍" subtitle="本活動的科目與章節由管理員設定。"><div className="grid gap-3 sm:grid-cols-2">{data.subjects.map((subject) => <div key={subject.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><h2 className="font-bold">{subject.subject}</h2><p className="mt-3 text-xs text-muted">章節</p><div className="mt-1 flex flex-wrap gap-2">{subject.chapters.length ? subject.chapters.map((chapter) => <span key={chapter} className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-100">{chapter}</span>) : <span className="text-sm text-muted">尚未設定</span>}</div><p className="mt-3 text-xs text-muted">單元</p><p className="mt-1 text-sm text-muted">{subject.units.length ? subject.units.join("、") : "依活動題庫設定"}</p></div>)}</div></Card><Card title="下一步" subtitle={data.access.reason || "活動已開放後即可開始刷題。"}>{data.access.canEnter ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4 text-sm text-muted">題目匯入與學生刷題流程正在依 Phase 2～4 建置；目前先顯示已確認的活動資料，不會使用假題目或假進度。</div> : <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-muted">{data.access.reason}</div>}</Card></>}</div>;
}
