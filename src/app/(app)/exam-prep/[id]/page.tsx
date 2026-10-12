"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { apiGet, apiPost, useApi } from "@/lib/api";

type Subject = { id: string; subject: string; chapters: string[]; units: string[]; questionTypes: string[]; difficulty: string };
type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openMode: string; status: string; effectiveStatus: string; openAt: string | null; closeAt: string | null; timezone: string; subjects: Subject[] };
type ActivityResponse = { activity: Activity; subjects: Subject[]; resume: { quizId: string; attemptId: string | null; status: string | null } | null; access: { canEnter: boolean; reason: string } };
type QuizQuestion = { id: string; type: string; stem: string; options: string[]; subject: string; difficulty: string };
type QuizData = { quiz: { id: string; title: string; questionIds: string[] }; questions: QuizQuestion[]; attempt: { id: string; status: string } | null; saved: Array<{ questionId: string; response: string[]; isCorrect?: boolean }>; reviewAvailable?: boolean; review?: Review[] | null };
type Review = { questionId: string; stem: string; options: string[]; answer: string[]; explanation: string; response: string[]; isCorrect: boolean };
type LeaderboardData = { ranking: Array<{ rank: number; userId: string; displayName: string | null; novaId: string; attempts: number; bestScore: number; bestCorrect: number; bestTotal: number; isMe: boolean }>; me: { rank: number; bestScore: number; bestCorrect: number; bestTotal: number; attempts: number } | null };
type FriendsData = { friends: Array<{ userId: string }> };
type StudyMode = "flow" | "mastery";

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
  const resumeRequested = useRef(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("mastery");
  const [questionReviews, setQuestionReviews] = useState<Record<string, Review>>({});

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

  async function loadQuiz(quizId: string) {
    try {
      await apiPost(`/quizzes/${quizId}/start`, {});
      const loaded = await apiGet<QuizData>(`/quizzes/${quizId}`, { fresh: true });
      const saved: Record<string, string[]> = {};
      for (const item of loaded.saved) saved[item.questionId] = item.response;
      setResponses(saved); setQuiz(loaded); setStarted(loaded.attempt?.status !== "submitted"); setReview(loaded.reviewAvailable ? (loaded.review ?? []) : null); setQuestionReviews({});
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法載入測驗紀錄"); } finally { setBusy(false); }
  }

  async function startQuiz() {
    if (!id) return;
    setBusy(true);
    try {
      const created = await apiGet<{ quizId: string }>(`/exam-prep/${id}/quiz`, { fresh: true });
      await loadQuiz(created.quizId);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法開始測驗"); setBusy(false); }
  }

  useEffect(() => {
    if (!data || resumeRequested.current) return;
    resumeRequested.current = true;
    if (data.resume?.quizId && data.resume.status) {
      // loadQuiz updates the UI after its asynchronous server response.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadQuiz(data.resume.quizId);
    }
    // loadQuiz intentionally remains local to this page; this effect only runs once per activity load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function submitQuiz() {
    if (!quiz?.attempt) return;
    setBusy(true);
    try {
      for (const question of quiz.questions) await apiPost(`/attempts/${quiz.attempt.id}/save`, { questionId: question.id, response: responses[question.id] ?? [] });
      const result = await apiPost<{ review: Review[]; score: number; correct: number; total: number }>(`/attempts/${quiz.attempt.id}/submit`, { durationSec: 0 });
      setReview(result.review); toast.push("success", `交卷完成：${result.score} 分，答對 ${result.correct}/${result.total} 題`);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "交卷失敗"); } finally { setBusy(false); }
  }

  async function checkQuestion(question: QuizQuestion) {
    if (!quiz?.attempt) return;
    const response = responses[question.id] ?? [];
    if (!response.length || !response[0].trim()) { toast.push("info", "請先選擇或輸入答案"); return; }
    setSavingQuestion(question.id);
    try {
      const result = await apiPost<{ isCorrect: boolean; answer: string[]; explanation: string }>(`/attempts/${quiz.attempt.id}/check`, { questionId: question.id, response });
      setQuestionReviews((current) => ({ ...current, [question.id]: { questionId: question.id, stem: question.stem, options: question.options, answer: result.answer, explanation: result.explanation, response, isCorrect: result.isCorrect } }));
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法檢查答案"); } finally { setSavingQuestion(null); }
  }

  function resetQuestion(questionId: string) {
    setQuestionReviews((current) => { const next = { ...current }; delete next[questionId]; return next; });
  }

  function updateResponse(questionId: string, response: string[]) {
    setResponses((current) => ({ ...current, [questionId]: response }));
    if (!quiz?.attempt) return;
    setSavingQuestion(questionId);
    void apiPost(`/attempts/${quiz.attempt.id}/save`, { questionId, response }).then(() => setSavingQuestion((current) => current === questionId ? null : current)).catch(() => toast.push("error", "答案暫存失敗，請稍後再試"));
  }

  return <div className="space-y-6 pb-24"><Link href="/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺中心</Link>{api.loading && <Card><Skeleton lines={7} /></Card>}{api.error && <ErrorState message={api.error} onRetry={api.reload} />}{data && activity && <>
    <header className="rounded-[2rem] border border-cyan-300/20 bg-white/[0.03] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP ACTIVITY</p><h1 className="mt-3 text-3xl font-black">{studentTitle(activity.name)}</h1><p className="mt-3 text-sm leading-7 text-muted">{activity.description || "段考衝刺正式題庫"}</p><div className="mt-4 flex flex-wrap gap-3"><Button loading={busy} className="!bg-gradient-to-r !from-cyan-400 !to-violet-500 !text-slate-950 !shadow-[0_0_24px_rgba(55,211,255,.35)]" onClick={() => void createBattleInvite()}>⚔ 跟同學一起 PK</Button><Button variant="outline" onClick={async () => { const url = window.location.href; try { if (navigator.share) await navigator.share({ title: `跟同學一起 PK｜${studentTitle(activity.name)}`, text: "登入 StudyNova 後一起挑戰段考衝刺，完成後查看排行榜！", url }); else { await navigator.clipboard.writeText(url); toast.push("success", "PK 邀請連結已複製，請傳給同學（需登入 StudyNova）"); } } catch { /* 使用者取消分享 */ } }}>分享活動</Button><span className="self-center text-xs text-muted">需登入帳號・限時 1 小時・完成後看排行榜</span></div></div><Badge tone={activity.effectiveStatus === "open" ? "green" : activity.effectiveStatus === "closed" ? "rose" : "gold"}>{statusText[activity.effectiveStatus] ?? activity.effectiveStatus}</Badge></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">考試名稱</p><p className="mt-1 font-semibold">{activity.examName}</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">適用對象</p><p className="mt-1 font-semibold">{activity.educationLevel === "senior" ? "高中" : "國中"}・{activity.grade} 年級</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">時間</p><p className="mt-1 font-semibold">{activity.openAt ? formatTaipeiDateTime(activity.openAt) : "手動開放"}{activity.closeAt ? ` ～ ${formatTaipeiDateTime(activity.closeAt)}` : ""}</p></div></div></header>
    <Card title="成績排行榜" subtitle="依每位學生的最高成績排名；同分時以答對題數及先完成者優先。"><div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-sm">{leaderboard.data?.me ? `你的最佳成績：第 ${leaderboard.data.me.rank} 名・${leaderboard.data.me.bestScore} 分・答對 ${leaderboard.data.me.bestCorrect}/${leaderboard.data.me.bestTotal} 題・作答 ${leaderboard.data.me.attempts} 次` : "完成一次測驗後，你的成績會出現在排行榜。"}</div>{leaderboard.loading && <Skeleton lines={3} />}{leaderboard.data?.ranking.length ? <div className="space-y-2">{leaderboard.data.ranking.slice(0, 20).map((row) => <div key={row.userId ?? row.rank} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${row.isMe ? "border-cyan-300/40 bg-cyan-300/[0.08]" : "border-[var(--line)]"}`}><span><b className="mr-2 text-cyan-200">#{row.rank}</b>{row.isMe ? "你" : row.displayName || row.novaId}</span><span className="text-muted">{row.bestScore} 分・{row.bestCorrect}/{row.bestTotal} 題</span></div>)}</div> : !leaderboard.loading && <p className="text-sm text-muted">目前還沒有完成的測驗成績。</p>}</Card>
    {data.resume?.quizId && data.resume.status && !quiz && !review && <Card className="overflow-hidden border-cyan-300/25 bg-cyan-300/[0.04]"><div className="flex items-center gap-3"><span className="h-3 w-3 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.8)]" /><div><p className="font-semibold text-cyan-100">正在載入您先前的作答紀錄</p><p className="mt-1 text-xs text-muted">正在確認是否已提交，請稍候…</p></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" /></div></Card>}
    {!data.resume?.status && !started && !review && <Card title="考試科目與範圍" subtitle="正式題目已依科目整理，圖片題與無法判定題目依規則跳過。"><div className="grid gap-3 sm:grid-cols-2">{data.subjects.map((subject) => <div key={subject.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><h2 className="font-bold">{subject.subject}</h2><p className="mt-3 text-xs text-muted">{subject.chapters.length ? subject.chapters.join("、") : "依本次段考範圍出題"}</p></div>)}</div><div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4"><p className="text-sm font-bold text-cyan-100">選擇作答方式</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={started} onClick={() => setStudyMode("mastery")} className={`rounded-xl border p-3 text-left ${studyMode === "mastery" ? "border-cyan-300 bg-cyan-300/15" : "border-[var(--line)]"}`}><b>每題精熟</b><span className="mt-1 block text-xs text-muted">每題選完按「確認答案」，立即看正解與詳解。</span></button><button type="button" disabled={started} onClick={() => setStudyMode("flow")} className={`rounded-xl border p-3 text-left ${studyMode === "flow" ? "border-violet-300 bg-violet-300/15" : "border-[var(--line)]"}`}><b>一氣呵成</b><span className="mt-1 block text-xs text-muted">先完成整份測驗，最後一次交卷查看總成績與詳解。</span></button></div></div><Button className="mt-5" loading={busy} disabled={!data.access.canEnter || started} onClick={() => void startQuiz()}>{started ? "測驗進行中" : "開始段考衝刺測驗"}</Button></Card>}
    {review && <Card title="測驗結果與詳解" subtitle="每題都會顯示你的答案、正確答案與解析。"><div className="space-y-4">{review.map((item, index) => <div key={item.questionId} className={`rounded-2xl border p-4 ${item.isCorrect ? "border-emerald-300/30 bg-emerald-300/[0.06]" : "border-rose-300/30 bg-rose-300/[0.06]"}`}><p className="text-xs text-muted">第 {index + 1} 題・{item.isCorrect ? "答對" : "答錯"}</p><p className="mt-2 font-semibold leading-7">{item.stem}</p><p className="mt-2 text-sm">你的答案：{item.response.join("、") || "未作答"}</p><p className="mt-1 text-sm text-cyan-100">正確答案：{item.answer.join("、")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">詳解：{item.explanation || "本題沒有補充詳解。"}</p></div>)}</div></Card>}
    {!data.access.canEnter && <Card title="目前無法作答"><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-muted">{data.access.reason}</div></Card>}
  </>}</div>;
}
