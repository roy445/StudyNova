"use client";

import { Suspense, useState } from "react";
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
  expiresAt: string;
  joined: boolean;
  participants: Array<{ userId: string; displayName: string; score: number; durationSec: number; finishedAt: string | null }>;
};

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

  const [novaId, setNovaId] = useState(params.get("add") ?? "");
  const [qr, setQr] = useState<{ svg: string; link: string; novaId: string } | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [cForm, setCForm] = useState({ kind: "word", title: "", quizId: "", durationHours: 48 });
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", kind: "room", goalMinutes: 120 });
  const [joinCode, setJoinCode] = useState("");

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
        <Card title="⚔️ 好友挑戰" action={<Button size="sm" onClick={() => setChallengeOpen(true)}>＋ 發起挑戰</Button>}>
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
                      const score = Math.round(Number(prompt("輸入你這次挑戰的分數（0-100）") ?? "0"));
                      if (!Number.isFinite(score)) return;
                      try {
                        await apiPost(`/challenges/${c.id}/submit`, { score: Math.max(0, Math.min(100, score)), durationSec: 60 });
                        toast.push("success", "成績已登錄！");
                        await challenges.reload();
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      }
                    }}
                  >
                    登錄成績
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
