"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Field, Input, Select, Skeleton, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPost, errorMessage, useApi } from "@/lib/api";

type Subject = { id: string; subject: string; units: string[] };
type ActivityResponse = { activity: { id: string; name: string; scope: string; status: string; effectiveStatus: string }; subjects: Subject[] };
type RoomState = { room: { id: string; activityId: string; roomCode: string; hostUserId: string; status: "WAITING" | "RUNNING" | "FINISHED" | "CANCELLED"; startedAt: string | null; endsAt: string | null; maxPlayers: number; durationMinutes: number; subject: string; scope: string }; participants: Array<{ userId: string; displayName: string; avatarSeed: string; status: string; score: number | null; correctCount: number; wrongCount: number; unansweredCount: number; lastSeenAt: string | null }> };
type RoomDetail = { room: RoomState["room"]; self: { userId: string }; participants: RoomState["participants"]; questions: Array<{ id: string; orderIndex: number; snapshot: { stem?: string; options?: string[]; type?: string; explanation?: string } }>; answers: Array<{ questionId: string; answer: string[]; isCorrect: boolean; submittedAt: string | null }> };

export default function ExamPrepPkPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const activity = useApi<ActivityResponse>(id ? `/exam-prep/${id}` : null);
  const [subjectId, setSubjectId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(50);
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const effectiveSubjectId = subjectId || activity.data?.subjects[0]?.id || "";

  async function createRoom() {
    if (!id) return;
    setBusy(true);
    try { const result = await apiPost<{ roomId: string }>('/exam-pk/rooms', { activityId: id, subjectId: effectiveSubjectId || null, maxPlayers, durationMinutes }); await loadRoom(result.roomId); toast.push("success", "PK 房已建立，房號可以分享給同學"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "建立 PK 房失敗"); } finally { setBusy(false); }
  }
  async function joinRoom() {
    if (!roomCode.trim()) return;
    setBusy(true);
    try { const result = await apiPost<{ roomId: string }>(`/exam-pk/room-codes/${roomCode.trim()}/join`, {}); await loadRoom(result.roomId); toast.push("success", "已加入 PK 房"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "加入 PK 房失敗"); } finally { setBusy(false); }
  }
  async function loadRoom(roomId: string, silent = false) {
    try {
      const detail = await apiGet<RoomDetail>(`/exam-pk/rooms/${roomId}`, { fresh: true });
      setRoom(detail);
      setState({ room: detail.room, participants: detail.participants });
      setSelected(Object.fromEntries(detail.answers.map((item) => [item.questionId, item.answer])));
      setAnswered(Object.fromEntries(detail.answers.filter((item) => item.submittedAt).map((item) => [item.questionId, true])));
      setActiveQuestionId((current) => current || detail.questions.find((question) => !detail.answers.some((answer) => answer.questionId === question.id && answer.submittedAt))?.id || detail.questions[0]?.id || "");
      window.localStorage.setItem(`studynova:exam-pk-room:${id}`, roomId);
    } catch (error) {
      if (!silent) toast.push("error", error instanceof Error ? error.message : "無法載入 PK 房");
    }
  }
  async function startRoom() { if (!room) return; setBusy(true); try { await apiPost(`/exam-pk/rooms/${room.room.id}/start`, {}); await loadRoom(room.room.id); } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法開始考試"); } finally { setBusy(false); } }
  async function deleteRoom() { if (!room) return; setBusy(true); try { await apiDelete(`/exam-pk/rooms/${room.room.id}`); toast.push("success", "PK 房已刪除"); window.localStorage.removeItem(`studynova:exam-pk-room:${id}`); router.push(`/exam-prep/${id}`); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); } }
  async function endRoom() { if (!room) return; setBusy(true); try { await apiPost(`/exam-pk/rooms/${room.room.id}/end`, {}); await loadRoom(room.room.id); toast.push("success", "PK 房已結束"); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); } }
  async function kickPlayer(userId: string, displayName: string) { if (!room || !window.confirm(`確定要將「${displayName}」踢出房間嗎？`)) return; setBusy(true); try { await apiPost(`/exam-pk/rooms/${room.room.id}/kick`, { userId }); await loadRoom(room.room.id, true); toast.push("success", `已將 ${displayName} 踢出房間`); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); } }
  async function submitAnswer(questionId: string) { if (!room || !selected[questionId]?.length || state?.room.status !== "RUNNING") return; setBusy(true); try { await apiPost(`/exam-pk/rooms/${room.room.id}/answers`, { questionId, answer: selected[questionId], timeSpent: 0 }); setAnswered((current) => ({ ...current, [questionId]: true })); } catch (error) { toast.push("error", error instanceof Error ? error.message : "答案保存失敗"); } finally { setBusy(false); } }

  useEffect(() => {
    if (!id || room?.room.id) return;
    const remembered = searchParams.get("roomId") || window.localStorage.getItem(`studynova:exam-pk-room:${id}`);
    if (remembered) {
      void loadRoom(remembered);
      return;
    }
    void apiGet<{ rooms: Array<{ id: string; activityId: string; status: string }> }>("/exam-pk/rooms/mine", { fresh: true }).then((result) => {
      const mine = result.rooms.find((item) => item.activityId === id && ["WAITING", "RUNNING"].includes(item.status));
      if (mine) void loadRoom(mine.id);
    }).catch(() => undefined);
  }, [id, room?.room.id, searchParams]);

  useEffect(() => {
    if (!room?.room.id) return;
    const roomId = room.room.id;
    const source = new EventSource(`/api/v1/exam-pk/rooms/${roomId}/events?stream=${Date.now()}`);
    source.addEventListener("state", (event) => { try { setState(JSON.parse((event as MessageEvent).data) as RoomState); } catch { /* ignore malformed transient events */ } });
    source.onerror = () => { /* native EventSource reconnects; polling below is the fallback */ };
    const fallback = window.setInterval(() => { void loadRoom(roomId, true); }, 2500);
    return () => { source.close(); window.clearInterval(fallback); };
  }, [room?.room.id]);
  useEffect(() => {
    if (!room?.room.id) return;
    const timer = window.setInterval(() => { void apiPost(`/exam-pk/rooms/${room.room.id}/heartbeat`, {}).catch(() => undefined); }, 15_000);
    return () => window.clearInterval(timer);
  }, [room?.room.id]);
  useEffect(() => {
    const endsAt = room?.room.endsAt;
    if (!endsAt || room?.room.status !== "RUNNING") { setRemainingSeconds(null); return; }
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [room?.room.endsAt, room?.room.status]);

  if (activity.loading) return <Card><Skeleton lines={6} /></Card>;
  if (activity.error) return <Card><p className="text-sm text-rose-200">{activity.error}</p></Card>;
  if (!activity.data) return null;
  const currentState = state?.room ?? room?.room;
  const participants = state?.participants ?? room?.participants ?? [];
  const isHost = room?.self.userId === currentState?.hostUserId;
  return <div className="min-h-screen space-y-5 pb-24">
    <Link href={`/exam-prep/${id}`} className="inline-flex items-center gap-2 text-xs text-cyan-200 hover:underline">← 返回段考衝刺</Link>
    <header className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#7c5cff]/20 via-white/[0.03] to-[#20c5e8]/10 p-6 sm:p-8"><p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP · LIVE ROOM</p><h1 className="mt-3 text-3xl font-black">建立段考 PK 房</h1><p className="mt-2 text-sm leading-6 text-muted">選擇科目後建立專屬房間，分享六位數房號給同學；題目、答案、排名與結算都由伺服器記錄。</p></header>
    {!room && <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card title="開一間新房" subtitle="一間房最多 50 人，題目上限 50 題。"><div className="grid gap-3 sm:grid-cols-2"><Field label="作答科目"><Select value={effectiveSubjectId} onChange={(event) => setSubjectId(event.target.value)}>{activity.data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.subject}</option>)}</Select></Field><Field label="房間人數上限"><Input type="number" min={2} max={50} value={maxPlayers} onChange={(event) => setMaxPlayers(Math.max(2, Math.min(50, Number(event.target.value) || 2)))} /></Field><Field label="作答時間"><Select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}><option value={30}>30 分鐘</option><option value={40}>40 分鐘</option><option value={50}>50 分鐘</option><option value={60}>60 分鐘</option></Select></Field></div><Button className="mt-4" loading={busy} onClick={() => void createRoom()}>建立房間並進入等待室</Button></Card><Card title="加入同學的房" subtitle="輸入房主分享的六位數房號。"><Field label="房間代碼"><Input inputMode="numeric" maxLength={6} value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="例如 482193" /></Field><Button variant="outline" className="mt-4" loading={busy} disabled={roomCode.length !== 6} onClick={() => void joinRoom()}>加入考試房</Button></Card></div>}
    {room && currentState && <div className="space-y-4"><Card title={<span className="flex flex-wrap items-center gap-2">房號 <b className="font-mono text-cyan-200">{currentState.roomCode}</b><Badge tone={currentState.status === "RUNNING" ? "green" : currentState.status === "FINISHED" ? "muted" : "gold"}>{currentState.status === "WAITING" ? "等待開始" : currentState.status === "RUNNING" ? "作答中" : "已結束"}</Badge>{currentState.status === "RUNNING" && remainingSeconds !== null && <Badge tone={remainingSeconds <= 60 ? "rose" : "green"}>剩餘 {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</Badge>}</span>} subtitle={`${currentState.subject}・${currentState.durationMinutes} 分鐘・${currentState.maxPlayers} 人上限`} action={<div className="flex flex-wrap gap-2">{isHost && currentState.status === "WAITING" && <Button size="sm" loading={busy} onClick={() => void startRoom()}>開始考試</Button>}{isHost && ["WAITING", "RUNNING"].includes(currentState.status) && <Button size="sm" variant="danger" loading={busy} onClick={() => void (currentState.status === "WAITING" ? deleteRoom() : endRoom())}>{currentState.status === "WAITING" ? "刪除房間" : "結束房間"}</Button>}</div>}><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{participants.map((participant, index) => <div key={participant.userId} className="rounded-2xl border border-[var(--line)] bg-white/[0.03] p-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full border border-cyan-200/30 bg-gradient-to-br from-violet-500/80 to-cyan-400/80 text-lg font-black text-white">{participant.displayName.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{participant.displayName}{participant.userId === currentState.hostUserId ? "・房主" : ""}</p><p className="text-[11px] text-muted">{participant.status === "KICKED" ? "已被移出" : participant.status === "SUBMITTED" ? "已交卷" : participant.status === "ANSWERING" ? "作答中" : "已加入"}</p></div>{isHost && participant.userId !== room.self.userId && participant.status !== "KICKED" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void kickPlayer(participant.userId, participant.displayName)}>踢出</Button>}</div><p className="mt-3 text-xs text-muted">答對 {participant.correctCount} ・答錯 {participant.wrongCount} ・得分 {participant.score ?? 0}</p></div>)}</div></Card>
      {currentState.status === "WAITING" && <Card title="等待室" subtitle="把房號分享給同學；狀態會即時同步，不會刷新整個頁面。"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5 text-center"><p className="text-xs tracking-[.2em] text-muted">ROOM CODE</p><p className="mt-2 font-mono text-4xl font-black tracking-[.25em] text-cyan-100">{currentState.roomCode}</p><p className="mt-3 text-sm text-muted">目前 {participants.length} 人已加入・房主開始後所有人同步進入作答</p></div></Card>}
      {currentState.status === "RUNNING" && <Card title="作答區" subtitle="上方可切換題號；每題送出後會立即記錄，送出後不可修改。"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-3"><p className="mb-2 text-xs font-bold text-cyan-100">所有題號</p><div className="flex flex-wrap gap-2">{room.questions.map((question, index) => <button key={question.id} type="button" onClick={() => setActiveQuestionId(question.id)} className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-xs font-bold transition ${activeQuestionId === question.id ? "border-cyan-100 bg-cyan-300/30 text-white" : answered[question.id] ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-[var(--line)] text-muted hover:border-cyan-300/50"}`}>{index + 1}</button>)}</div></div><div className="mt-4 space-y-4">{room.questions.map((question, index) => { const snapshot = question.snapshot; const options = snapshot.options ?? []; return <div key={question.id} onClick={() => setActiveQuestionId(question.id)} className={`rounded-2xl border p-4 transition ${activeQuestionId === question.id ? "border-cyan-200/70 ring-1 ring-cyan-200/30" : ""} ${answered[question.id] ? "border-emerald-300/35 bg-emerald-300/[0.05]" : "border-[var(--line)] bg-white/[0.025]"}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold">{index + 1}. {snapshot.stem}</p>{answered[question.id] && <Badge tone="green">已送出</Badge>}</div>{options.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{options.map((option) => <button type="button" disabled={answered[question.id] || busy} key={option} onClick={(event) => { event.stopPropagation(); setSelected((current) => ({ ...current, [question.id]: [option] })); }} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${selected[question.id]?.includes(option) ? "border-cyan-200 bg-cyan-300/15 text-cyan-50" : "border-[var(--line)] hover:border-cyan-300/40"}`}>{option}</button>)}</div>}{!answered[question.id] && <Button size="sm" className="mt-3" disabled={!selected[question.id]?.length} onClick={() => void submitAnswer(question.id)}>送出答案</Button>}</div>; })}</div></Card>}
      {currentState.status === "FINISHED" && <Card title="本次 PK 結算" subtitle="排名依得分、答對題數與完成時間排序。"><div className="space-y-2">{[...participants].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)).map((participant, index) => <div key={participant.userId} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><span><b className="mr-3 text-cyan-200">#{index + 1}</b>{participant.displayName}</span><span className="text-muted">{participant.score ?? 0} 分・答對 {participant.correctCount}</span></div>)}</div><Button variant="outline" className="mt-4" onClick={() => router.push(`/exam-prep/${id}`)}>回到活動</Button></Card>}
    </div>}
  </div>;
}
