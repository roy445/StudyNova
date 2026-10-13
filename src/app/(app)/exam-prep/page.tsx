"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { apiPost, useApi } from "@/lib/api";

const studentTitle = (value: string) => value.replace(/^\s*\d{3,4}學年度\s*/, "");

type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openAt: string | null; closeAt: string | null; effectiveStatus: string; subjects: Array<{ id: string; subject: string; chapters: string[]; units: string[] }> };

function studentDescription() { return "依本次段考範圍整理題目，完成作答後可查看詳解與學習進度。" }
function subjectBackground(subject: string) {
  const value = subject.toLocaleLowerCase();
  if (value.includes("國文") || value.includes("語文")) return "radial-gradient(circle at 86% 18%, rgba(53,211,153,.30), transparent 27%), repeating-linear-gradient(135deg, rgba(53,211,153,.08) 0 1px, transparent 1px 22px), linear-gradient(120deg, #071c27, #071226 56%, #092c32)";
  if (value.includes("英文") || value.includes("英語")) return "radial-gradient(circle at 86% 18%, rgba(167,139,250,.34), transparent 28%), repeating-linear-gradient(45deg, rgba(167,139,250,.08) 0 1px, transparent 1px 24px), linear-gradient(120deg, #10102d, #071226 56%, #1d1640)";
  if (value.includes("數學")) return "radial-gradient(circle at 86% 18%, rgba(55,211,255,.38), transparent 28%), linear-gradient(rgba(55,211,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(55,211,255,.09) 1px, transparent 1px), linear-gradient(120deg, #061b35, #071226 56%, #063a59)";
  if (value.includes("自然") || value.includes("理化") || value.includes("生物")) return "radial-gradient(ellipse at 84% 20%, transparent 0 12%, rgba(55,211,255,.20) 13% 13.5%, transparent 14% 22%, rgba(55,211,255,.12) 22.5% 23%, transparent 23.5%), radial-gradient(circle at 86% 18%, rgba(34,211,238,.34), transparent 29%), linear-gradient(120deg, #061d2b, #071226 56%, #06465a)";
  if (value.includes("社會") || value.includes("歷史") || value.includes("地理") || value.includes("公民")) return "radial-gradient(circle at 86% 18%, rgba(251,191,36,.32), transparent 28%), repeating-linear-gradient(0deg, rgba(251,191,36,.08) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(251,191,36,.06) 0 1px, transparent 1px 30px), linear-gradient(120deg, #211b0a, #071226 56%, #45320a)";
  return "radial-gradient(circle at 86% 18%, rgba(55,211,255,.30), transparent 28%), linear-gradient(120deg, #061b35, #071226 56%, #063a59)";
}

const statusLabel: Record<string, { label: string; tone: "green" | "gold" | "rose" | "muted" | "cyan" }> = {
  open: { label: "開放中", tone: "green" },
  scheduled: { label: "預約開放", tone: "gold" },
  closed: { label: "已關閉", tone: "rose" },
  pending_review: { label: "題目審核中", tone: "gold" },
  draft: { label: "準備中", tone: "muted" },
  archived: { label: "已封存", tone: "muted" },
};

export default function ExamPrepPage() {
  const router = useRouter();
  const api = useApi<{ timezone: string; profile: { schoolLevel: string | null; grade: number | null } | null; activities: Activity[] }>("/exam-prep/available");
  const [pkOpen, setPkOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [pkBusy, setPkBusy] = useState(false);
  async function createPkRoom() {
    if (!selectedActivityId) return;
    const activity = api.data?.activities.find((item) => item.id === selectedActivityId);
    const subject = activity?.subjects.find((item) => item.id === selectedSubjectId) ?? activity?.subjects[0];
    if (!activity || !subject) return;
    setPkBusy(true);
    try {
      const result = await apiPost<{ roomId: string; activityId: string }>("/exam-pk/rooms", { activityId: activity.id, subjectId: selectedSubjectId || null, maxPlayers: 50, durationMinutes: 50 });
      router.push(`/exam-prep/${result.activityId}/pk?roomId=${result.roomId}`);
    } finally {
      setPkBusy(false);
    }
  }
  async function joinPkRoom() {
    if (!/^\d{6}$/.test(roomCode)) return;
    setPkBusy(true);
    try {
      const result = await apiPost<{ roomId: string; activityId: string }>(`/exam-pk/room-codes/${roomCode}/join`, {});
      router.push(`/exam-prep/${result.activityId}/pk?roomId=${result.roomId}`);
    } finally {
      setPkBusy(false);
    }
  }
  return <div className="space-y-6 pb-24"><header className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#7c5cff]/15 to-[#20c5e8]/10 p-6 sm:p-8"><p className="text-xs font-black tracking-[.25em] text-cyan-200">STUDYNOVA · EXAM PREP</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">段考衝刺中心</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">把不會的題目找出來，把會的題目練熟。所有開放時間以 {api.data?.timezone ?? "Asia/Taipei"} 判定。</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => { const first = api.data?.activities.find((item) => item.effectiveStatus === "open") ?? api.data?.activities[0]; setSelectedActivityId(first?.id ?? ""); setSelectedSubjectId(first?.subjects[0]?.id ?? ""); setPkOpen(true); }} className="rounded-xl border border-cyan-200/35 bg-cyan-300/15 px-4 py-3 text-sm font-bold text-cyan-50 transition hover:-translate-y-0.5 hover:bg-cyan-300/25">建立段考 PK 房</button><button type="button" onClick={() => setJoinOpen(true)} className="rounded-xl border border-violet-200/35 bg-violet-300/15 px-4 py-3 text-sm font-bold text-violet-50 transition hover:-translate-y-0.5 hover:bg-violet-300/25">輸入 PK 房號</button></div></header>
    {pkOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl border border-cyan-300/25 bg-[#0b1226] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs tracking-[.2em] text-cyan-200">EXAM PREP · PK</p><h2 className="mt-1 text-xl font-black">建立段考 PK 房</h2></div><button type="button" onClick={() => setPkOpen(false)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/10" aria-label="關閉">×</button></div><p className="mt-2 text-sm text-muted">選擇目前開放的段考活動與科目，建立後房號會保留在「我的房間」。</p><div className="mt-4 space-y-3"><label className="block text-sm">段考活動<select value={selectedActivityId} onChange={(event) => { setSelectedActivityId(event.target.value); setSelectedSubjectId(api.data?.activities.find((item) => item.id === event.target.value)?.subjects[0]?.id ?? ""); }} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3">{api.data?.activities.filter((item) => item.effectiveStatus === "open").map((item) => <option key={item.id} value={item.id}>{studentTitle(item.name)}・{item.examName}</option>)}</select></label><label className="block text-sm">作答科目<select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 p-3">{api.data?.activities.find((item) => item.id === selectedActivityId)?.subjects.map((item) => <option key={item.id} value={item.id}>{item.subject}</option>)}</select></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPkOpen(false)} className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-white/10">取消</button><button type="button" disabled={pkBusy || !selectedActivityId || !selectedSubjectId} onClick={() => void createPkRoom()} className="rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{pkBusy ? "建立中…" : "建立並進入房間"}</button></div></div></div>}
    {joinOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-violet-300/25 bg-[#0b1226] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">輸入 PK 房號</h2><button type="button" onClick={() => setJoinOpen(false)} className="rounded-lg px-2 py-1 text-muted hover:bg-white/10" aria-label="關閉">×</button></div><p className="mt-2 text-sm text-muted">輸入同學分享的六位數房號，加入後刷新頁面也會保留。</p><input inputMode="numeric" maxLength={6} value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="例如 482193" className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 p-3 font-mono tracking-[.25em]" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setJoinOpen(false)} className="rounded-xl px-4 py-2 text-sm text-muted hover:bg-white/10">取消</button><button type="button" disabled={pkBusy || roomCode.length !== 6} onClick={() => void joinPkRoom()} className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{pkBusy ? "加入中…" : "加入房間"}</button></div></div></div>}
    {api.loading && <Card><Skeleton lines={6} /></Card>}
    {api.error && <ErrorState message={api.error} onRetry={api.reload} />}
    {api.data && !api.data.activities.length && <EmptyState icon="⌁" title="目前沒有可查看的段考活動" hint="管理員建立並開放段考衝刺活動後，活動會出現在這裡。" />}
    {api.data?.activities.map((activity) => { const status = statusLabel[activity.effectiveStatus] ?? statusLabel.draft; return <Link href={`/exam-prep/${activity.id}`} key={activity.id} className="group block"><div className="overflow-hidden rounded-[1.25rem] border border-cyan-300/20 bg-[#071226] bg-cover bg-center transition group-hover:-translate-y-0.5 group-hover:border-cyan-200/60" style={{ backgroundImage: `linear-gradient(90deg, rgba(4,12,29,.97) 0%, rgba(4,12,29,.86) 48%, rgba(4,12,29,.48) 100%), ${subjectBackground(activity.subjects[0]?.subject ?? "數學")}` }}><Card className="!border-0 !bg-transparent shadow-none" title={studentTitle(activity.name)} subtitle={`${activity.examName}・${activity.educationLevel === "senior" ? "高中" : "國中"}${activity.grade}${activity.semester ? `・${activity.semester}` : ""}`}><div className="flex flex-wrap items-center gap-2"><Badge tone={status.tone}>{status.label}</Badge>{activity.openAt && <span className="text-xs text-muted">開放：{formatTaipeiDateTime(activity.openAt)}</span>}{activity.closeAt && <span className="text-xs text-muted">截止：{formatTaipeiDateTime(activity.closeAt)}</span>}</div><p className="mt-3 text-sm leading-6 text-muted">{studentDescription()}</p><div className="mt-4 flex flex-wrap gap-2">{activity.subjects.map((subject) => <span key={subject.subject} className="rounded-full border border-white/20 bg-slate-950/45 px-3 py-1.5 text-xs font-semibold text-white/90">{subject.subject}</span>)}</div><p className="mt-4 text-sm font-semibold text-cyan-200">查看活動資訊 →</p></Card></div></Link>; })}
  </div>;
}
