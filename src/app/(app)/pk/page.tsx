"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import { apiDelete, apiPost, useApi } from "@/lib/api";

type Me = { user: { userId: string; displayName: string; avatarSeed: string } };
type Source = { config: { minQuestions: number; maxQuestions: number; minTimeSec: number; maxTimeSec: number }; sources?: unknown[] };
type Room = { id: string; name: string; roomCode: string; shareToken: string; status: string; matchId: string | null; hostId: string; playerCount: number; maxPlayers: number; matchStatus: string };
type MatchData = { match: { id: string; status: string; subject: string; questionCount: number; questionTimeSec: number; currentQuestion: number; startsAt: string | null; finishedAt: string | null }; room: { id: string; name: string; roomCode: string; shareToken: string; status: string; maxPlayers: number; hostId: string } | null; me: { userId: string; score: number; combo: number; correctCount: number; answeredCount: number; rank: number | null }; players: Array<{ userId: string; displayName: string; avatarSeed?: string; role: string; score: number; combo: number; correctCount: number; answeredCount: number; rank: number | null }>; questions: Array<{ id: string; orderIndex: number; stem: string; options: string[] }> };

type Flash = { kind: "correct" | "wrong"; text: string; id: number } | null;

export default function PkPage() {
  const toast = useToast();
  const me = useApi<Me>("/auth/me");
  const source = useApi<Source>("/pk/sources");
  const rooms = useApi<{ rooms: Room[] }>("/pk/rooms/mine");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [gradeLevel, setGradeLevel] = useState<"JUNIOR_HIGH" | "SENIOR_HIGH">("JUNIOR_HIGH");
  const [difficulty, setDifficulty] = useState("normal");
  const [roomName, setRoomName] = useState("我的 PK 房");
  const [roomBusy, setRoomBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const match = useApi<MatchData>(matchId ? `/pk/matches/${matchId}` : null, [matchId]);
  const status = useApi<{ matched: boolean; matchId: string | null; queue: { status: string } | null }>(searching && !matchId ? "/pk/matchmaking/status" : null, [searching, matchId]);

  const current = useMemo(() => {
    if (!match.data) return null;
    return match.data.questions.find((question) => question.orderIndex === match.data?.match.currentQuestion) ?? match.data.questions[match.data.me.answeredCount] ?? null;
  }, [match.data]);
  const opponent = match.data?.players.find((player) => player.userId !== me.data?.user.userId && player.role !== "bot") ?? match.data?.players.find((player) => player.userId !== me.data?.user.userId) ?? null;

  useEffect(() => {
    if (!searching || matchId) return;
    const timer = window.setInterval(() => void status.reload(), 1800);
    return () => window.clearInterval(timer);
  }, [searching, matchId, status]);

  useEffect(() => {
    if (status.data?.matched && status.data.matchId) {
      window.setTimeout(() => {
        setMatchId(status.data?.matchId ?? null);
        setSearching(false);
      }, 0);
    }
  }, [status.data]);

  useEffect(() => {
    if (!matchId) return;
    const timer = window.setInterval(() => void match.reload(), 1200);
    const events = new EventSource(`/api/v1/pk/matches/${matchId}/events`);
    events.onmessage = () => void match.reload();
    events.onerror = () => undefined;
    return () => { window.clearInterval(timer); events.close(); };
  }, [matchId, match]);

  async function join() {
    setSearching(true);
    try {
      const result = await apiPost<{ matched: boolean; matchId?: string }>("/pk/matchmaking/join", { mode, gradeLevel, difficulty, teamMode: mode === "1v1" ? "solo" : "team", idempotencyKey: `${Date.now()}-${crypto.randomUUID()}` });
      if (result.matchId) { setMatchId(result.matchId); setSearching(false); }
      else toast.push("info", "已進入配對，找到同學後會直接開始對戰");
    } catch (error) { setSearching(false); toast.push("error", error instanceof Error ? error.message : "無法開始配對"); }
  }

  async function cancel() {
    try { await apiPost("/pk/matchmaking/cancel", {}); setSearching(false); toast.push("success", "已取消配對"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "取消配對失敗"); }
  }

  async function createRoom() {
    setRoomBusy(true);
    try {
      const result = await apiPost<{ match: { id: string }; room: Room }>("/pk/rooms", { name: roomName.trim() || "我的 PK 房", visibility: "public", password: "", maxPlayers: mode === "1v1" ? 2 : 4, mode, teamMode: mode === "1v1" ? "solo" : "team", gradeLevel, difficulty, allowLateJoin: false, allowSpectators: false, showRanking: true, inviteIds: [], sourceType: "bank", sourceId: null, questionBankId: null });
      await rooms.reload();
      setMatchId(result.match.id);
      toast.push("success", `房間已建立，房號 ${result.room.roomCode}`);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "建立 PK 房失敗"); }
    finally { setRoomBusy(false); }
  }

  async function deleteRoom(room: Pick<Room, "id">) {
    setRoomBusy(true);
    try { await apiDelete(`/pk/rooms/${room.id}`); await rooms.reload(); toast.push("success", "PK 房已刪除"); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "刪除 PK 房失敗"); }
    finally { setRoomBusy(false); }
  }

  async function kickPlayer(roomId: string, userId: string) {
    try { await apiPost(`/pk/rooms/${roomId}/kick`, { userId }); await match.reload(); toast.push("success", "已將成員踢出房間"); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "踢出成員失敗"); }
  }

  async function answer(option: string) {
    if (!matchId || !current || answered[current.id] || match.data?.match.status !== "in_progress") return;
    // This handler runs only after a user click; the timestamps are request metadata.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    setAnswered((value) => ({ ...value, [current.id]: true }));
    try {
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      const result = await apiPost<{ isCorrect: boolean; finished: boolean }>(`/pk/matches/${matchId}/answer`, { questionId: current.id, selectedOption: option, responseMs: Math.max(0, now - startedAt), idempotencyKey: `${matchId}:${current.id}:${now}` });
      setFlash({ kind: result.isCorrect ? "correct" : "wrong", text: result.isCorrect ? "答對！" : "答錯", id: now });
      window.setTimeout(() => setFlash(null), 900);
      await match.reload();
    } catch (error) { setAnswered((value) => ({ ...value, [current.id]: false })); toast.push("error", error instanceof Error ? error.message : "送出答案失敗"); }
  }

  if (matchId && match.data) {
    const finished = match.data.match.status === "completed";
    return <main className="mx-auto max-w-6xl space-y-4 pb-24"><div className="flex items-center justify-between"><Link href="/dashboard" className="text-xs text-cyan-200 hover:underline">← 返回學習中心</Link><Badge tone={finished ? "gold" : "green"}>{finished ? "對戰結束" : match.data.match.status === "countdown" ? "準備開始" : "即時對戰"}</Badge></div><Card className="overflow-hidden border-rose-300/25 bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,.16),transparent_45%),rgba(255,255,255,.02)]"><div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center"><PlayerCard player={match.data.players.find((player) => player.userId === me.data?.user.userId) ?? null} label="你" self /><div className="text-center"><p className="text-xs font-black tracking-[.3em] text-rose-200">LIVE PK</p><p className="mt-2 text-3xl font-black text-white">{match.data.me.score} <span className="text-base text-muted">VS</span> {opponent?.score ?? 0}</p><p className="mt-1 text-xs text-muted">第 {Math.min(match.data.match.questionCount, match.data.me.answeredCount + 1)}／{match.data.match.questionCount} 題</p></div><PlayerCard player={opponent} label="對手" /></div></Card>{match.data.room && match.data.room.hostId === me.data?.user.userId && <Card title="房主管理" subtitle="等待開始時可刪除房間；你也可以把成員踢出。"><div className="flex flex-wrap gap-2">{match.data.players.filter((player) => player.userId !== me.data?.user.userId && player.role === "player").map((player) => <Button key={player.userId} size="sm" variant="outline" onClick={() => void kickPlayer(match.data!.room!.id, player.userId)}>踢出 {player.displayName}</Button>)}{["waiting", "matching"].includes(match.data.match.status) && <Button size="sm" variant="danger" loading={roomBusy} onClick={() => void deleteRoom({ id: match.data!.room!.id })}>刪除房間</Button>}</div></Card>}{flash && <div key={flash.id} className={`pk-answer-feedback ${flash.kind === "correct" ? "pk-answer-correct" : "pk-answer-wrong"}`}>{flash.text}</div>}{finished ? <Card title="本場對戰已結束" subtitle="雙方最後成績已同步完成。"><div className="grid gap-3 sm:grid-cols-2"><ScoreBox label="你的成績" value={`${match.data.me.score} 分・答對 ${match.data.me.correctCount} 題`} /><ScoreBox label="對手成績" value={`${opponent?.score ?? 0} 分・答對 ${opponent?.correctCount ?? 0} 題`} /></div><Button className="mt-4" onClick={() => { setMatchId(null); setAnswered({}); setFlash(null); }}>再來一場</Button></Card> : <Card title={current ? `第 ${current.orderIndex + 1} 題` : "等待題目同步"} subtitle={match.data.match.status === "countdown" ? "倒數結束後開始作答" : "先送出答案，再即時查看雙方分數"}>{current ? <><p className="text-lg font-bold leading-8">{current.stem}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{current.options.map((option) => <button key={option} type="button" disabled={Boolean(answered[current.id]) || match.data?.match.status !== "in_progress"} onClick={() => void answer(option)} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[.05] p-4 text-left text-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60">{option}</button>)}</div></> : <Skeleton lines={4} />}</Card>}</main>;
  }

  return <main className="mx-auto max-w-3xl space-y-5 pb-24"><Link href="/dashboard" className="text-xs text-cyan-200 hover:underline">← 返回學習中心</Link><header className="rounded-[2rem] border border-rose-300/25 bg-[radial-gradient(circle_at_20%_0%,rgba(244,63,94,.22),transparent_45%),linear-gradient(145deg,rgba(16,25,55,.96),rgba(30,16,48,.96))] p-7 sm:p-10"><p className="text-xs font-black tracking-[.28em] text-rose-200">STUDYNOVA LIVE ARENA</p><h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">跟同學直接開戰</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-200">不用另外建立房間。按下開始配對後，系統會尋找符合條件的同學，找到後直接進入雙方即時作答頁面。</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><label className="rounded-xl border border-white/10 bg-black/15 p-3 text-xs">模式<select value={mode} onChange={(event) => setMode(event.target.value as "1v1" | "2v2")} className="mt-2 w-full rounded-lg bg-black/25 p-2"><option value="1v1">1 對 1</option><option value="2v2">2 對 2</option></select></label><label className="rounded-xl border border-white/10 bg-black/15 p-3 text-xs">學段<select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value as "JUNIOR_HIGH" | "SENIOR_HIGH")} className="mt-2 w-full rounded-lg bg-black/25 p-2"><option value="JUNIOR_HIGH">國中</option><option value="SENIOR_HIGH">高中</option></select></label><label className="rounded-xl border border-white/10 bg-black/15 p-3 text-xs">難度<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="mt-2 w-full rounded-lg bg-black/25 p-2"><option value="easy">簡單</option><option value="normal">標準</option><option value="hard">困難</option></select></label></div>{searching ? <div className="mt-5"><div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[.06] p-5 text-center"><div className="mx-auto flex max-w-md items-center justify-between gap-3"><PlayerCard player={me.data ? { userId: me.data.user.userId, displayName: me.data.user.displayName, avatarSeed: me.data.user.avatarSeed, score: 0, combo: 0, correctCount: 0, answeredCount: 0, rank: null, role: "player" } : null} label="你" self /><span className="animate-pulse text-2xl text-cyan-200">⇄</span><div className="text-center"><span className="pk-question-avatar pk-question-avatar-searching">?</span><p className="mt-2 text-xs text-muted">尋找同學中…</p></div></div><p className="mt-4 text-xs text-muted">配對成功後會自動跳轉到 PK 對戰頁面</p><Button variant="ghost" className="mt-3" onClick={() => void cancel()}>取消配對</Button></div></div> : <Button className="mt-6 !bg-gradient-to-r !from-rose-500 !to-violet-500 !text-white" onClick={() => void join()}>開始配對，直接進入對戰</Button>}</header><Card title="自訂 PK 房間" subtitle="每個帳號最多同時建立 5 個房間；房主可刪除房間或踢出成員。"><div className="flex flex-col gap-3 sm:flex-row"><input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} aria-label="PK 房間名稱" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" /><Button loading={roomBusy} onClick={() => void createRoom()}>建立房間</Button></div>{rooms.loading && <Skeleton lines={2} />}{rooms.data?.rooms.length ? <div className="mt-4 space-y-2">{rooms.data.rooms.map((room) => <div key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3"><button type="button" onClick={() => room.matchId && setMatchId(room.matchId)} className="min-w-0 text-left"><p className="truncate text-sm font-bold text-cyan-100">{room.name}</p><p className="mt-1 text-xs text-muted">房號 {room.roomCode}・{room.playerCount}/{room.maxPlayers} 人・{room.matchStatus === "waiting" ? "等待中" : room.matchStatus === "cancelled" ? "已刪除" : "已開始"}</p></button>{["waiting", "matching"].includes(room.matchStatus) && <Button size="sm" variant="danger" loading={roomBusy} onClick={() => void deleteRoom(room)}>刪除</Button>}</div>)}</div> : !rooms.loading && <p className="mt-3 text-xs text-muted">目前沒有你建立的 PK 房間。</p>}</Card><Card title="即時 PK 規則" subtitle="所有結果由伺服器判定，雙方狀態透過即時事件同步。"><div className="grid gap-3 text-sm text-muted sm:grid-cols-3"><div>◆ 相同條件配對</div><div>◆ 答對答錯即時動畫</div><div>◆ 雙方頭像與分數同步</div></div>{source.loading && <Skeleton lines={2} />}{source.error && <ErrorState message={source.error} onRetry={source.reload} />}</Card></main>;
}

function PlayerCard({ player, label, self = false }: { player: { userId: string; displayName: string; avatarSeed?: string; score: number; combo: number; correctCount: number; answeredCount: number; rank: number | null; role?: string } | null; label: string; self?: boolean }) {
  return <div className={`text-center ${self ? "pk-player-impact-left" : "pk-player-impact-right"}`}><UserAvatar userId={player?.userId} avatarSeed={player?.avatarSeed} displayName={player?.displayName ?? label} size={76} className="mx-auto ring-2 ring-white/15" /><p className="mt-2 font-bold">{player?.displayName ?? label}</p><p className="text-xs text-muted">答對 {player?.correctCount ?? 0}・連擊 {player?.combo ?? 0}</p></div>;
}
function ScoreBox({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-bold text-cyan-100">{value}</p></div>; }
