"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Skeleton, Tabs, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPost, errorMessage, shareContent, useApi } from "@/lib/api";
import { WordsPanel } from "@/features/study/panels-c";

type Friend = { userId: string; novaId: string; displayName: string; level: number | null; xp: number | null };
type Challenge = {
  id: string;
  kind: string;
  title: string;
  creatorName: string;
  quizId: string | null;
  payload?: { track?: "junior" | "senior"; questionCount?: number; direction?: "zh2en" | "en2zh" | "mixed"; difficulty?: "easy" | "normal" | "hard" };
  expiresAt: string;
  joined: boolean;
  participants: Array<{ userId: string; displayName: string; score: number; durationSec: number; finishedAt: string | null }>;
};

type ChallengeWord = { id: string; word: string; meaning: string; partOfSpeech: string; example?: string; exampleZh?: string; level: string };

type QuizRunnerProps = { title: string; words: ChallengeWord[]; direction: "zh2en" | "en2zh" | "mixed"; difficulty: string; onFinish: (score: number, total: number, durationSec: number) => Promise<void> };

function QuizRunner({ title, words, direction, difficulty, onFinish }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const current = words[index];
  const actualDirection = direction === "mixed" ? (index % 2 === 0 ? "zh2en" : "en2zh") : direction;
  const choices = useMemo(() => {
    if (!current) return [];
    const answer = actualDirection === "zh2en" ? current.word : current.meaning;
    const pool = words.filter((word) => word.id !== current.id).map((word) => actualDirection === "zh2en" ? word.word : word.meaning).filter(Boolean);
    return [answer, ...pool].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4);
  }, [actualDirection, current, words]);

  if (!current) return <EmptyState icon="✓" title="題目準備中" />;
  async function choose(answer: string) {
    if (selected || submitting) return;
    setSelected(answer);
    const expected = actualDirection === "zh2en" ? current.word : current.meaning;
    const nextCorrect = correct + (answer === expected ? 1 : 0);
    setCorrect(nextCorrect);
    setTimeout(async () => {
      if (index + 1 < words.length) {
        setIndex((value) => value + 1);
        setSelected(null);
        return;
      }
      setSubmitting(true);
      await onFinish(Math.round((nextCorrect / words.length) * 100), words.length, Math.round((Date.now() - startedAt) / 1000));
      setSubmitting(false);
    }, 550);
  }
  const expected = actualDirection === "zh2en" ? current.word : current.meaning;
  return (
    <Card title={title} subtitle={`${index + 1}/${words.length} 題・難度 ${difficulty === "easy" ? "簡單" : difficulty === "hard" ? "困難" : "普通"}`}>
      <div className="mb-4 flex items-center justify-between text-xs text-muted"><span>{actualDirection === "zh2en" ? "中文 → 英文" : "英文 → 中文"}</span><Badge tone="cyan">目前答對 {correct} 題</Badge></div>
      <div className="glass-soft mb-4 rounded-2xl p-6 text-center"><p className="text-2xl font-bold text-[#e8edff]">{actualDirection === "zh2en" ? current.meaning : current.word}</p><p className="mt-2 text-xs text-muted">{current.partOfSpeech}</p></div>
      <div className="grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice} type="button" disabled={Boolean(selected) || submitting} onClick={() => void choose(choice)} className={`focus-ring rounded-xl border p-3 text-left text-sm transition ${selected ? choice === expected ? "border-emerald-400/60 bg-emerald-400/10" : choice === selected ? "border-rose-400/60 bg-rose-400/10" : "border-[var(--line)] opacity-60" : "border-[var(--line)] bg-white/[0.03] hover:border-[#37d3ff]/60 hover:bg-[#37d3ff]/10"}`}>{choice}</button>)}</div>
      <p className="mt-4 text-center text-[11px] text-muted">選出最適合的答案，答完會自動進入下一題</p>
    </Card>
  );
}

function ChallengeInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "friends");
  const friends = useApi<{ friends: Friend[]; incoming: Array<{ id: string; novaId: string; displayName: string }>; outgoing: Array<{ id: string; novaId: string; displayName: string }>; blocked: Array<{ id: string; blockedId: string; novaId: string; displayName: string }> }>("/friends");
  const challenges = useApi<{ challenges: Challenge[] }>("/challenges");
  const rooms = useApi<{ rooms: Array<{ id: string; name: string; kind: string; joinCode: string; goalMinutes: number; totalToday: number; members: Array<{ userId: string; displayName: string; minutesToday: number }> }> }>("/rooms");
  const activities = useApi<{ live: Array<{ id: string; title: string; cover: string; description: string; goalValue: number; progress: number; rewardNova: number; rewardXp: number; endsAt: string }>; upcoming: Array<{ id: string; title: string; startsAt: string }> }>("/activities");
  const board = useApi<{ weekly: Array<{ userId: string; displayName: string; novaId: string; minutes: number; level: number | null }>; xp: Array<{ userId: string; displayName: string; xp: number; level: number }>; me: string }>("/leaderboard?scope=global");
  const quizzes = useApi<{ quizzes: Array<{ id: string; title: string }> }>("/quizzes");
  const weekly = useApi<{ weeks: Array<{ id: string; weekCode: string; title: string; open: boolean; proOnly: boolean }> }>("/weekly");
  const vocabulary = useApi<{ tracks: Array<{ id: "junior" | "senior"; label: string; description: string; count: number }> }>("/words/catalog");
  const [vocabTrack, setVocabTrack] = useState<"junior" | "senior">("junior");
  const [selfForm, setSelfForm] = useState({ track: "junior" as "junior" | "senior", questionCount: 10, direction: "mixed" as "zh2en" | "en2zh" | "mixed", difficulty: "normal" as "easy" | "normal" | "hard", shuffle: true });
  const [quizSession, setQuizSession] = useState<{ title: string; challengeId?: string; words: ChallengeWord[]; direction: "zh2en" | "en2zh" | "mixed"; difficulty: string } | null>(null);

  const [novaId, setNovaId] = useState(params.get("add") ?? "");
  const [qr, setQr] = useState<{ svg: string; link: string; novaId: string } | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [cForm, setCForm] = useState({ kind: "word", title: "", quizId: "", durationHours: 48, track: "junior" as "junior" | "senior", questionCount: 10, direction: "mixed" as "zh2en" | "en2zh" | "mixed", difficulty: "normal" as "easy" | "normal" | "hard" });
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", kind: "room", goalMinutes: 120 });
  const [joinCode, setJoinCode] = useState("");

  async function startSelfChallenge() {
    try {
      const result = await apiGet<{ words: ChallengeWord[] }>(`/words/all?track=${selfForm.track}&limit=${selfForm.questionCount}`);
      const words = selfForm.shuffle ? [...result.words].sort(() => Math.random() - 0.5) : result.words;
      if (!words.length) throw new Error("目前沒有可用的題目");
      setQuizSession({ title: `自我挑戰・${selfForm.track === "junior" ? "國中" : "高中"}單字`, words: words.slice(0, selfForm.questionCount), direction: selfForm.direction, difficulty: selfForm.difficulty });
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  if (quizSession) return <div className="space-y-4"><QuizRunner {...quizSession} onFinish={async (score, total, durationSec) => { if (quizSession.challengeId) await apiPost(`/challenges/${quizSession.challengeId}/submit`, { score, durationSec }); else await apiPost("/words/session-complete", { correct: Math.round((score / 100) * total), total, seconds: durationSec }); toast.push("success", `挑戰完成！得分 ${score} 分`); setQuizSession(null); await challenges.reload(); }} /><Button variant="ghost" onClick={() => setQuizSession(null)}>離開挑戰</Button></div>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">好友・挑戰・活動</h1>
        <p className="text-xs text-muted sm:text-sm">用 NOVA ID 加好友，一起挑戰、共讀與衝排行榜。</p>
      </header>

      <Tabs
        tabs={[
          { key: "friends", label: "好友", icon: "🤝" },
          { key: "challenge", label: "挑戰", icon: "⚔️" },
          { key: "vocab", label: "分級單字", icon: "🔤" },
          { key: "room", label: "讀書房", icon: "🏫" },
          { key: "activity", label: "活動", icon: "🎉" },
          { key: "board", label: "排行榜", icon: "🏆" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "friends" && (
        <div className="space-y-4">
          <Card title="🔎 用 NOVA ID 加好友">
            <div className="flex flex-wrap gap-2">
              <Input value={novaId} onChange={(e) => setNovaId(e.target.value.toUpperCase())} placeholder="NV-XXXX-XXXX" className="min-w-[180px] flex-1" />
              <Button
                onClick={async () => {
                  try {
                    const res = await apiPost<{ status: string }>("/friends/request", { novaId });
                    toast.push("success", res.status === "accepted" ? "已成為好友！" : "已送出好友邀請");
                    setNovaId("");
                    await friends.reload();
                  } catch (err) {
                    toast.push("error", errorMessage(err));
                  }
                }}
              >
                送出邀請
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const res = await apiGet<{ svg: string; link: string; novaId: string }>("/account/nova-id-qr");
                  setQr(res);
                }}
              >
                我的 QR Code
              </Button>
            </div>
          </Card>

          {friends.data?.incoming.length ? (
            <Card title="📥 收到的邀請">
              <div className="space-y-2">
                {friends.data.incoming.map((r) => (
                  <div key={r.id} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {r.displayName} <span className="text-xs text-muted">{r.novaId}</span>
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await apiPost(`/friends/requests/${r.id}/respond`, { accept: true });
                          toast.push("success", "已成為好友");
                          await friends.reload();
                        }}
                      >
                        接受
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await apiPost(`/friends/requests/${r.id}/respond`, { accept: false });
                          await friends.reload();
                        }}
                      >
                        拒絕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card title="👥 我的好友">
            {friends.loading && <Skeleton lines={3} />}
            {friends.error && <ErrorState message={friends.error} onRetry={friends.reload} />}
            {!friends.loading && !friends.data?.friends.length && <EmptyState icon="🤝" title="還沒有好友" hint="把你的 NOVA ID 分享給同學吧！" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {friends.data?.friends.map((f) => (
                <div key={f.userId} className="glass-soft flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.displayName}</p>
                    <p className="text-[11px] text-muted">
                      {f.novaId}・Lv.{f.level ?? 1}・{f.xp ?? 0} XP
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await apiPost("/friends/block", { userId: f.userId, block: true });
                        toast.push("info", "已封鎖");
                        await friends.reload();
                      }}
                    >
                      封鎖
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await apiDelete(`/friends/${f.userId}`);
                        await friends.reload();
                      }}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {friends.data?.blocked.length ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-muted">已封鎖</p>
                {friends.data.blocked.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span>
                      {b.displayName}（{b.novaId}）
                    </span>
                    <button
                      className="underline"
                      onClick={async () => {
                        await apiPost("/friends/block", { userId: b.blockedId, block: false });
                        await friends.reload();
                      }}
                    >
                      解除封鎖
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {tab === "challenge" && (
        <div className="space-y-4">
          <Card title="🎯 自我挑戰" subtitle="自訂國中／高中單字測驗，完成後立即看到分數與獎勵。" action={<Badge tone="cyan">單人練習</Badge>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="詞庫">
                <Select value={selfForm.track} onChange={(e) => setSelfForm({ ...selfForm, track: e.target.value as "junior" | "senior" })}><option value="junior">國中 2000 單</option><option value="senior">高中 7000 單</option></Select>
              </Field>
              <Field label="題數"><Select value={String(selfForm.questionCount)} onChange={(e) => setSelfForm({ ...selfForm, questionCount: Number(e.target.value) })}><option value="5">5 題</option><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option><option value="100">100 題</option></Select></Field>
              <Field label="難度"><Select value={selfForm.difficulty} onChange={(e) => setSelfForm({ ...selfForm, difficulty: e.target.value as "easy" | "normal" | "hard" })}><option value="easy">簡單</option><option value="normal">普通</option><option value="hard">困難</option></Select></Field>
              <Field label="題目方向"><Select value={selfForm.direction} onChange={(e) => setSelfForm({ ...selfForm, direction: e.target.value as "zh2en" | "en2zh" | "mixed" })}><option value="mixed">中英混合</option><option value="zh2en">中文 → 英文</option><option value="en2zh">英文 → 中文</option></Select></Field>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted"><input type="checkbox" checked={selfForm.shuffle} onChange={(e) => setSelfForm({ ...selfForm, shuffle: e.target.checked })} />每次開始時打亂題目</label>
            <Button className="mt-4" onClick={() => void startSelfChallenge()}>開始自我挑戰</Button>
          </Card>
          <Card title="⚔️ 好友挑戰" subtitle="邀請好友後，雙方完成同一組題目即可比較分數。" action={<div className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => void challenges.reload()}>更新比分</Button><Button size="sm" onClick={() => setChallengeOpen(true)}>＋ 發起挑戰</Button></div>}>
          {challenges.loading && <Skeleton lines={3} />}
          {!challenges.loading && !challenges.data?.challenges.length && <EmptyState icon="⚔️" title="還沒有進行中的挑戰" hint="發起單字或測驗挑戰，和好友比分數！" />}
          <div className="space-y-2">
            {challenges.data?.challenges.map((c) => (
              <div key={c.id} className="glass-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[11px] text-muted">
                      {c.kind === "word" ? "單字挑戰" : "測驗挑戰"}・由 {c.creatorName} 發起・截止 {new Date(c.expiresAt).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const result = await apiGet<{ title: string; words: ChallengeWord[]; settings: { direction: "zh2en" | "en2zh" | "mixed"; difficulty: string } }>(`/challenges/${c.id}/words`);
                        if (!result.words.length) throw new Error("目前沒有可用的挑戰題目");
                        setQuizSession({ title: result.title, challengeId: c.id, words: result.words, direction: result.settings.direction, difficulty: result.settings.difficulty });
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      }
                    }}
                  >
                    開始作答
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {c.participants.map((p, i) => (
                    <div key={p.userId} className="flex items-center justify-between text-xs">
                      <span>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {p.displayName}
                      </span>
                      <span className="tabular-nums text-muted">{p.finishedAt ? `${p.score} 分` : "尚未完成"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </Card>
        </div>
      )}

      {tab === "vocab" && (
        <div className="space-y-4">
          <Card title="🔤 分級單字挑戰" subtitle="每天固定 10 個單字，依今天的日期輪替題目；重新整理不會換題。">
            <div className="grid gap-3 sm:grid-cols-2">
              {(vocabulary.data?.tracks ?? [
                { id: "junior" as const, label: "國中 2000 單挑戰", description: "依國中英文 2000 字建立基礎字彙力", count: 2000 },
                { id: "senior" as const, label: "高中 7000 單挑戰", description: "依高中英文參考詞彙表準備進階字彙", count: 7000 },
              ]).map((trackOption) => (
                <button
                  key={trackOption.id}
                  type="button"
                  onClick={() => setVocabTrack(trackOption.id)}
                  className={`focus-ring rounded-2xl border p-4 text-left transition ${vocabTrack === trackOption.id ? "border-[#37d3ff]/70 bg-[#37d3ff]/10 shadow-[0_0_24px_rgba(55,211,255,0.12)]" : "border-[var(--line)] bg-white/[0.02] hover:bg-white/5"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{trackOption.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{trackOption.description}</p>
                    </div>
                    <Badge tone={vocabTrack === trackOption.id ? "cyan" : "muted"}>{trackOption.count.toLocaleString()} 字</Badge>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">題庫來源：使用管理者提供的國中英文 2000 字與高中英文參考詞彙表 PDF。</p>
          </Card>
          <WordsPanel key={vocabTrack} track={vocabTrack} />
        </div>
      )}

      {tab === "room" && (
        <div className="space-y-4">
          <Card title="🏫 讀書房" action={<Button size="sm" onClick={() => setRoomOpen(true)}>＋ 建立</Button>}>
            <div className="mb-3 flex gap-2">
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="輸入邀請碼加入" />
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await apiPost("/rooms/join", { code: joinCode });
                    toast.push("success", "已加入讀書房");
                    setJoinCode("");
                    await rooms.reload();
                  } catch (err) {
                    toast.push("error", errorMessage(err));
                  }
                }}
              >
                加入
              </Button>
            </div>
            {rooms.loading && <Skeleton lines={3} />}
            {!rooms.loading && !rooms.data?.rooms.length && <EmptyState icon="🏫" title="還沒有讀書房" hint="建立私人／好友／班級讀書房，一起計時讀書。" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {rooms.data?.rooms.map((r) => (
                <div key={r.id} className="glass-soft p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{r.name}</p>
                    <Badge tone="cyan">{r.kind === "class" ? "班級" : "讀書房"}</Badge>
                  </div>
                  <p className="text-[11px] text-muted">邀請碼：{r.joinCode}</p>
                  <div className="mt-1.5">
                    <Progress value={r.totalToday} max={r.goalMinutes} tone="cyan" />
                    <p className="mt-1 text-[11px] text-muted">
                      今日共同專注 {r.totalToday}/{r.goalMinutes} 分鐘
                    </p>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs">
                    {r.members.map((m) => (
                      <div key={m.userId} className="flex justify-between">
                        <span>{m.displayName}</span>
                        <span className="text-muted">{m.minutesToday} 分</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={async () => {
                      await apiDelete(`/rooms/${r.id}/leave`);
                      await rooms.reload();
                    }}
                  >
                    離開
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "activity" && (
        <Card title="🎉 活動">
          {activities.loading && <Skeleton lines={3} />}
          {!activities.loading && !activities.data?.live.length && <EmptyState icon="🎈" title="目前沒有進行中的活動" />}
          <div className="space-y-2">
            {activities.data?.live.map((a) => (
              <div key={a.id} className="glass-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {a.cover} {a.title}
                  </p>
                  <Badge tone="gold">
                    +{a.rewardNova} Nova / +{a.rewardXp} XP
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                <div className="mt-1.5">
                  <Progress value={a.progress} max={a.goalValue} tone="gold" />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {a.progress}/{a.goalValue}・結束 {new Date(a.endsAt).toLocaleString("zh-TW")}
                </p>
              </div>
            ))}
          </div>
          {activities.data?.upcoming.length ? (
            <div className="mt-3 space-y-1 text-xs text-muted">
              <p>即將開始</p>
              {activities.data.upcoming.map((u) => (
                <p key={u.id}>
                  · {u.title}（{new Date(u.startsAt).toLocaleDateString("zh-TW")}）
                </p>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      {tab === "board" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="🏆 本週學習時間排行">
            {board.loading && <Skeleton lines={4} />}
            <div className="space-y-1.5">
              {board.data?.weekly.map((r, i) => (
                <div key={r.userId} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${r.userId === board.data?.me ? "bg-[#37d3ff]/10" : ""}`}>
                  <span>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {r.displayName}
                  </span>
                  <span className="tabular-nums text-muted">{r.minutes} 分</span>
                </div>
              ))}
              {!board.data?.weekly.length && <EmptyState icon="🏁" title="本週還沒有紀錄" />}
            </div>
          </Card>
          <Card title="✨ XP 排行">
            <div className="space-y-1.5">
              {board.data?.xp.map((r, i) => (
                <div key={r.userId} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${r.userId === board.data?.me ? "bg-[#7c5cff]/10" : ""}`}>
                  <span>
                    {i + 1}. {r.displayName}
                  </span>
                  <span className="tabular-nums text-muted">
                    Lv.{r.level}・{r.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={Boolean(qr)} onClose={() => setQr(null)} title="我的 NOVA ID QR Code">
        {qr && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-48 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="text-lg font-bold tracking-widest">{qr.novaId}</p>
            <Button
              onClick={async () => {
                const res = await shareContent({ title: "加我 StudyNova 好友", text: `我的 NOVA ID 是 ${qr.novaId}`, url: qr.link });
                toast.push("success", res === "copied" ? "已複製邀請連結" : "已開啟分享");
              }}
            >
              分享邀請連結
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={challengeOpen} onClose={() => setChallengeOpen(false)} title="發起挑戰">
        <div className="space-y-3">
          <Field label="挑戰類型">
            <Select value={cForm.kind} onChange={(e) => setCForm({ ...cForm, kind: e.target.value })}>
              <option value="word">單字挑戰</option>
              <option value="quiz">測驗挑戰</option>
              <option value="weekly">每週小考競賽</option>
            </Select>
          </Field>
          <Field label="標題" required>
            <Input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} placeholder="英文單字 1v1" />
          </Field>
          {cForm.kind === "weekly" && (
            <Field label="選擇每週小考">
              <Select value={cForm.quizId} onChange={(e) => setCForm({ ...cForm, quizId: e.target.value })}>
                <option value="">請選擇…</option>
                {weekly.data?.weeks.filter((w) => w.open).map((w) => (
                  <option key={w.id} value={w.id}>{w.weekCode}｜{w.title}{w.proOnly ? "（PRO）" : ""}</option>
                ))}
              </Select>
            </Field>
          )}
          {cForm.kind === "word" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="詞庫"><Select value={cForm.track} onChange={(e) => setCForm({ ...cForm, track: e.target.value as "junior" | "senior" })}><option value="junior">國中 2000 單</option><option value="senior">高中 7000 單</option></Select></Field>
              <Field label="題數"><Select value={String(cForm.questionCount)} onChange={(e) => setCForm({ ...cForm, questionCount: Number(e.target.value) })}><option value="5">5 題</option><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option></Select></Field>
              <Field label="難度"><Select value={cForm.difficulty} onChange={(e) => setCForm({ ...cForm, difficulty: e.target.value as "easy" | "normal" | "hard" })}><option value="easy">簡單</option><option value="normal">普通</option><option value="hard">困難</option></Select></Field>
              <Field label="題目方向"><Select value={cForm.direction} onChange={(e) => setCForm({ ...cForm, direction: e.target.value as "zh2en" | "en2zh" | "mixed" })}><option value="mixed">中英混合</option><option value="zh2en">中文 → 英文</option><option value="en2zh">英文 → 中文</option></Select></Field>
            </div>
          )}
          {cForm.kind === "quiz" && (
            <Field label="選擇測驗">
              <Select value={cForm.quizId} onChange={(e) => setCForm({ ...cForm, quizId: e.target.value })}>
                <option value="">請選擇…</option>
                {quizzes.data?.quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="持續時間（小時）">
            <Input type="number" min={1} max={168} value={cForm.durationHours} onChange={(e) => setCForm({ ...cForm, durationHours: Number(e.target.value) })} />
          </Field>
          <Button
            full
            onClick={async () => {
              try {
                await apiPost("/challenges", {
                  kind: cForm.kind,
                  title: cForm.title,
                  quizId: cForm.kind === "quiz" ? cForm.quizId || null : null,
                  weekId: cForm.kind === "weekly" ? cForm.quizId || null : null,
                  durationHours: cForm.durationHours,
                  track: cForm.track,
                  questionCount: cForm.questionCount,
                  direction: cForm.direction,
                  difficulty: cForm.difficulty,
                  inviteIds: friends.data?.friends.map((f) => f.userId) ?? [],
                });
                toast.push("success", "挑戰已建立，已通知好友");
                setChallengeOpen(false);
                await challenges.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立挑戰
          </Button>
        </div>
      </Modal>

      <Modal open={roomOpen} onClose={() => setRoomOpen(false)} title="建立讀書房">
        <div className="space-y-3">
          <Field label="名稱" required>
            <Input value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
          </Field>
          <Field label="類型">
            <Select value={roomForm.kind} onChange={(e) => setRoomForm({ ...roomForm, kind: e.target.value })}>
              <option value="room">好友讀書房</option>
              <option value="class">班級</option>
            </Select>
          </Field>
          <Field label="每日共同目標（分鐘）">
            <Input type="number" min={30} max={1200} value={roomForm.goalMinutes} onChange={(e) => setRoomForm({ ...roomForm, goalMinutes: Number(e.target.value) })} />
          </Field>
          <Button
            full
            onClick={async () => {
              try {
                await apiPost("/rooms", roomForm);
                toast.push("success", "讀書房已建立");
                setRoomOpen(false);
                await rooms.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <ChallengeInner />
    </Suspense>
  );
}
