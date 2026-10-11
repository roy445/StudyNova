"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { apiGet, apiPost, useApi } from "@/lib/api";

type Subject = { id: string; subject: string; chapters: string[]; units: string[]; questionTypes: string[]; difficulty: string };
type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openMode: string; status: string; effectiveStatus: string; openAt: string | null; closeAt: string | null; timezone: string; subjects: Subject[] };
type ActivityResponse = { activity: Activity; subjects: Subject[]; access: { canEnter: boolean; reason: string } };
type QuizQuestion = { id: string; type: string; stem: string; options: string[]; subject: string; difficulty: string };
type QuizData = { quiz: { id: string; title: string; questionIds: string[] }; questions: QuizQuestion[]; attempt: { id: string; status: string } | null; saved: Array<{ questionId: string; response: string[] }> };
type Review = { questionId: string; stem: string; options: string[]; answer: string[]; explanation: string; response: string[]; isCorrect: boolean };
type LeaderboardData = { ranking: Array<{ rank: number; userId: string; displayName: string | null; novaId: string; attempts: number; bestScore: number; bestCorrect: number; bestTotal: number; isMe: boolean }>; me: { rank: number; bestScore: number; bestCorrect: number; bestTotal: number; attempts: number } | null };
type FriendsData = { friends: Array<{ userId: string }> };

const statusText: Record<string, string> = { open: "開放中", scheduled: "尚未開放", closed: "已關閉", archived: "已封存", pending_review: "題目審核中", draft: "準備中" };
const studentTitle = (value: string) => value.replace(/^\s*\d{3,4}學年度\s*/, "");

export default function ExamPrepActivityPage() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const api = useApi<ActivityResponse>(id ? `/exam-prep/${id}` : null);
  const leaderboard = useApi<LeaderboardData>(id ? `/exam-prep/${id}/leaderboard` : null);
  const friends = useApi<FriendsData>("/friends");
  const data = api.data;
  const activity = data?.activity;
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [review, setReview] = useState<Review[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  async function createBattleInvite() {
    if (!id) return;
    setBusy(true);
    try {
      const created = await apiGet<{ quizId: string }>(`/exam-prep/${id}/quiz`, { fresh: true });
      const result = await apiPost<{ challenge: { id: string } }>("/challenges", { kind: "quiz", title: `限時段考 PK｜${studentTitle(activity?.name ?? "段考衝刺")}`, quizId: created.quizId, durationHours: 1, inviteIds: friends.data?.friends.map((friend) => friend.userId) ?? [], competitionMode: "entertainment" });
      const url = `${window.location.origin}/challenge?challengeId=${result.challenge.id}`;
      await navigator.clipboard.writeText(url);
      toast.push("success", "限時 PK 已建立，好友已收到邀請；連結已複製");
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "建立 PK 失敗"); } finally { setBusy(false); }
  }

  async function startQuiz() {
    if (!id) return;
    setBusy(true);
    try {
      const created = await apiGet<{ quizId: string }>(`/exam-prep/${id}/quiz`, { fresh: true });
      await apiPost(`/quizzes/${created.quizId}/start`, {});
      const loaded = await apiGet<QuizData>(`/quizzes/${created.quizId}`, { fresh: true });
      const saved: Record<string, string[]> = {};
      for (const item of loaded.saved) saved[item.questionId] = item.response;
      setResponses(saved); setQuiz(loaded); setStarted(true); setReview(null);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法開始測驗"); } finally { setBusy(false); }
  }

  async function submitQuiz() {
    if (!quiz?.attempt) return;
    setBusy(true);
    try {
      for (const question of quiz.questions) await apiPost(`/attempts/${quiz.attempt.id}/save`, { questionId: question.id, response: responses[question.id] ?? [] });
      const result = await apiPost<{ review: Review[]; score: number; correct: number; total: number }>(`/attempts/${quiz.attempt.id}/submit`, { durationSec: 0 });
      setReview(result.review); toast.push("success", `交卷完成：${result.score} 分，答對 ${result.correct}/${result.total} 題`);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "交卷失敗"); } finally { setBusy(false); }
  }

  function updateResponse(questionId: string, response: string[]) {
    setResponses((current) => ({ ...current, [questionId]: response }));
    if (!quiz?.attempt) return;
    setSavingQuestion(questionId);
    void apiPost(`/attempts/${quiz.attempt.id}/save`, { questionId, response }).then(() => setSavingQuestion((current) => current === questionId ? null : current)).catch(() => toast.push("error", "答案暫存失敗，請稍後再試"));
  }

  return <div className="space-y-6 pb-24"><Link href="/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺中心</Link>{api.loading && <Card><Skeleton lines={7} /></Card>}{api.error && <ErrorState message={api.error} onRetry={api.reload} />}{data && activity && <>
    <header className="rounded-[2rem] border border-cyan-300/20 bg-white/[0.03] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP ACTIVITY</p><h1 className="mt-3 text-3xl font-black">{studentTitle(activity.name)}</h1><p className="mt-3 text-sm leading-7 text-muted">{activity.description || "段考衝刺正式題庫"}</p><div className="mt-4 flex flex-wrap gap-3"><Button loading={busy} className="!bg-gradient-to-r !from-cyan-400 !to-violet-500 !text-slate-950 !shadow-[0_0_24px_rgba(55,211,255,.35)]" onClick={() => void createBattleInvite()}>⚔ 跟同學一起 PK</Button><Button variant="outline" onClick={async () => { const url = window.location.href; try { if (navigator.share) await navigator.share({ title: `跟同學一起 PK｜${studentTitle(activity.name)}`, text: "登入 StudyNova 後一起挑戰段考衝刺，完成後查看排行榜！", url }); else { await navigator.clipboard.writeText(url); toast.push("success", "PK 邀請連結已複製，請傳給同學（需登入 StudyNova）"); } } catch { /* 使用者取消分享 */ } }}>分享活動</Button><span className="self-center text-xs text-muted">需登入帳號・限時 1 小時・完成後看排行榜</span></div></div><Badge tone={activity.effectiveStatus === "open" ? "green" : activity.effectiveStatus === "closed" ? "rose" : "gold"}>{statusText[activity.effectiveStatus] ?? activity.effectiveStatus}</Badge></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">考試名稱</p><p className="mt-1 font-semibold">{activity.examName}</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">適用對象</p><p className="mt-1 font-semibold">{activity.educationLevel === "senior" ? "高中" : "國中"}・{activity.grade} 年級</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">時間</p><p className="mt-1 font-semibold">{activity.openAt ? formatTaipeiDateTime(activity.openAt) : "手動開放"}{activity.closeAt ? ` ～ ${formatTaipeiDateTime(activity.closeAt)}` : ""}</p></div></div></header>
    <Card title="考試科目與範圍" subtitle="正式題目已依科目整理，圖片題與無法判定題目依規則跳過。"><div className="grid gap-3 sm:grid-cols-2">{data.subjects.map((subject) => <div key={subject.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><h2 className="font-bold">{subject.subject}</h2><p className="mt-3 text-xs text-muted">{subject.chapters.length ? subject.chapters.join("、") : "依本次段考範圍出題"}</p></div>)}</div><Button className="mt-5" loading={busy} disabled={!data.access.canEnter || started} onClick={() => void startQuiz()}>{started ? "測驗進行中" : "開始段考衝刺測驗"}</Button></Card>
    <Card title="成績排行榜" subtitle="依每位學生的最高成績排名；同分時以答對題數及先完成者優先。"><div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-sm">{leaderboard.data?.me ? `你的最佳成績：第 ${leaderboard.data.me.rank} 名・${leaderboard.data.me.bestScore} 分・答對 ${leaderboard.data.me.bestCorrect}/${leaderboard.data.me.bestTotal} 題・作答 ${leaderboard.data.me.attempts} 次` : "完成一次測驗後，你的成績會出現在排行榜。"}</div>{leaderboard.loading && <Skeleton lines={3} />}{leaderboard.data?.ranking.length ? <div className="space-y-2">{leaderboard.data.ranking.slice(0, 20).map((row) => <div key={row.userId ?? row.rank} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${row.isMe ? "border-cyan-300/40 bg-cyan-300/[0.08]" : "border-[var(--line)]"}`}><span><b className="mr-2 text-cyan-200">#{row.rank}</b>{row.isMe ? "你" : row.displayName || row.novaId}</span><span className="text-muted">{row.bestScore} 分・{row.bestCorrect}/{row.bestTotal} 題</span></div>)}</div> : !leaderboard.loading && <p className="text-sm text-muted">目前還沒有完成的測驗成績。</p>}</Card>
    {started && quiz && !review && <Card title={`作答中：${studentTitle(quiz.quiz.title)}`} subtitle={`共 ${quiz.questions.length} 題；答案會自動保存，離開後可從同一活動繼續。`}><div className="space-y-5">{quiz.questions.map((question, index) => <div key={question.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted">第 {index + 1} 題・{question.subject}</p>{savingQuestion === question.id && <span className="text-xs text-cyan-200">正在保存…</span>}</div><p className="mt-2 whitespace-pre-wrap font-semibold leading-7">{question.stem}</p>{question.options.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} type="button" onClick={() => updateResponse(question.id, [option])} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${responses[question.id]?.includes(option) ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-[var(--line)] hover:bg-white/10"}`}>{option}</button>)}</div> : <input className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white/5 px-3 py-2 text-sm" value={responses[question.id]?.[0] ?? ""} onChange={(event) => updateResponse(question.id, [event.target.value])} placeholder="請輸入答案" />}</div>)}<Button loading={busy} onClick={() => void submitQuiz()}>交卷並查看詳解</Button></div></Card>}
    {review && <Card title="測驗結果與詳解" subtitle="每題都會顯示你的答案、正確答案與解析。"><div className="space-y-4">{review.map((item, index) => <div key={item.questionId} className={`rounded-2xl border p-4 ${item.isCorrect ? "border-emerald-300/30 bg-emerald-300/[0.06]" : "border-rose-300/30 bg-rose-300/[0.06]"}`}><p className="text-xs text-muted">第 {index + 1} 題・{item.isCorrect ? "答對" : "答錯"}</p><p className="mt-2 font-semibold leading-7">{item.stem}</p><p className="mt-2 text-sm">你的答案：{item.response.join("、") || "未作答"}</p><p className="mt-1 text-sm text-cyan-100">正確答案：{item.answer.join("、")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">詳解：{item.explanation || "本題沒有補充詳解。"}</p></div>)}</div></Card>}
    {!data.access.canEnter && <Card title="目前無法作答"><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-muted">{data.access.reason}</div></Card>}
  </>}</div>;
}
