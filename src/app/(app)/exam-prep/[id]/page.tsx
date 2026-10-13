"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Skeleton, useToast } from "@/components/ui";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { apiGet, apiPost, useApi } from "@/lib/api";

type Subject = { id: string; subject: string; chapters: string[]; units: string[]; questionTypes: string[]; difficulty: string };
type Activity = { id: string; name: string; description: string; educationLevel: string; grade: number; semester: string; examName: string; scope: string; openMode: string; status: string; effectiveStatus: string; openAt: string | null; closeAt: string | null; timezone: string; subjects: Subject[] };
type ActivityResponse = { activity: Activity; subjects: Subject[]; resume: null; access: { canEnter: boolean; reason: string } };
type QuizQuestion = { id: string; type: string; stem: string; options: string[]; subject: string; difficulty: string };
type QuizData = { quiz: { id: string; title: string; questionIds: string[] }; questions: QuizQuestion[]; attempt: { id: string; status: string } | null; saved: Array<{ questionId: string; response: string[]; isCorrect?: boolean; checkedAt?: string | null }>; checkedReviews?: Review[]; reviewAvailable?: boolean; review?: Review[] | null };
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
  const [savingProgress, setSavingProgress] = useState(false);
  const [savedQuestionIds, setSavedQuestionIds] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [studyMode, setStudyMode] = useState<StudyMode>("mastery");
  const [questionReviews, setQuestionReviews] = useState<Record<string, Review>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Record<string, boolean>>({});

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
      setResponses(saved); setSavedQuestionIds(Object.fromEntries(loaded.saved.map((item) => [item.questionId, true]))); setQuiz(loaded); setStarted(loaded.attempt?.status !== "submitted"); setReview(loaded.reviewAvailable ? (loaded.review ?? []) : null); setQuestionReviews(Object.fromEntries((loaded.checkedReviews ?? []).map((item) => [item.questionId, item]))); setSkippedQuestionIds({}); setCurrentQuestionIndex(0);
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
      setSavedQuestionIds((current) => ({ ...current, [question.id]: true }));
      setQuestionReviews((current) => ({ ...current, [question.id]: { questionId: question.id, stem: question.stem, options: question.options, answer: result.answer, explanation: result.explanation, response, isCorrect: result.isCorrect } }));
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法檢查答案"); } finally { setSavingQuestion(null); }
  }

  function resetQuestion(questionId: string) {
    setQuestionReviews((current) => { const next = { ...current }; delete next[questionId]; return next; });
  }

  function updateResponse(questionId: string, response: string[]) {
    setResponses((current) => ({ ...current, [questionId]: response }));
    setSavedQuestionIds((current) => { const next = { ...current }; delete next[questionId]; return next; });
    setSkippedQuestionIds((current) => { const next = { ...current }; delete next[questionId]; return next; });
  }

  function skipQuestion(questionId: string) {
    setSkippedQuestionIds((current) => ({ ...current, [questionId]: true }));
    setCurrentQuestionIndex((current) => Math.min(current + 1, (quiz?.questions.length ?? 1) - 1));
  }

  async function resetQuizView() {
    if (!quiz?.attempt || quiz.attempt.status === "submitted") return;
    if (!window.confirm("確定要全部刷新重來嗎？目前這份測驗的作答與已送出狀態都會清除。")) return;
    setBusy(true);
    try {
      await apiPost(`/attempts/${quiz.attempt.id}/reset`, {});
      setResponses({}); setSavedQuestionIds({}); setQuestionReviews({}); setSkippedQuestionIds({}); setCurrentQuestionIndex(0); setReview(null); setStarted(true);
      toast.push("success", "已全部刷新，請從第一題重新開始");
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "無法重新開始測驗"); } finally { setBusy(false); }
  }

  async function saveProgress() {
    if (!quiz?.attempt || quiz.attempt.status === "submitted") return;
    setSavingProgress(true);
    try {
      const pending = quiz.questions.filter((question) => (responses[question.id] ?? []).length);
      for (const question of pending) {
        await apiPost(`/attempts/${quiz.attempt.id}/save`, { questionId: question.id, response: responses[question.id] ?? [] });
      }
      setSavedQuestionIds((current) => ({ ...current, ...Object.fromEntries(pending.map((question) => [question.id, true])) }));
      toast.push("success", `已保存 ${pending.length} 題進度`);
    } catch (error) {
      toast.push("error", error instanceof Error ? error.message : "進度保存失敗，請稍後再試");
    } finally {
      setSavingProgress(false);
    }
  }

  return <div className="space-y-6 pb-24"><Link href="/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺中心</Link>{api.loading && <Card><Skeleton lines={7} /></Card>}{api.error && <ErrorState message={api.error} onRetry={api.reload} />}{data && activity && <>
    <header className="rounded-[2rem] border border-cyan-300/20 bg-white/[0.03] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP ACTIVITY</p><h1 className="mt-3 text-3xl font-black">{studentTitle(activity.name)}</h1><p className="mt-3 text-sm leading-7 text-muted">{activity.description || "段考衝刺正式題庫"}</p><div className="mt-4 flex flex-wrap gap-3"><Button loading={busy} className="!bg-gradient-to-r !from-cyan-400 !to-violet-500 !text-slate-950 !shadow-[0_0_24px_rgba(55,211,255,.35)]" onClick={() => void createBattleInvite()}>⚔ 跟同學一起 PK</Button><Button variant="outline" onClick={async () => { const url = window.location.href; try { if (navigator.share) await navigator.share({ title: `跟同學一起 PK｜${studentTitle(activity.name)}`, text: "登入 StudyNova 後一起挑戰段考衝刺，完成後查看排行榜！", url }); else { await navigator.clipboard.writeText(url); toast.push("success", "PK 邀請連結已複製，請傳給同學（需登入 StudyNova）"); } } catch { /* 使用者取消分享 */ } }}>分享活動</Button><span className="self-center text-xs text-muted">需登入帳號・限時 1 小時・完成後看排行榜</span></div></div><Badge tone={activity.effectiveStatus === "open" ? "green" : activity.effectiveStatus === "closed" ? "rose" : "gold"}>{statusText[activity.effectiveStatus] ?? activity.effectiveStatus}</Badge></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">考試名稱</p><p className="mt-1 font-semibold">{activity.examName}</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">適用對象</p><p className="mt-1 font-semibold">{activity.educationLevel === "senior" ? "高中" : "國中"}・{activity.grade} 年級</p></div><div className="glass-soft rounded-xl p-3"><p className="text-xs text-muted">時間</p><p className="mt-1 font-semibold">{activity.openAt ? formatTaipeiDateTime(activity.openAt) : "手動開放"}{activity.closeAt ? ` ～ ${formatTaipeiDateTime(activity.closeAt)}` : ""}</p></div></div></header>
    <Card title="成績排行榜" subtitle="依每位學生的最高成績排名；同分時以答對題數及先完成者優先。"><div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-sm">{leaderboard.data?.me ? `你的最佳成績：第 ${leaderboard.data.me.rank} 名・${leaderboard.data.me.bestScore} 分・答對 ${leaderboard.data.me.bestCorrect}/${leaderboard.data.me.bestTotal} 題・作答 ${leaderboard.data.me.attempts} 次` : "完成一次測驗後，你的成績會出現在排行榜。"}</div>{leaderboard.loading && <Skeleton lines={3} />}{leaderboard.data?.ranking.length ? <div className="space-y-2">{leaderboard.data.ranking.slice(0, 20).map((row) => <div key={row.userId ?? row.rank} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${row.isMe ? "border-cyan-300/40 bg-cyan-300/[0.08]" : "border-[var(--line)]"}`}><span><b className="mr-2 text-cyan-200">#{row.rank}</b>{row.isMe ? "你" : row.displayName || row.novaId}</span><span className="text-muted">{row.bestScore} 分・{row.bestCorrect}/{row.bestTotal} 題</span></div>)}</div> : !leaderboard.loading && <p className="text-sm text-muted">目前還沒有完成的測驗成績。</p>}</Card>
    {!quiz && !review && <Card title="考試科目與範圍" subtitle="請先選擇作答方式；每題是否確認送出會獨立保存。"><div className="grid gap-3 sm:grid-cols-2">{data.subjects.map((subject) => <div key={subject.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><h2 className="font-bold">{subject.subject}</h2><p className="mt-3 text-xs text-muted">{subject.chapters.length ? subject.chapters.join("、") : "依本次段考範圍出題"}</p></div>)}</div><div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4"><p className="text-sm font-bold text-cyan-100">選擇作答方式</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setStudyMode("mastery")} className={`rounded-2xl border p-4 text-left transition ${studyMode === "mastery" ? "border-cyan-200 bg-gradient-to-br from-cyan-400/25 via-cyan-300/10 to-violet-400/20 shadow-[0_0_24px_rgba(55,211,255,.12)]" : "border-cyan-300/15 bg-cyan-300/[0.04] hover:bg-cyan-300/[0.1]"}`}><b className="text-cyan-100">每題精熟</b><span className="mt-1 block text-xs text-muted">一次一題，送出後查看詳解再進入下一題。</span></button><button type="button" onClick={() => setStudyMode("flow")} className={`rounded-2xl border p-4 text-left transition ${studyMode === "flow" ? "border-violet-200 bg-gradient-to-br from-violet-400/25 via-violet-300/10 to-fuchsia-400/20 shadow-[0_0_24px_rgba(167,139,250,.12)]" : "border-violet-300/15 bg-violet-300/[0.04] hover:bg-violet-300/[0.1]"}`}><b className="text-violet-100">一氣呵成</b><span className="mt-1 block text-xs text-muted">整份題目連續作答，最後一次交卷查看詳解。</span></button></div></div><Button className="mt-5" loading={busy} disabled={!data.access.canEnter} onClick={() => void startQuiz()}>開始段考衝刺測驗</Button></Card>}
    {quiz && !review && studyMode === "mastery" && (() => { const total = quiz.questions.length; const completed = quiz.questions.filter((question) => Boolean(questionReviews[question.id]) || skippedQuestionIds[question.id]).length; const answered = quiz.questions.filter((question) => Boolean(questionReviews[question.id])).length; const skipped = quiz.questions.filter((question) => skippedQuestionIds[question.id]).length; const question = quiz.questions[currentQuestionIndex]; const selected = question ? (responses[question.id] ?? []) : []; const checked = question ? Boolean(questionReviews[question.id]) : false; return <Card title={`${quiz.quiz.title}・每題精熟`} subtitle="完成送出後才會進入下一題；可用上方題號快速查看已送出與略過狀態。"><div className="mb-5 flex items-center justify-between text-sm"><span className="font-semibold">目前已作答 {answered} / {total} 題</span><span className="text-muted">略過 {skipped} 題・完成 {completed} / {total}</span></div><div className="mb-6 flex flex-wrap gap-2" aria-label="題目進度"><>{quiz.questions.map((item, index) => { const done = Boolean(questionReviews[item.id]); const skippedItem = Boolean(skippedQuestionIds[item.id]); const active = index === currentQuestionIndex; return <button key={item.id} type="button" onClick={() => setCurrentQuestionIndex(index)} aria-label={`前往第 ${index + 1} 題`} className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition ${active ? "scale-110 border-white bg-white text-slate-950" : done ? "border-emerald-200/70 bg-emerald-400/25 text-emerald-100" : skippedItem ? "border-amber-200/70 bg-amber-400/25 text-amber-100" : "border-slate-500/60 bg-slate-800/70 text-slate-300 hover:border-cyan-200"}`}>{index + 1}</button>; })}</></div><div className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-white align-middle" />目前題目</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 align-middle" />已送出</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400 align-middle" />已略過</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-600 align-middle" />未作答</span></div>{question ? <section className={`rounded-2xl border p-5 ${checked ? "border-emerald-300/35 bg-emerald-300/[0.05]" : "border-cyan-300/20 bg-white/[0.025]"}`}><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">第 {currentQuestionIndex + 1} 題・{question.subject}</p><Badge tone={checked ? "green" : skippedQuestionIds[question.id] ? "gold" : selected.length ? (savedQuestionIds[question.id] ? "green" : "gold") : "muted"}>{checked ? "已送出" : skippedQuestionIds[question.id] ? "已略過" : selected.length ? (savedQuestionIds[question.id] ? "已保存" : "未保存") : "未作答"}</Badge></div><p className="mt-4 font-semibold leading-7">{question.stem}</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} type="button" disabled={checked || quiz.attempt?.status === "submitted"} onClick={() => updateResponse(question.id, [option])} className={`rounded-xl border p-3 text-left text-sm transition ${selected.includes(option) ? "border-cyan-300 bg-cyan-300/15" : "border-[var(--line)] bg-black/10 hover:border-cyan-300/50"} disabled:cursor-not-allowed disabled:opacity-70`}>{option}</button>)}</div>{checked && questionReviews[question.id] && <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3 text-sm"><b className={questionReviews[question.id].isCorrect ? "text-emerald-200" : "text-rose-200"}>{questionReviews[question.id].isCorrect ? "答對" : "答錯"}</b><p className="mt-1 text-cyan-100">正確答案：{questionReviews[question.id].answer.join("、")}</p><p className="mt-1 whitespace-pre-wrap text-muted">{questionReviews[question.id].explanation || "本題沒有補充詳解。"}</p></div>}<div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => skipQuestion(question.id)} disabled={checked} className="rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-4 py-2.5 text-sm font-bold text-amber-100 transition hover:bg-amber-300/[0.15] disabled:cursor-not-allowed disabled:opacity-40">略過</button>{checked ? <Button onClick={() => setCurrentQuestionIndex((index) => Math.min(index + 1, total - 1))}>{currentQuestionIndex === total - 1 ? "回顧題目" : "下一題"}</Button> : <Button loading={savingQuestion === question.id} disabled={!selected.length || quiz.attempt?.status === "submitted"} onClick={() => void checkQuestion(question)}>確認答案並送出</Button>}</div></section> : null}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={resetQuizView}>全部刷新重來</Button>{completed === total && <Button loading={busy} onClick={() => void submitQuiz()} disabled={quiz.attempt?.status === "submitted"}>完成並查看結果</Button>}</div></Card> })()}
    {quiz && !review && studyMode === "flow" && (() => { const total = quiz.questions.length; const answered = quiz.questions.filter((item) => (responses[item.id] ?? []).length > 0 && !skippedQuestionIds[item.id]).length; const skipped = quiz.questions.filter((item) => skippedQuestionIds[item.id]).length; const completed = answered + skipped; const question = quiz.questions[currentQuestionIndex]; const selected = question ? (responses[question.id] ?? []) : []; const last = currentQuestionIndex === total - 1; return <Card title={`${quiz.quiz.title}・一氣呵成`} subtitle="一次一題連續作答；不會提前顯示答案，完成後交卷才查看結果。"><div className="mb-5 flex items-center justify-between text-sm"><span className="font-semibold">目前已作答 {answered} / {total} 題</span><span className="text-muted">略過 {skipped} 題・完成 {completed} / {total}</span></div><div className="mb-4 flex flex-wrap gap-2" aria-label="題目進度">{quiz.questions.map((item, index) => { const answeredItem = (responses[item.id] ?? []).length > 0 && !skippedQuestionIds[item.id]; const skippedItem = Boolean(skippedQuestionIds[item.id]); const active = index === currentQuestionIndex; return <button key={item.id} type="button" onClick={() => setCurrentQuestionIndex(index)} aria-label={`前往第 ${index + 1} 題`} className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition ${active ? "scale-110 border-white bg-white text-slate-950" : answeredItem ? "border-emerald-200/70 bg-emerald-400/25 text-emerald-100" : skippedItem ? "border-amber-200/70 bg-amber-400/25 text-amber-100" : "border-slate-500/60 bg-slate-800/70 text-slate-300 hover:border-cyan-200"}`}>{index + 1}</button>; })}</div><div className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-white align-middle" />目前題目</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 align-middle" />已作答</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400 align-middle" />已略過</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-600 align-middle" />未作答</span></div>{question && <section className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.04] p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">第 {currentQuestionIndex + 1} 題・{question.subject}</p><Badge tone={skippedQuestionIds[question.id] ? "gold" : selected.length ? (savedQuestionIds[question.id] ? "green" : "gold") : "muted"}>{skippedQuestionIds[question.id] ? "已略過" : selected.length ? (savedQuestionIds[question.id] ? "已保存" : "未保存") : "未作答"}</Badge></div><p className="mt-4 font-semibold leading-7">{question.stem}</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} type="button" disabled={quiz.attempt?.status === "submitted"} onClick={() => updateResponse(question.id, [option])} className={`rounded-xl border p-3 text-left text-sm transition ${selected.includes(option) ? "border-violet-300 bg-violet-300/15" : "border-[var(--line)] bg-black/10 hover:border-violet-300/50"} disabled:cursor-not-allowed disabled:opacity-70`}>{option}</button>)}</div><div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => skipQuestion(question.id)} disabled={quiz.attempt?.status === "submitted"} className="rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-4 py-2.5 text-sm font-bold text-amber-100 transition hover:bg-amber-300/[0.15] disabled:cursor-not-allowed disabled:opacity-40">略過</button><Button onClick={() => setCurrentQuestionIndex((index) => Math.min(index + 1, total - 1))} disabled={!last && quiz.attempt?.status === "submitted"}>{last ? "完成作答" : "下一題"}</Button></div></section>}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Button variant="outline" onClick={resetQuizView}>全部刷新重來</Button>{completed === total && <Button loading={busy} onClick={() => void submitQuiz()} disabled={quiz.attempt?.status === "submitted"}>完成並查看結果</Button>}</div></Card> })()}
    {quiz && !review && <button type="button" onClick={() => void saveProgress()} disabled={savingProgress || quiz.attempt?.status === "submitted"} className="fixed bottom-5 right-5 z-20 rounded-full border border-cyan-300/35 bg-slate-950/90 px-4 py-2.5 text-xs font-bold text-cyan-100 shadow-[0_8px_30px_rgba(5,20,50,.35)] backdrop-blur transition hover:border-cyan-200 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">{savingProgress ? "保存中…" : "立即保存進度"}</button>}
    {review && <Card title="測驗結果與詳解" subtitle="每題都會顯示你的答案、正確答案與解析。"><div className="space-y-4">{review.map((item, index) => <div key={item.questionId} className={`rounded-2xl border p-4 ${item.isCorrect ? "border-emerald-300/30 bg-emerald-300/[0.06]" : "border-rose-300/30 bg-rose-300/[0.06]"}`}><p className="text-xs text-muted">第 {index + 1} 題・{item.isCorrect ? "答對" : "答錯"}</p><p className="mt-2 font-semibold leading-7">{item.stem}</p><p className="mt-2 text-sm">你的答案：{item.response.join("、") || "未作答"}</p><p className="mt-1 text-sm text-cyan-100">正確答案：{item.answer.join("、")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">詳解：{item.explanation || "本題沒有補充詳解。"}</p></div>)}</div></Card>}
    {!data.access.canEnter && <Card title="目前無法作答"><div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-muted">{data.access.reason}</div></Card>}
  </>}</div>;
}
