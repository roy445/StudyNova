"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, Stat, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, useApi } from "@/lib/api";

type PkConfig = {
  enabled: boolean;
  quickMatchEnabled: boolean;
  friendMatchEnabled: boolean;
  customRoomEnabled: boolean;
  publicArenaEnabled: boolean;
  botEnabled: boolean;
  allowedModes: string[];
  maxPlayers: number;
  minQuestions: number;
  maxQuestions: number;
  minTimeSec: number;
  maxTimeSec: number;
  defaultRewardNova: number;
  defaultRewardXp: number;
  activityId: string | null;
};
type Overview = {
  config: PkConfig;
  online: number;
  pkOnline: number;
  matchmaking: number;
  waitingRooms: number;
  liveMatches: number;
  live: Array<{ id: string; subject: string; mode: string; status: string; startsAt: string | null; questionCount: number }>;
  activities: Array<{ id: string; name: string; cover: string; subject: string; scope: string; description: string; startsAt: string; endsAt: string; questionCount: number; difficulty: string; rewardNova: number; rewardXp: number }>;
  myMatchId: string | null;
};
type Friend = { userId: string; novaId: string; displayName: string; level: number | null; xp: number | null };
type FriendsResponse = { friends: Friend[] };
type MatchQuestion = { id: string; orderIndex: number; type: string; stem: string; options: string[]; sourceLabel: string; unit: string };
type MatchPlayer = { userId: string; displayName: string; novaId: string; teamId: string | null; role: string; connectionState: string; score: number; combo: number; maxCombo: number; correctCount: number; answeredCount: number; totalResponseMs: number; fastestResponseMs: number | null; rank: number | null };
type MatchData = {
  match: { id: string; roomId: string | null; status: string; mode: string; teamMode: string; subject: string; grade: string; unit: string; difficulty: string; questionCount: number; questionTimeSec: number; currentQuestion: number; startsAt: string | null; endsAt: string | null; finishedAt: string | null; allowLateJoin: boolean; allowSpectators: boolean; showRanking: boolean };
  room: { id: string; name: string; roomCode: string; shareToken: string; visibility: string; maxPlayers: number; status: string; hostId: string } | null;
  me: { userId: string; score: number; combo: number; maxCombo: number; correctCount: number; answeredCount: number; rank: number | null };
  players: MatchPlayer[];
  questions: MatchQuestion[];
};
type AnswerResult = { accepted: boolean; replay: boolean; isCorrect: boolean; scoreAwarded: number; combo: number; score: number; serverResponseMs?: number; finished?: boolean };

type GradeLevel = "JUNIOR_HIGH" | "SENIOR_HIGH";
type Difficulty = "easy" | "normal" | "hard";
type CreateForm = { mode: "1v1" | "2v2" | "3v3" | "多人"; gradeLevel: GradeLevel; difficulty: Difficulty; teamMode: "solo" | "team" };
const DEFAULT_FORM: CreateForm = { mode: "1v1", gradeLevel: "JUNIOR_HIGH", difficulty: "normal", teamMode: "solo" };
const MATCHMAKING_STATUSES = ["已加入真人配對佇列", "正在尋找相同條件的真人玩家", "找到對手後會自動進入賽場"] as const;

function randomKey() {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function playTone(enabled: boolean, correct: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audio = new AudioContextCtor();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = correct ? 720 : 180;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.18);
    window.setTimeout(() => void audio.close(), 300);
  } catch {
    // Sound is an optional enhancement; a blocked AudioContext never blocks a match.
  }
}

export default function OnlinePkPage() {
  const toast = useToast();
  const overview = useApi<Overview>("/pk/overview");
  const setOverviewData = overview.setData;
  const friends = useApi<FriendsResponse>("/friends");
  const [section, setSection] = useState<"quick" | "bot" | "friends" | "room" | "self">("quick");
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [roomName, setRoomName] = useState("我的 PK 房");
  const [roomCode, setRoomCode] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [roomPrivate, setRoomPrivate] = useState(false);
  const [roomMaxPlayers, setRoomMaxPlayers] = useState(8);
  const [allowLateJoin, setAllowLateJoin] = useState(false);
  const [allowSpectators, setAllowSpectators] = useState(false);
  const [showRanking, setShowRanking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [wrongQuestionIds, setWrongQuestionIds] = useState<string[]>([]);
  const [resultAction, setResultAction] = useState<"review" | "vocabulary" | null>(null);

  const loadMatch = async (id: string) => {
    setMatchLoading(true);
    try {
      const value = await apiGet<MatchData>(`/pk/matches/${id}`);
      setMatch(value);
      if (value.match.status === "in_progress" && !questionStartedAt) setQuestionStartedAt(Date.now());
      if (value.match.status === "completed") setQueueing(false);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setMatchLoading(false);
    }
  };

  useEffect(() => {
    if (overview.data?.myMatchId && !matchId) {
      const timer = window.setTimeout(() => setMatchId(overview.data?.myMatchId ?? null), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [overview.data?.myMatchId, matchId]);

  useEffect(() => {
    if (!queueing) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const freshOverview = await apiGet<Overview>("/pk/overview", { fresh: true });
          setOverviewData(() => freshOverview);
          if (freshOverview.myMatchId) {
            setMatchId(freshOverview.myMatchId);
            setQueueing(false);
            setQueueMessage("");
          }
        } catch {
          // Keep the queue UI available; the next poll or visible error will recover.
        }
      })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [queueing, setOverviewData]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const queryMatch = query.get("match");
    const queryRoom = query.get("room");
    if (queryMatch) window.setTimeout(() => setMatchId(queryMatch), 0);
    if (queryRoom) {
      void apiPost<{ matchId: string }>("/pk/rooms/join", { shareToken: queryRoom }).then((value) => { window.setTimeout(() => setMatchId(value.matchId), 0); toast.push("success", "已加入 PK 房間"); }).catch((error) => toast.push("error", errorMessage(error)));
    }
    // Query strings are read once when a share URL opens; the live state is server-owned afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!matchId) { const timer = window.setTimeout(() => setMatch(null), 0); return () => window.clearTimeout(timer); }
    const initialLoad = window.setTimeout(() => void loadMatch(matchId), 0);
    const timer = window.setInterval(() => void loadMatch(matchId), 12_000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const source = new EventSource(`/api/v1/pk/matches/${matchId}/events`, { withCredentials: true });
    const refresh = (event?: Event) => {
      if (event?.type === "match_started") setQuestionStartedAt(Date.now());
      if (event?.type === "answer_submitted") setAnswerResult(null);
      void loadMatch(matchId);
    };
    ["match_created", "player_joined", "player_left", "countdown_started", "match_started", "answer_submitted", "match_finished", "admin_control"].forEach((eventType) => source.addEventListener(eventType, refresh));
    source.onerror = () => { /* browser EventSource automatically reconnects */ };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const sessionKey = sessionStorage.getItem("studynova:pk-presence-session") ?? randomKey();
    sessionStorage.setItem("studynova:pk-presence-session", sessionKey);
    const beat = () => { void apiPost("/pk/presence/heartbeat", { sessionKey, state: "online", currentMatchId: matchId, currentRoomId: match?.room?.id ?? null }).catch(() => {}); void apiPost(`/pk/matches/${matchId}/heartbeat`, {}).catch(() => {}); };
    beat();
    const timer = window.setInterval(beat, 25_000);
    return () => window.clearInterval(timer);
  }, [matchId, match?.room?.id]);

  useEffect(() => {
    if (!match || match.match.status !== "in_progress" || match.me.answeredCount >= match.match.questionCount) return;
    if (!questionStartedAt) { const timer = window.setTimeout(() => setQuestionStartedAt(Date.now()), 0); return () => window.clearTimeout(timer); }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - questionStartedAt;
      setRemainingMs(Math.max(0, match.match.questionTimeSec * 1000 - elapsed));
    }, 100);
    return () => window.clearInterval(timer);
  }, [match, questionStartedAt]);

  const currentQuestion = match && match.match.status === "in_progress" ? match.questions[match.me.answeredCount] : null;
  const leaderboard = useMemo(() => [...(match?.players ?? [])].filter((player) => player.role === "player").sort((a, b) => b.score - a.score || b.correctCount - a.correctCount), [match?.players]);
  const isHost = Boolean(match && match.room && match.room.hostId === match.me.userId);

  async function quickMatch(restart = false) {
    setBusy(true);
    try {
      if (restart) await apiPost("/pk/matchmaking/cancel", {});
      const result = await apiPost<{ matched: boolean; matchId?: string; message: string }>("/pk/matchmaking/join", { mode: form.mode, gradeLevel: form.gradeLevel, difficulty: form.difficulty, teamMode: form.teamMode });
      if (result.matchId) { setMatchId(result.matchId); setQueueing(false); setQueueMessage(""); toast.push("success", result.message); }
      else { setQueueing(true); setQueueMessage(result.message); toast.push("info", result.message); }
      await overview.reload();
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function startBotMatch() {
    setBusy(true);
    try {
      const result = await apiPost<{ matchId: string; preparation: { message: string } }>("/pk/bot-match", { mode: form.mode, gradeLevel: form.gradeLevel, difficulty: form.difficulty, teamMode: form.teamMode });
      setMatchId(result.matchId);
      setQueueing(false);
      setQueueMessage("");
      toast.push("success", result.preparation.message);
      await overview.reload();
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function switchToBotMatch() {
    setBusy(true);
    try {
      await apiPost("/pk/matchmaking/cancel", {});
      setQueueing(false);
      setQueueMessage("");
      setSection("bot");
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function cancelQueue() {
    setBusy(true);
    try { await apiPost("/pk/matchmaking/cancel", {}); setQueueing(false); setQueueMessage(""); await overview.reload(); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function createRoom() {
    setBusy(true);
    try {
      const result = await apiPost<{ match: { id: string }; room: { roomCode: string; shareToken: string } }>("/pk/rooms", { mode: form.mode, teamMode: form.teamMode, gradeLevel: form.gradeLevel, difficulty: form.difficulty, name: roomName, visibility: roomPrivate ? "private" : "public", password: roomPassword, maxPlayers: roomMaxPlayers, allowLateJoin, allowSpectators, showRanking, inviteIds: friendIds });
      setMatchId(result.match.id);
      toast.push("success", `房間已建立：${result.room.roomCode}`);
      await overview.reload();
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function joinRoom() {
    if (!roomCode.trim()) return toast.push("error", "請輸入 6 碼房間碼");
    setBusy(true);
    try { const result = await apiPost<{ matchId: string }>("/pk/rooms/join", { roomCode: roomCode.trim(), password: roomPassword }); setMatchId(result.matchId); toast.push("success", "已加入等候室"); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function startMatch() {
    if (!matchId) return;
    setBusy(true);
    try { await apiPost(`/pk/matches/${matchId}/start`, {}); setQuestionStartedAt(null); await loadMatch(matchId); toast.push("success", "比賽開始倒數！"); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function leaveMatch() {
    if (!matchId) return;
    setBusy(true);
    try { await apiPost(`/pk/matches/${matchId}/leave`, {}); setMatchId(null); setMatch(null); setQueueing(false); await overview.reload(); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  async function shareMatch() {
    if (!match?.room) return;
    const url = `${window.location.origin}/online-pk?room=${encodeURIComponent(match.room.shareToken)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${match.room.name}｜StudyNova 線上 PK`, text: `加入我的 StudyNova PK 房間：${match.room.roomCode}`, url });
      else { await navigator.clipboard.writeText(url); toast.push("success", "PK 邀請連結已複製"); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.push("error", "分享失敗，請改用房間碼邀請");
    }
  }

  async function submitAnswer(option: string) {
    if (!matchId || !match || !currentQuestion || answering || match.match.status !== "in_progress") return;
    setAnswering(true);
    setSelectedOption(option);
    try {
      const result = await apiPost<AnswerResult>(`/pk/matches/${matchId}/answer`, { questionId: currentQuestion.id, selectedOption: option, responseMs: Math.max(0, match.match.questionTimeSec * 1000 - remainingMs), idempotencyKey: randomKey() });
      setAnswerResult(result);
      playTone(soundOn, result.isCorrect);
      if (!result.isCorrect) setWrongQuestionIds((items) => [...new Set([...items, currentQuestion.id])] );
      setQuestionStartedAt(Date.now());
      await loadMatch(matchId);
    } catch (error) { toast.push("error", errorMessage(error)); } finally { setAnswering(false); }
  }

  async function addResultItems(action: "review" | "vocabulary") {
    if (!matchId || !wrongQuestionIds.length) return;
    setResultAction(action);
    try { const result = await apiPost<{ added: number }>(`/pk/matches/${matchId}/review`, { action, questionIds: wrongQuestionIds, folderId: null, newFolderName: "PK 錯題" }); toast.push("success", action === "review" ? `已加入 ${result.added} 題錯題複習` : `已加入 ${result.added} 個單字資料夾`); } catch (error) { toast.push("error", errorMessage(error)); } finally { setResultAction(null); }
  }

  const config = overview.data?.config;
  const disableAll = config && !config.enabled;

  return (
    <div className="page-enter space-y-4 pb-6">
      <section className="pk-hero glass pk-glow-card rounded-[28px] p-5 sm:p-7">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#7dd3fc]"><span className="pk-live-dot inline-block h-2 w-2 rounded-full bg-[#37d3ff]" /> LIVE ARENA <span className="text-muted">・線上 PK</span></div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl"><span className="neon-text">知識對決，現在開打。</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">和真實同學比速度、正確率與連擊。題目、答案、計時、分數與獎勵由伺服器驗證，公平又即時。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
            <div className="glass-soft rounded-2xl px-3 py-3"><p className="text-[10px] text-muted">全站在線</p><p className="mt-1 text-2xl font-black text-[#e8edff]">{overview.data?.online ?? "—"}</p></div>
            <div className="glass-soft rounded-2xl px-3 py-3"><p className="text-[10px] text-muted">PK 中</p><p className="mt-1 text-2xl font-black text-[#37d3ff]">{overview.data?.pkOnline ?? "—"}</p></div>
            <div className="glass-soft rounded-2xl px-3 py-3"><p className="text-[10px] text-muted">找對手</p><p className="mt-1 text-2xl font-black text-[#ffc857]">{overview.data?.matchmaking ?? "—"}</p></div>
          </div>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <Link href="/challenge" className="focus-ring inline-flex items-center rounded-xl border border-[#a78bfa]/40 bg-[#a78bfa]/10 px-3 py-2 text-xs font-bold text-[#ddd6fe] transition hover:border-[#a78bfa]/70 hover:bg-[#a78bfa]/20">
            ⚔️ 好友挑戰
          </Link>
          <span className="text-xs text-muted">好友挑戰已集中到 PK 專區，可從這裡進入。</span>
        </div>
        {disableAll && <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">線上 PK 目前由管理員暫停，既有結算資料不受影響。</div>}
      </section>

      {match && <MatchPanel match={match} currentQuestion={currentQuestion} remainingMs={remainingMs} answerResult={answerResult} selectedOption={selectedOption} answering={answering} leaderboard={leaderboard} isHost={isHost} busy={busy} soundOn={soundOn} setSoundOn={setSoundOn} onAnswer={submitAnswer} onStart={startMatch} onLeave={leaveMatch} onShare={() => void shareMatch()} onReview={() => void addResultItems("review")} onVocabulary={() => void addResultItems("vocabulary")} resultAction={resultAction} wrongCount={wrongQuestionIds.length} />}

      {!match && (
        <>
          {queueing ? <MatchmakingScreen gradeLevel={form.gradeLevel} mode={form.mode} message={queueMessage} onCancel={() => void cancelQueue()} onSearchAgain={() => void quickMatch(true)} onSwitchToBot={() => void switchToBotMatch()} busy={busy} botEnabled={config?.botEnabled ?? false} /> : <>
            <PkModeNavigation active={section} onChange={setSection} botEnabled={config?.botEnabled ?? false} />
            {section === "self" ? <Card title="◎ 自我挑戰" subtitle="系統會從全站統一題目來源自動抽取，不需要選擇題庫。"><div className="space-y-4"><Field label="學段"><div className="grid grid-cols-2 gap-2">{(["JUNIOR_HIGH", "SENIOR_HIGH"] as GradeLevel[]).map((grade) => <button key={grade} type="button" onClick={() => setForm({ ...form, gradeLevel: grade })} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${form.gradeLevel === grade ? "border-[#37d3ff]/70 bg-[#37d3ff]/15 text-[#b9f2ff]" : "border-[var(--line)] bg-white/[.03]"}`}>{grade === "JUNIOR_HIGH" ? "國中" : "高中"}</button>)}</div></Field><Field label="難度"><Select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as Difficulty })}><option value="easy">基礎</option><option value="normal">標準</option><option value="hard">進階</option></Select></Field><p className="rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs leading-5 text-muted">正式題目會依學段、難度、發布狀態與 PK 開放狀態由伺服器抽取。</p><Button loading={busy} onClick={async () => { setBusy(true); try { const result = await apiPost<{ matchId: string; preparation: { message: string } }>("/pk/self-test", { gradeLevel: form.gradeLevel, difficulty: form.difficulty, questionCount: 10, questionTimeSec: 30 }); setMatchId(result.matchId); toast.push("success", result.preparation.message); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); } }}>開始自我挑戰</Button></div></Card> : <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><Card title={section === "quick" ? "真人配對" : section === "bot" ? "獨立人機對戰" : section === "friends" ? "邀請好友 PK" : "建立自訂房間"} subtitle={section === "quick" ? "只搜尋符合條件的真人玩家；真人與 Bot 對戰完全分開。" : section === "bot" ? "直接建立獨立人機對戰，不會佔用或偽裝成真人配對。" : section === "friends" ? "建立好友專屬賽場，邀請指定同學一起 PK。" : "設定房間規則後，分享房間碼邀請玩家。"}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="模式"><Select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as CreateForm["mode"] })}>{(config?.allowedModes ?? ["1v1"]).map((mode) => <option key={mode} value={mode}>{mode}</option>)}</Select></Field><Field label="學段"><Select value={form.gradeLevel} onChange={(event) => setForm({ ...form, gradeLevel: event.target.value as GradeLevel })}><option value="JUNIOR_HIGH">國中</option><option value="SENIOR_HIGH">高中</option></Select></Field><Field label="難度"><Select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as Difficulty })}><option value="easy">基礎</option><option value="normal">標準</option><option value="hard">進階</option></Select></Field></div>{section === "quick" && <div className="rounded-2xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs leading-5 text-muted">真人配對只會匹配真實玩家，不會自動加入 Bot。若目前人數不足，你可以重新搜尋或切換到獨立的人機對戰。</div>}{section === "bot" && <div className="rounded-2xl border border-violet-300/20 bg-violet-300/5 p-3 text-xs leading-5 text-muted">每場 Bot 對戰都使用獨立的比賽與 Bot 狀態；Bot 不會建立或登入 users 帳號，也不會出現在真人配對名單。</div>}{section === "friends" && <FriendPicker friends={friends.data?.friends ?? []} selected={friendIds} onChange={setFriendIds} loading={friends.loading} />}{(section === "friends" || section === "room") && <div className="grid gap-3 sm:grid-cols-2"><Field label="房間名稱"><Input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} /></Field><Field label="房間人數"><Input type="number" min={2} max={config?.maxPlayers ?? 12} value={roomMaxPlayers} onChange={(event) => setRoomMaxPlayers(Number(event.target.value))} /></Field></div>}{section === "room" && <div className="grid gap-3 sm:grid-cols-2"><Field label="加入現有房間碼"><Input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="六碼房間碼" /></Field><Field label="房間密碼"><Input type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="私人房間密碼" /></Field></div>}{(section === "friends" || section === "room") && <div className="flex flex-wrap gap-2 text-xs"><label className="glass-soft flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={roomPrivate} onChange={(event) => setRoomPrivate(event.target.checked)} className="accent-[#37d3ff]" />私人房間</label><label className="glass-soft flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={allowLateJoin} onChange={(event) => setAllowLateJoin(event.target.checked)} className="accent-[#37d3ff]" />允許遲到加入</label><label className="glass-soft flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={allowSpectators} onChange={(event) => setAllowSpectators(event.target.checked)} className="accent-[#37d3ff]" />允許觀戰</label></div>}<div className="flex flex-wrap gap-2"><Button loading={busy} disabled={Boolean(disableAll) || (section === "friends" && !friendIds.length) || (section === "bot" && config?.botEnabled === false)} onClick={() => void (section === "quick" ? quickMatch() : section === "bot" ? startBotMatch() : createRoom())}>{section === "quick" ? "搜尋真人對手" : section === "bot" ? "開始人機對戰" : section === "friends" ? `建立房間並邀請 ${friendIds.length} 位` : "建立 PK 房間"}</Button>{section === "room" && <Button variant="ghost" loading={busy} onClick={() => void joinRoom()}>加入房間</Button>}</div></div></Card><SideInfo overview={overview.data} /></div>}
          </>}
        </>
      )}

      {overview.loading && !overview.data && <Card><Skeleton lines={4} /></Card>}
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
    </div>
  );
}

function MatchmakingScreen({ gradeLevel, mode, message, onCancel, onSearchAgain, onSwitchToBot, busy, botEnabled }: { gradeLevel: GradeLevel; mode: string; message: string; onCancel: () => void; onSearchAgain: () => void; onSwitchToBot: () => void; busy: boolean; botEnabled: boolean }) {
  const [statusIndex, setStatusIndex] = useState(0);
  const noPlayers = message.includes("沒有足夠真人");
  useEffect(() => {
    if (noPlayers) return;
    const timer = window.setInterval(() => setStatusIndex((index) => (index + 1) % MATCHMAKING_STATUSES.length), 2500);
    return () => window.clearInterval(timer);
  }, [noPlayers]);
  return <Card title={noPlayers ? "目前沒有足夠的真人玩家" : "正在尋找真人對手"} subtitle={`${gradeLevel === "JUNIOR_HIGH" ? "國中" : "高中"} · ${mode} · 真人配對`}><div className="flex flex-col gap-4 rounded-2xl border border-[#37d3ff]/20 bg-[radial-gradient(circle_at_top,rgba(55,211,255,.10),transparent_65%)] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-[#37d3ff]" /><p className="font-semibold text-[#dff9ff]">{noPlayers ? "真人配對仍開放搜尋" : MATCHMAKING_STATUSES[statusIndex]}</p></div><p className="mt-1 text-sm leading-6 text-muted">{noPlayers ? "不會自動改成 Bot 對戰。你可以再搜一次，或自行選擇人機對戰。" : "配對成功後會自動進入賽場；這裡只會匹配真人玩家。"}</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onSearchAgain} loading={busy}>重新搜尋</Button><Button size="sm" disabled={!botEnabled} onClick={onSwitchToBot} loading={busy}>改成人機對戰</Button><Button size="sm" variant="ghost" onClick={onCancel} loading={busy}>取消</Button></div></div></Card>;
}

function PkModeNavigation({ active, onChange, botEnabled }: { active: "quick" | "bot" | "friends" | "room" | "self"; onChange: (key: "quick" | "bot" | "friends" | "room" | "self") => void; botEnabled: boolean }) {
  const items = [
    { key: "quick" as const, title: "真人配對", detail: "搜尋在線玩家", icon: "◉" },
    { key: "bot" as const, title: "人機對戰", detail: botEnabled ? "獨立 Bot 賽場" : "目前暫停", icon: "◇" },
    { key: "friends" as const, title: "邀請好友", detail: "指定同學一起玩", icon: "♧" },
    { key: "room" as const, title: "自訂房間", detail: "自行設定規則", icon: "▦" },
    { key: "self" as const, title: "自我挑戰", detail: "單人練習", icon: "◎" },
  ];
  return <div role="tablist" aria-label="PK 對戰模式" className="rounded-2xl border border-white/10 bg-[#091222]/80 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,.18)]"><div className="no-scrollbar flex gap-1 overflow-x-auto">{items.map((item) => <button key={item.key} type="button" role="tab" aria-selected={active === item.key} onClick={() => onChange(item.key)} className={`focus-ring flex min-w-[125px] flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition sm:min-w-0 ${active === item.key ? "border border-[#37d3ff]/35 bg-[#37d3ff]/10 text-white shadow-[inset_0_0_20px_rgba(55,211,255,.07)]" : "border border-transparent text-muted hover:bg-white/[.04] hover:text-white"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${active === item.key ? "bg-[#37d3ff]/15 text-[#7dd3fc]" : "bg-white/[.04]"}`}>{item.icon}</span><span className="min-w-0"><span className="block whitespace-nowrap text-xs font-semibold sm:text-sm">{item.title}</span><span className="mt-0.5 block whitespace-nowrap text-[10px] text-muted">{item.detail}</span></span></button>)}</div></div>;
}

function FriendPicker({ friends, selected, onChange, loading }: { friends: Friend[]; selected: string[]; onChange: (ids: string[]) => void; loading: boolean }) {
  if (loading) return <Skeleton lines={3} />;
  if (!friends.length) return <EmptyState icon="♟" title="還沒有好友" hint="先到好友功能新增同學，再回來邀請一起 PK。" />;
  return <div className="rounded-2xl border border-[#a78bfa]/20 bg-[#a78bfa]/5 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">選擇要邀請的好友</p><span className="text-xs text-muted">{selected.length} 位</span></div><div className="grid gap-2 sm:grid-cols-2">{friends.map((friend) => <label key={friend.userId} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${selected.includes(friend.userId) ? "border-[#37d3ff]/60 bg-[#37d3ff]/10" : "border-[var(--line)] bg-black/10"}`}><input type="checkbox" checked={selected.includes(friend.userId)} onChange={(event) => onChange(event.target.checked ? [...selected, friend.userId] : selected.filter((id) => id !== friend.userId))} className="accent-[#37d3ff]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{friend.displayName}</span><span className="block truncate font-mono text-[10px] text-muted">{friend.novaId} · Lv.{friend.level ?? 1}</span></span></label>)}</div></div>;
}

function SideInfo({ overview }: { overview: Overview | null }) {
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Stat label="等待房間" value={overview?.waitingRooms ?? "—"} tone="violet" /><Stat label="進行中" value={overview?.liveMatches ?? "—"} tone="cyan" /></div><Card title="✦ 進行中的活動" subtitle="只顯示資料庫中目前有效的活動。">{overview?.activities.length ? <div className="space-y-2">{overview.activities.map((activity) => <div key={activity.id} className="glass-soft flex w-full items-center gap-3 p-3"><span className="text-2xl">{activity.cover}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{activity.name}</span><span className="mt-0.5 block truncate text-xs text-muted">全站題目 · 系統自動抽題 · 獎勵 {activity.rewardNova} Nova</span></span></div>)}</div> : <EmptyState icon="✦" title="目前沒有進行中的活動" hint="管理員發布活動後會顯示在這裡。" />}</Card></div>;
}

function MatchPanel({ match, currentQuestion, remainingMs, answerResult, selectedOption, answering, leaderboard, isHost, busy, soundOn, setSoundOn, onAnswer, onStart, onLeave, onShare, onReview, onVocabulary, resultAction, wrongCount }: { match: MatchData; currentQuestion: MatchQuestion | null; remainingMs: number; answerResult: AnswerResult | null; selectedOption: string | null; answering: boolean; leaderboard: MatchPlayer[]; isHost: boolean; busy: boolean; soundOn: boolean; setSoundOn: (value: boolean) => void; onAnswer: (option: string) => void; onStart: () => void; onLeave: () => void; onShare: () => void; onReview: () => void; onVocabulary: () => void; resultAction: "review" | "vocabulary" | null; wrongCount: number }) {
  const waiting = ["waiting", "matching"].includes(match.match.status);
  const countdown = match.match.status === "countdown";
  const completed = match.match.status === "completed";
  const seconds = Math.ceil(remainingMs / 1000);
  const [countdownValue, setCountdownValue] = useState(3);
  useEffect(() => {
    if (!countdown || !match.match.startsAt) return;
    const update = () => setCountdownValue(Math.max(0, Math.ceil((new Date(match.match.startsAt as string).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [countdown, match.match.startsAt]);
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge tone={completed ? "gold" : "cyan"}>{completed ? "已結算" : countdown ? "倒數準備" : waiting ? "等候室" : match.match.status === "paused" ? "已暫停" : "進行中"}</Badge><span className="text-sm text-muted">{match.match.subject} · {match.match.mode} · {match.match.questionCount} 題</span>{match.room && <span className="font-mono text-xs text-[#7dd3fc]">房間 {match.room.roomCode}</span>}</div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setSoundOn(!soundOn)}>{soundOn ? "🔊 音效開" : "🔇 音效關"}</Button><Button size="sm" variant="ghost" loading={busy} onClick={onLeave}>{completed ? "返回 PK" : "離開"}</Button></div></div>
    {waiting && <Card title="等候室" subtitle="只有真實玩家加入後，房主才可以開始；不會填入機器人。"><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Stat label="目前玩家" value={match.players.filter((player) => player.role === "player").length} tone="cyan" /><Stat label="房間上限" value={match.room?.maxPlayers ?? "—"} /><Stat label="房間碼" value={match.room?.roomCode ?? "—"} tone="gold" /></div><div className="space-y-2">{match.players.map((player) => <PlayerRow key={player.userId} player={player} me={player.userId === match.me.userId} />)}</div><div className="flex flex-wrap gap-2">{match.room && <Button variant="ghost" onClick={onShare}>複製邀請連結</Button>}{isHost && <Button loading={busy} disabled={match.players.filter((player) => player.role === "player").length < 2} onClick={onStart}>開始 3 秒倒數</Button>}</div><p className="text-center text-xs text-muted">分享連結後，好友可以用房間碼加入；答案與題目不會在開始前交給瀏覽器。</p></div></Card>}
    {countdown && <Card><div className="relative flex min-h-[330px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_center,rgba(167,139,250,.18),transparent_58%)]"><p className="text-xs font-black tracking-[.32em] text-[#7dd3fc]">MATCH FOUND</p><div className="mt-7 flex w-full max-w-xl items-center justify-center gap-3 px-4"><div className="glass-soft w-32 animate-[slide-in-left_.6s_ease-out] rounded-2xl p-4 text-center"><p className="text-[10px] text-muted">YOU</p><p className="mt-2 truncate font-bold">{match.me.userId === match.players[0]?.userId ? match.players[0]?.displayName : "你"}</p></div><span className="text-2xl font-black text-[#f472b6]">VS</span><div className="glass-soft w-32 animate-[slide-in-right_.6s_ease-out] rounded-2xl p-4 text-center"><p className="text-[10px] text-muted">OPPONENT</p><p className="mt-2 truncate font-bold">{match.players.find((player) => player.userId !== match.me.userId)?.displayName ?? "對手"}</p></div></div><p className="pk-countdown mt-8 text-7xl font-black text-[#ffc857]">{countdownValue > 0 ? countdownValue : "GO"}</p><p className="mt-2 text-sm text-muted">準備開始・全站統一題目已鎖定</p></div></Card>}
    {!waiting && !countdown && !completed && <div className="grid gap-4 xl:grid-cols-[1fr_300px]"><Card title={`第 ${Math.min(match.me.answeredCount + 1, match.match.questionCount)} / ${match.match.questionCount} 題`} subtitle={`${match.match.subject}${match.match.unit ? ` · ${match.match.unit}` : ""}`} action={<div className={`tabular-nums text-2xl font-black ${seconds <= 5 ? "text-rose-300" : "text-[#37d3ff]"}`}>{seconds}s</div>}><div className="space-y-4">{currentQuestion ? <><div className="rounded-2xl border border-[#7c5cff]/25 bg-[#7c5cff]/8 p-5 text-lg font-bold leading-8 sm:text-xl">{currentQuestion.stem}</div><div className="grid gap-2">{currentQuestion.options.map((option, index) => { const chosen = selectedOption === option; const resultClass = answerResult && chosen ? (answerResult.isCorrect ? "pk-answer-correct border-emerald-300/70" : "pk-answer-wrong border-rose-300/70") : ""; return <button key={`${currentQuestion.id}-${option}`} type="button" disabled={answering || Boolean(answerResult)} onClick={() => onAnswer(option)} className={`focus-ring flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/[.03] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#37d3ff]/60 hover:bg-[#37d3ff]/8 ${resultClass}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-black text-[#7dd3fc]">{String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1">{option}</span>{chosen && answerResult && <span>{answerResult.isCorrect ? "✓" : "×"}</span>}</button>; })}</div>{answerResult && <div className={`pk-score-pop rounded-2xl border p-3 text-sm ${answerResult.isCorrect ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-rose-300/30 bg-rose-300/10 text-rose-100"}`}>{answerResult.isCorrect ? `答對！+${answerResult.scoreAwarded} 分・伺服器計時 ${Math.round((answerResult.serverResponseMs ?? 0) / 100) / 10}s` : "答錯了，下一題把節奏找回來。"}{answerResult.combo > 1 && <span className="pk-combo-fire ml-2 inline-block font-black text-[#ffc857]">🔥 Combo ×{answerResult.combo}</span>}</div>}</> : <EmptyState icon="✓" title="本場題目已完成" hint="等待其他玩家提交最後答案。" />}</div></Card><div className="space-y-4"><Card title="你的戰績"><div className="grid grid-cols-2 gap-2"><Stat label="分數" value={match.me.score} tone="cyan" /><Stat label="連擊" value={match.me.combo} tone="gold" /><Stat label="答對" value={match.me.correctCount} /><Stat label="排名" value={match.me.rank ?? "—"} /></div></Card><Leaderboard players={leaderboard} me={match.me.userId} /></div></div>}
    {completed && <ResultPanel match={match} leaderboard={leaderboard} wrongCount={wrongCount} resultAction={resultAction} onReview={onReview} onVocabulary={onVocabulary} />}
    {match.match.status === "paused" && <Card><div className="py-8 text-center"><p className="text-lg font-bold">本場 PK 暫停中</p><p className="mt-2 text-sm text-muted">請等待管理員恢復比賽；伺服器會保留目前比分。</p></div></Card>}
  </section>;
}

function PlayerRow({ player, me }: { player: MatchPlayer; me: boolean }) { return <div className="glass-soft flex items-center gap-3 p-3"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{player.displayName}{me ? "（你）" : ""}</span><span className="block font-mono text-[10px] text-muted">{player.novaId}</span></span><span className="text-xs text-muted">{player.connectionState === "connected" ? "在線" : "離線"}</span></div>; }
function Leaderboard({ players, me }: { players: MatchPlayer[]; me: string }) { return <Card title="即時排行榜" subtitle="依伺服器比分排序"><div className="space-y-2">{players.map((player, index) => <div key={player.userId} className={`pk-rank-rise flex items-center gap-2 rounded-xl px-2 py-2 ${player.userId === me ? "bg-[#37d3ff]/10" : "bg-white/[.02]"}`}><span className={`w-6 text-center font-black ${index === 0 ? "text-[#ffc857]" : "text-muted"}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{player.displayName}</span><span className="tabular-nums text-sm font-black text-[#7dd3fc]">{player.score}</span></div>)}</div></Card>; }
function ResultPanel({ match, leaderboard, wrongCount, resultAction, onReview, onVocabulary }: { match: MatchData; leaderboard: MatchPlayer[]; wrongCount: number; resultAction: "review" | "vocabulary" | null; onReview: () => void; onVocabulary: () => void }) { const myRank = leaderboard.findIndex((player) => player.userId === match.me.userId) + 1; return <Card title="🏁 結算完成" subtitle="獎勵已由伺服器依實際參賽資料發放"><div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="最終排名" value={myRank || "—"} tone="gold" /><Stat label="總分" value={match.me.score} tone="cyan" /><Stat label="答對" value={match.me.correctCount} /><Stat label="最高連擊" value={match.me.maxCombo} /></div><div className="rounded-2xl border border-[#ffc857]/25 bg-[#ffc857]/8 p-3 text-sm text-[#fff1c7]">這場 PK 的 Nova／XP 與錯題統計已記錄。答錯 {wrongCount} 題，可以趁記憶還熱的時候加入複習。</div><div className="flex flex-wrap gap-2"><Button loading={resultAction === "review"} disabled={!wrongCount} onClick={onReview}>加入錯題複習</Button><Button variant="ghost" loading={resultAction === "vocabulary"} disabled={!wrongCount} onClick={onVocabulary}>收藏到 PK 單字夾</Button></div><Leaderboard players={leaderboard} me={match.me.userId} /></div></Card>; }
