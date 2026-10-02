"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Concept = { id: string; title: string; description: string; score: number; label: string; unlocked: boolean; attempts: number; topicTitle: string; topicSlug: string };
type Question = { id: string; stem: string; options: string[]; difficulty: string; estimatedSeconds: number };

function ScoreBar({ score }: { score: number }) { return <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] via-[#37d3ff] to-[#6ee7b7] transition-all" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div>; }

function Diagnostic({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; correctCount: number; total: number } | null>(null);
  async function start() { setBusy(true); try { const res = await apiPost<{ attemptId: string; questions: Question[] }>("/chemistry/diagnostic/start", {}); setAttemptId(res.attemptId); setQuestions(res.questions); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); } }
  async function submit() { if (!attemptId) return; setBusy(true); try { const res = await apiPost<{ result: { score: number; correctCount: number; total: number } }>(`/chemistry/diagnostic/${attemptId}/submit`, { answers }); setResult(res.result); onDone(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); } }
  if (result) return <Card title="診斷完成" subtitle="這份結果只根據你這次的真實作答，之後會隨練習與間隔複習更新。"><div className="text-center"><p className="text-5xl font-black text-[#7dd3fc]">{result.score}%</p><p className="mt-2 text-sm text-muted">答對 {result.correctCount} / {result.total} 題</p><Button className="mt-5" onClick={onDone}>查看我的學習路線</Button></div></Card>;
  if (!attemptId) return <Card title="先了解你的化學程度" subtitle="診斷約 5～8 分鐘，從基本粒子一路檢查到化學式。結果不會把你永久定型。"><Button loading={busy} onClick={() => void start()}>開始能力診斷</Button></Card>;
  return <Card title={`能力診斷（${questions.length} 題）`} subtitle="先自己思考；完成後系統會依概念分析，不只給一個總分。"><div className="space-y-4">{questions.map((question, index) => <div key={question.id} className="glass-soft rounded-2xl p-4"><p className="text-xs text-[#7dd3fc]">第 {index + 1} 題・{question.difficulty === "hard" ? "進階" : "基礎"}</p><p className="mt-2 text-sm font-semibold leading-6">{question.stem}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} type="button" onClick={() => setAnswers({ ...answers, [question.id]: [option] })} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${answers[question.id]?.[0] === option ? "border-[#37d3ff] bg-[#37d3ff]/15" : "border-white/10 hover:bg-white/5"}`}>{option}</button>)}</div></div>)}<Button loading={busy} disabled={Object.keys(answers).length < questions.length} onClick={() => void submit()}>提交診斷結果</Button></div></Card>;
}

function Lesson({ concept, onClose }: { concept: Concept; onClose: () => void }) {
  const toast = useToast();
  const lessons = useApi<{ lessons: Array<{ lesson: { id: string; title: string; subtitle: string; estimatedMinutes: number }; steps: Array<{ id: string; title: string; body: string; stepType: string }> }> }>(`/chemistry/concepts/${concept.id}/lessons`, [concept.id]);
  const [step, setStep] = useState(0);
  const current = lessons.data?.lessons[0];
  const steps = current?.steps ?? [];
  async function next() { const completed = step >= steps.length - 1; try { await apiPost(`/chemistry/lessons/${current?.lesson.id}/progress`, { completedSteps: step + 1, completed }); if (completed) { toast.push("success", "課程完成，已保存學習進度"); onClose(); } else setStep(step + 1); } catch (err) { toast.push("error", errorMessage(err)); } }
  return <Card title={`📖 ${concept.title}`} subtitle={concept.description}>{lessons.loading && <Skeleton lines={4} />}{current && <div className="space-y-4"><div className="flex items-center justify-between text-xs text-muted"><span>Level {steps[step]?.stepType === "example" ? 2 : 1}</span><span>{step + 1} / {steps.length} 步</span></div><ScoreBar score={((step + 1) / Math.max(steps.length, 1)) * 100} /><div className="rounded-2xl border border-[#37d3ff]/25 bg-[#37d3ff]/5 p-5"><h3 className="text-lg font-bold">{steps[step]?.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{steps[step]?.body}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onClose}>稍後繼續</Button><Button onClick={() => void next()}>{step >= steps.length - 1 ? "完成課程" : "下一步"}</Button></div></div>}</Card>;
}

function Practice({ concept, onClose }: { concept: Concept; onClose: () => void }) {
  const toast = useToast();
  const practice = useApi<{ questions: Question[] }>(`/chemistry/concepts/${concept.id}/practice`, [concept.id]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; explanation: string; mastery: { score: number; label: string } } | null>(null);
  const question = practice.data?.questions[index];
  async function answer() { if (!question || !selected) return; try { const res = await apiPost<{ correct: boolean; explanation: string; mastery: { score: number; label: string } }>(`/chemistry/questions/${question.id}/answer`, { answers: [selected] }); setResult(res); } catch (err) { toast.push("error", errorMessage(err)); } }
  if (practice.loading) return <Card title="練習題"><Skeleton lines={4} /></Card>;
  if (!question) return <Card title="練習完成" subtitle="這個概念目前沒有更多正式練習題。"><Button onClick={onClose}>返回能力地圖</Button></Card>;
  return <Card title={`🧩 ${concept.title} 練習`} subtitle={`第 ${index + 1} / ${practice.data?.questions.length ?? 0} 題・目前掌握度 ${concept.score}%`}><div className="space-y-4"><p className="text-base font-semibold leading-7">{question.stem}</p><div className="grid gap-2 sm:grid-cols-2">{question.options.map((option) => <button key={option} disabled={Boolean(result)} onClick={() => setSelected(option)} className={`rounded-xl border px-3 py-3 text-left text-sm ${selected === option ? "border-[#37d3ff] bg-[#37d3ff]/15" : "border-white/10 hover:bg-white/5"}`}>{option}</button>)}</div>{result ? <div className={`rounded-xl border p-4 ${result.correct ? "border-emerald-300/30 bg-emerald-300/10" : "border-rose-300/30 bg-rose-300/10"}`}><p className="font-semibold">{result.correct ? "答對了！" : "先別急，這是很好的診斷資料。"}</p><p className="mt-2 text-sm leading-6">{result.explanation}</p><p className="mt-2 text-xs text-muted">掌握度更新為 {result.mastery.score}%・{result.mastery.label}</p></div> : <Button disabled={!selected} onClick={() => void answer()}>確認答案</Button>}{result && <Button variant="outline" onClick={() => { setIndex(index + 1); setSelected(null); setResult(null); }}>下一題</Button>}<Button variant="ghost" onClick={onClose}>離開練習</Button></div></Card>;
}

export default function ChemistryPage() {
  const overview = useApi<{ title: string; subtitle: string; overall: number; hasData: boolean; concepts: Concept[]; next: Concept | null }>("/chemistry/overview");
  const diagnostic = useApi<{ completed: boolean }>("/chemistry/diagnostic");
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [mode, setMode] = useState<"lesson" | "practice" | null>(null);
  const [selected, setSelected] = useState<Concept | null>(null);
  const refresh = () => { void overview.reload(); void diagnostic.reload(); };
  const grouped = useMemo(() => overview.data?.concepts.reduce<Record<string, Concept[]>>((acc, item) => { (acc[item.topicTitle] ??= []).push(item); return acc; }, {}) ?? {}, [overview.data]);
  if (overview.loading) return <div className="space-y-4"><Skeleton lines={5} /></div>;
  if (showDiagnostic) return <div className="mx-auto max-w-3xl space-y-4"><button className="text-xs text-muted underline" onClick={() => setShowDiagnostic(false)}>← 返回化學首頁</button><Diagnostic onDone={() => { setShowDiagnostic(false); refresh(); }} /></div>;
  if (selected && mode) return <div className="mx-auto max-w-3xl space-y-4"><button className="text-xs text-muted underline" onClick={() => { setSelected(null); setMode(null); refresh(); }}>← 返回能力地圖</button>{mode === "lesson" ? <Lesson concept={selected} onClose={() => { setSelected(null); setMode(null); refresh(); }} /> : <Practice concept={selected} onClose={() => { setSelected(null); setMode(null); refresh(); }} />}</div>;
  return <div className="mx-auto max-w-6xl space-y-5 pb-20"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.2em] text-[#7dd3fc]">STUDYNOVA · CHEMISTRY</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">🧪 {overview.data?.title}</h1><p className="mt-1 text-sm text-muted">{overview.data?.subtitle}</p></div><Badge tone="cyan">第一階段 MVP</Badge></header><section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><Card title="你的化學能力" subtitle={overview.data?.hasData ? "掌握度會根據真實答題、難度、提示與持續表現更新。" : "尚未建立能力資料；完成診斷後才會出現你的真實能力地圖。"}><div className="flex items-end justify-between gap-4"><div><p className="text-5xl font-black text-[#7dd3fc]">{overview.data?.hasData ? `${overview.data.overall}%` : "—"}</p><p className="mt-1 text-xs text-muted">{overview.data?.hasData ? "目前整體掌握度" : "尚未有足夠資料"}</p></div>{!diagnostic.data?.completed && <Button onClick={() => setShowDiagnostic(true)}>開始能力診斷</Button>}</div><div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] via-[#37d3ff] to-[#6ee7b7]" style={{ width: `${overview.data?.overall ?? 0}%` }} /></div></Card><Card title="下一步" subtitle="系統會優先安排已解鎖且最需要補強的概念。"><p className="text-lg font-bold">{overview.data?.next?.title ?? "完成診斷後建立學習路線"}</p><p className="mt-2 text-sm leading-6 text-muted">{overview.data?.next?.description ?? "先完成能力診斷，StudyNova 才能用真實資料安排你的化學學習路線。"}</p>{overview.data?.next && <Button className="mt-4" onClick={() => { setSelected(overview.data!.next); setMode("lesson"); }}>繼續學習</Button>}</Card></section><Card title="你的化學能力地圖" subtitle="綠色代表已掌握，黃色代表學習中；鎖定概念必須先完成前置概念。"><div className="space-y-5">{Object.entries(grouped).map(([topic, concepts]) => <div key={topic}><div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#37d3ff]" /><h2 className="font-bold">{topic}</h2></div><div className="grid gap-3 md:grid-cols-2">{concepts.map((concept) => <div key={concept.id} className={`glass-soft rounded-2xl p-4 ${!concept.unlocked ? "opacity-55" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{concept.title}</p><p className="mt-1 text-xs text-muted">{concept.description}</p></div><Badge tone={concept.score >= 70 ? "green" : concept.score > 0 ? "gold" : "cyan"}>{concept.score > 0 ? `${concept.score}%` : "尚未學習"}</Badge></div><div className="mt-3"><ScoreBar score={concept.score} /></div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted"><span>{concept.unlocked ? concept.label : "完成前置概念後解鎖"}</span>{concept.unlocked && <span className="flex gap-1"><button className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5" onClick={() => { setSelected(concept); setMode("lesson"); }}>教學</button><button className="rounded-lg border border-[#37d3ff]/30 px-2 py-1 text-[#b9f2ff] hover:bg-[#37d3ff]/10" onClick={() => { setSelected(concept); setMode("practice"); }}>練習</button></span>}</div></div>)}</div></div>)}</div></Card></div>;
}
