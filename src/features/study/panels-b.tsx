"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Skeleton, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, useApi } from "@/lib/api";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";
import { MathContent } from "@/components/MathContent";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];

type Quiz = { id: string; title: string; subject: string; difficulty: string; questionCount: number; timeLimitSec: number; createdAt: string; source: string };
type Attempt = { id: string; quizId: string; status: string; score: number; total: number; correctCount: number; submittedAt: string | null };
type QuizQuestion = { id: string; type: string; stem: string; options: string[]; metadata?: Record<string, unknown> };
type ReviewItem = { questionId: string; stem: string; options: string[]; answer: string[]; explanation: string; response: string[]; isCorrect: boolean };

export function QuizPanel({ autoGenerate = false }: { autoGenerate?: boolean }) {
  const toast = useToast();
  const list = useApi<{ quizzes: Quiz[]; attempts: Attempt[] }>("/quizzes");
  const materials = useApi<{ materials: Array<{ id: string; title: string }> }>("/materials");
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number }> }>("/quotas");
  const quizGenerateCost = quotas.data?.quotas.find((item) => item.feature === "ai_practice")?.novaCost ?? null;
  const [genOpen, setGenOpen] = useState(autoGenerate);
  const [form, setForm] = useState({ subject: "英文", topic: "", materialId: "", sourceText: "", exampleText: "", count: 5, difficulty: "normal", type: "single", timeLimitSec: 600 });
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [active, setActive] = useState<{ quiz: Quiz; questions: QuizQuestion[]; attemptId: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remaining, setRemaining] = useState(0);
  const [review, setReview] = useState<{ score: number; correct: number; total: number; items: ReviewItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, { isCorrect: boolean; answer: string[]; explanation: string }>>({});

  const submit = useCallback(
    async (attemptId: string, duration: number) => {
      setBusy(true);
      try {
        const res = await apiPost<{ score: number; correct: number; total: number; review: ReviewItem[]; reward: { nova: number; xp: number } | null }>(
          `/attempts/${attemptId}/submit`,
          { durationSec: duration },
        );
        setReview({ score: res.score, correct: res.correct, total: res.total, items: res.review });
        setActive(null);
        if (res.reward) toast.push("success", `完成測驗！+${res.reward.nova} Nova / +${res.reward.xp} XP`);
        await list.reload();
      } catch (err) {
        toast.push("error", errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [list, toast],
  );

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          void submit(active.attemptId, active.quiz.timeLimitSec);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, submit]);

  async function generate() {
    if (!confirmNovaSpend("AI 產生測驗", quizGenerateCost)) return;
    setBusy(true);
    setGenerationProgress(8);
    const progressTimer = window.setInterval(() => setGenerationProgress((value) => Math.min(92, value + Math.ceil((100 - value) / 8))), 900);
    try {
      let materialId = form.materialId;
      if (sourceFile) {
        const materialForm = new FormData();
        materialForm.append("title", `AI出題教材・${sourceFile.name}`);
        materialForm.append("subject", form.subject);
        materialForm.append("file", sourceFile);
        const created = await apiPost<{ material: { id: string } }>("/materials", materialForm);
        materialId = created.material.id;
        await materials.reload();
      }
      const payload: Record<string, unknown> = {
        subject: form.subject,
        topic: form.topic,
        count: form.count,
        difficulty: form.difficulty,
        type: form.type,
        timeLimitSec: form.timeLimitSec,
        exampleText: form.exampleText,
      };
      if (materialId) payload.materialId = materialId;
      else payload.sourceText = form.sourceText;
      const res = await apiPost<{ quiz: Quiz; generated: number }>("/quizzes/generate", payload);
      setGenerationProgress(100);
      toast.push("success", `已產生 ${res.generated} 題；測驗保存 3 天，可直接開始或稍後再用`);
      setGenOpen(false);
      setSourceFile(null);
      await list.reload();
      await start(res.quiz);
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      window.clearInterval(progressTimer);
      window.setTimeout(() => setGenerationProgress(0), 500);
      setBusy(false);
    }
  }

  async function start(quiz: Quiz) {
    setBusy(true);
    try {
      const started = await apiPost<{ attempt: { id: string }; resumed: boolean }>(`/quizzes/${quiz.id}/start`);
      const full = await apiGet<{ quiz: Quiz; questions: QuizQuestion[]; saved: Array<{ questionId: string; response: string[] }> }>(`/quizzes/${quiz.id}`);
      const restored: Record<string, string[]> = {};
      full.saved.forEach((s) => (restored[s.questionId] = s.response));
      setAnswers(restored);
      setActive({ quiz, questions: full.questions, attemptId: started.attempt.id });
      setRemaining(quiz.timeLimitSec);
      setReview(null);
      setQuestionIndex(0);
      setCheckedAnswers({});
      if (started.resumed) toast.push("info", "已恢復上次未完成的作答");
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAnswer(questionId: string, response: string[]) {
    if (!active) return;
    setAnswers((a) => ({ ...a, [questionId]: response }));
    try {
      await apiPost(`/attempts/${active.attemptId}/save`, { questionId, response });
    } catch {
      toast.push("error", "自動儲存失敗，稍後會再試");
    }
  }

  async function checkCurrentAnswer(question: QuizQuestion) {
    const response = answers[question.id] ?? [];
    if (!response.length || !response[0].trim()) {
      toast.push("info", "請先選擇或輸入答案");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPost<{ isCorrect: boolean; answer: string[]; explanation: string }>(`/attempts/${active?.attemptId}/check`, { questionId: question.id, response });
      setCheckedAnswers((current) => ({ ...current, [question.id]: result }));
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    const answered = Object.values(answers).filter((v) => v.length).length;
    const question = active.questions[questionIndex];
    const checked = checkedAnswers[question.id];
    const optionLetters = ["A", "B", "C", "D", "E", "F"];
    const isChoice = ["single", "truefalse", "part_of_speech", "meaning", "multiple"].includes(question.type);
    const options = question.options.length ? question.options : question.type === "truefalse" ? ["正確", "錯誤"] : [];
    const answeredPercent = Math.round(((questionIndex + 1) / active.questions.length) * 100);
    return (
      <Card
        title={active.quiz.title}
        subtitle={`${questionIndex + 1}／${active.questions.length} 題・已作答 ${answered} 題`}
        action={<Badge tone={remaining < 60 ? "rose" : "cyan"}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Badge>}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted"><span>作答進度</span><span>{answeredPercent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#37d3ff] to-[#7c5cff] transition-all duration-500" style={{ width: `${answeredPercent}%` }} /></div>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[#0b1730]/70 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><Badge tone="cyan">第 {questionIndex + 1} 題</Badge><span className="text-xs text-muted">{question.type === "multiple" ? "可複選" : "請選出最適合的答案"}</span></div>
            <h3 className="text-base font-semibold leading-7 sm:text-lg"><MathContent>{question.stem}</MathContent></h3>
            {typeof question.metadata?.imageUrl === "string" && <img src={question.metadata.imageUrl} alt="題目關聯圖片" className="mt-4 max-h-80 w-full rounded-xl border border-white/10 object-contain" />}
            {isChoice && options.length > 0 ? (
              <div className="mt-5 space-y-3">
                {options.map((option, optionIndex) => {
                  const selected = answers[question.id]?.includes(option) ?? false;
                  return <button type="button" key={`${question.id}-${option}`} disabled={Boolean(checked)} onClick={() => {
                    if (question.type === "multiple") {
                      const current = answers[question.id] ?? [];
                      void saveAnswer(question.id, selected ? current.filter((item) => item !== option) : [...current, option]);
                    } else void saveAnswer(question.id, [option]);
                  }} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${selected ? "border-[#4c8dff] bg-[#4c8dff]/15 shadow-[0_0_0_2px_rgba(76,141,255,.12)]" : "border-white/15 bg-white/[.025] hover:border-[#4c8dff]/70 hover:bg-[#4c8dff]/10"} ${checked?.isCorrect && selected ? "border-emerald-400 bg-emerald-400/15" : checked && !checked.isCorrect && selected ? "border-rose-400 bg-rose-400/15" : ""}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${selected ? "bg-[#377dff] text-white" : "bg-white/10 text-muted"}`}>{optionLetters[optionIndex]}</span><span className="text-sm leading-6"><MathContent>{option}</MathContent></span></button>;
                })}
              </div>
            ) : question.type === "single" ? <div className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">這一題的四個選項資料不完整，無法作答。請刪除這份測驗後重新產生。</div> : <Input value={answers[question.id]?.[0] ?? ""} disabled={Boolean(checked)} onChange={(e) => void saveAnswer(question.id, [e.target.value])} placeholder="輸入你的答案" />}
            {checked && <div className={`mt-5 rounded-2xl border p-4 ${checked.isCorrect ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/40 bg-rose-400/10"}`}><p className="font-semibold">{checked.isCorrect ? "回答正確" : "回答錯誤"}</p>{!checked.isCorrect && <p className="mt-1 text-sm">正確答案：<MathContent>{checked.answer.join("、")}</MathContent></p>}{checked.explanation && <p className="mt-2 text-sm leading-6 text-muted">解析：<MathContent>{checked.explanation}</MathContent></p>}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {!checked ? <Button full={false} loading={busy} onClick={() => void checkCurrentAnswer(question)}>檢查答案</Button> : questionIndex < active.questions.length - 1 ? <Button full={false} onClick={() => { setQuestionIndex((index) => index + 1); }}>下一題</Button> : <Button full={false} loading={busy} onClick={() => void submit(active.attemptId, active.quiz.timeLimitSec - remaining)}>交卷並查看成績</Button>}
            <Button variant="ghost" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}>上一題</Button>
            <Button variant="ghost" onClick={() => setActive(null)}>稍後再作答</Button>
          </div>
          <p className="text-xs text-muted print:hidden">答案會自動保存；關閉或重新整理後，已作答內容仍可恢復。</p>
          <div className="hidden print:block"><p className="mt-6 border-t border-black pt-3 text-xs">StudyNova AI 測驗・列印日期：{new Date().toLocaleDateString("zh-TW")}</p></div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="AI 出題專區"
        subtitle="查看 AI 測驗紀錄、成績解析與錯題重練；每份 AI 測驗保存 3 天"
        action={
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={async () => {
                try {
                  const res = await apiPost<{ quiz: Quiz }>("/quizzes/from-wrong", { count: 10 });
                  toast.push("success", "已用錯題建立複習測驗");
                  await list.reload();
                  await start(res.quiz);
                } catch (err) {
                  toast.push("error", errorMessage(err));
                }
              }}
            >
              錯題複習卷
            </Button>
            <Button size="sm" onClick={() => setGenOpen(true)}>
              ＋ AI 出題
            </Button>
          </div>
        }
      >
        {list.loading && <Skeleton lines={3} />}
        {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
        {!list.loading && !list.data?.quizzes.length && <EmptyState icon="🧪" title="還沒有測驗" hint="用教材或錯題產生第一份 AI 測驗吧！" />}
        <div className="grid gap-2 sm:grid-cols-2">
          {list.data?.quizzes.map((q) => {
            const attempt = list.data?.attempts.find((a) => a.quizId === q.id && a.status === "submitted");
            return (
              <div key={q.id} className="glass-soft p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{q.title}</p>
                    <p className="text-[11px] text-muted">
                      {q.subject}・{q.questionCount} 題・{q.difficulty}
                    </p>
                  </div>
                  {attempt && <Badge tone={attempt.score >= 60 ? "green" : "rose"}>{attempt.score} 分</Badge>}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" loading={busy} onClick={() => start(q)}>
                    {attempt ? "再測一次" : "開始測驗"}
                  </Button>
                  {attempt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const res = await apiGet<{ review: ReviewItem[]; attempt: Attempt }>(`/attempts/${attempt.id}`);
                        setReview({ score: res.attempt.score, correct: res.attempt.correctCount, total: res.attempt.total, items: res.review });
                      }}
                    >
                      看解析
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="AI 出題">
        <div className="space-y-3">
          <NovaCostNotice cost={quizGenerateCost} action="AI 產生測驗" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="科目">
              <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="難度">
              <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">簡單</option>
                <option value="normal">普通</option>
                <option value="hard">困難</option>
                <option value="exam">會考</option>
                <option value="advanced">高難度</option>
              </Select>
            </Field>
            <Field label="題型">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="single">單選題</option>
                <option value="multiple">多選題</option>
                <option value="part_of_speech">詞性辨識（n./v./adj./adv.）</option>
                <option value="meaning">單字意思四選一</option>
                <option value="fill">填空題</option>
                <option value="truefalse">是非題</option>
                <option value="short">簡答題</option>
                <option value="reading">閱讀測驗</option>
                <option value="mixed">混合題型</option>
              </Select>
            </Field>
            <Field label="題數">
              <Input type="number" min={1} max={50} value={form.count} onChange={(e) => setForm({ ...form, count: Math.max(1, Math.min(50, Number(e.target.value))) })} />
            </Field>
          </div>
          <Field label="使用教材（選填）">
            <Select value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
              <option value="">不使用教材，直接貼上內容</option>
              {materials.data?.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="直接上傳檔案（選填）" hint="支援 PDF、TXT、Markdown 與圖片；上傳後會先保存到教材專區，再用來出題">
            <input type="file" accept=".pdf,.txt,.md,image/*" onChange={(e) => { setSourceFile(e.target.files?.[0] ?? null); setForm({ ...form, materialId: "" }); }} className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-xs" />
            {sourceFile && <p className="mt-1 text-xs text-[#7dd3fc]">已選擇：{sourceFile.name}</p>}
          </Field>
          {!form.materialId && (
            <Field label="教材內容" hint="AI 會依你提供的內容出題，不再以固定字數擋下請求">
              <textarea
                value={form.sourceText}
                onChange={(e) => setForm({ ...form, sourceText: e.target.value })}
                className="focus-ring min-h-[120px] w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm"
              />
            </Field>
          )}
          <Field label="考試範圍／章節" hint="也可以只填範圍，例如：高一英文・現在完成式、關係代名詞">
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="輸入章節、單元或考試範圍" />
          </Field>
          <Field label="範例題目（選填）" hint="AI 會參考題型、文字風格、難度與選項設計，不會直接複製原題">
            <textarea value={form.exampleText} onChange={(e) => setForm({ ...form, exampleText: e.target.value })} className="focus-ring min-h-[100px] w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm" placeholder="貼上老師考卷或你希望參考的題目風格" />
          </Field>
          {!form.materialId && !sourceFile && !form.sourceText.trim() && <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">請上傳要出題的檔案、選擇既有教材，或先到「教材專區」上傳內容後再回來出題。</p>}
          {busy && <div className="rounded-xl border border-[#37d3ff]/30 bg-[#37d3ff]/10 p-3" role="status" aria-live="polite"><div className="flex items-center justify-between text-xs"><span>AI 正在分析教材並建立題目…</span><span>{generationProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-[#37d3ff] to-[#8b5cf6] transition-all duration-700" style={{ width: `${generationProgress}%` }} /></div><p className="mt-1 text-[11px] text-muted">完成後可立即開始，或稍後從本區查看。</p></div>}
          <Button full loading={busy} onClick={generate}>
            產生測驗
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(review)} onClose={() => setReview(null)} title="測驗結果與解析" wide>
        {review && (
          <div className="space-y-3">
            <div className="glass-soft flex items-center justify-between p-3">
              <div>
                <p className="text-2xl font-bold text-[#37d3ff]">{review.score} 分</p>
                <p className="text-xs text-muted">
                  答對 {review.correct}／{review.total} 題
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={() => window.print()}>列印／另存 PDF</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                  const res = await apiPost<{ url: string }>('/shares', { kind: 'quiz', title: `我拿到 ${review.score} 分！`, payload: { score: review.score, correct: review.correct, total: review.total } });
                  await navigator.clipboard.writeText(`${window.location.origin}${res.url}`);
                  toast.push("success", "分享連結已複製");
                  }}
                >分享成績卡</Button>
              </div>
            </div>
            {review.items.map((r, i) => (
              <div key={r.questionId} className={`glass-soft p-3 ${r.isCorrect ? "" : "border border-rose-400/30"}`}>
                <p className="text-sm font-medium">
                  {i + 1}. <MathContent>{r.stem}</MathContent>
                </p>
                <p className="mt-1 text-xs">
                  你的答案：<span className={r.isCorrect ? "text-emerald-300" : "text-rose-300"}>{r.response.join("、") || "（未作答）"}</span>
                </p>
                {!r.isCorrect && <p className="text-xs text-emerald-300">正解：<MathContent>{r.answer.join("、")}</MathContent></p>}
                {r.explanation && <p className="mt-1 text-xs text-muted">解析：<MathContent>{r.explanation}</MathContent></p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

type WrongItem = {
  id: string;
  questionId: string;
  subject: string;
  wrongCount: number;
  reviewCount: number;
  mastery: number;
  aiTip: string;
  nextReviewAt: string;
  resolvedAt: string | null;
  stem: string;
  options: string[];
  answer: string[];
  explanation: string;
  type: string;
};

export function WrongPanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ items: WrongItem[]; due: number }>("/wrong");
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<WrongItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyResult, setWhyResult] = useState<{ reason: string; nextStep: string; focus: string; practicePrompt: string } | null>(null);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "due") return all.filter((i) => !i.resolvedAt && new Date(i.nextReviewAt) <= new Date());
    if (filter === "resolved") return all.filter((i) => i.resolvedAt);
    if (filter === "all") return all;
    return all.filter((i) => i.subject === filter);
  }, [data, filter]);

  const subjects = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.subject))], [data]);

  return (
    <Card
      title="🎯 錯題本"
      subtitle={`共 ${data?.items.length ?? 0} 題・待複習 ${data?.due ?? 0} 題（熟練度達 100% 自動結案）`}
      action={
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto !py-1.5 text-xs">
          <option value="all">全部</option>
          <option value="due">待複習</option>
          <option value="resolved">已掌握</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      }
    >
      {loading && <Skeleton lines={4} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !items.length && <EmptyState icon="🎉" title="沒有錯題！" hint="完成測驗後答錯的題目會自動出現在這裡。" />}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="glass-soft p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 flex-1 text-sm">{item.stem}</p>
              <Badge tone={item.resolvedAt ? "green" : item.mastery >= 50 ? "cyan" : "rose"}>{item.mastery}%</Badge>
            </div>
            <div className="mt-1.5">
              <Progress value={item.mastery} tone={item.mastery >= 80 ? "green" : "violet"} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>{item.subject}</span>
              <span>錯 {item.wrongCount} 次</span>
              <span>複習 {item.reviewCount} 次</span>
              <span>下次：{new Date(item.nextReviewAt).toLocaleDateString("zh-TW")}</span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" onClick={() => { setActive(item); setRevealed(false); setWhyResult(null); }}>
                開始複習
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title="錯題複習" wide>
        {active && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{active.stem}</p>
            {active.options.length > 0 && (
              <ul className="space-y-1 text-sm">
                {active.options.map((o) => (
                  <li key={o} className={`rounded-lg border px-3 py-2 ${revealed && active.answer.includes(o) ? "border-emerald-400/50 bg-emerald-400/10" : "border-[var(--line)]"}`}>
                    {o}
                  </li>
                ))}
              </ul>
            )}
            {revealed ? (
              <div className="glass-soft space-y-2 p-3 text-xs">
                <p className="text-emerald-300">正解：{active.answer.join("、")}</p>
                {active.explanation && <p className="text-muted">{active.explanation}</p>}
                {active.aiTip && <pre className="whitespace-pre-wrap font-sans text-muted">{active.aiTip}</pre>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" loading={whyLoading} onClick={async () => {
                    setWhyLoading(true);
                    try {
                      const res = await apiPost<{ analysis: { reason: string; nextStep: string; focus: string; practicePrompt: string } }>(`/wrong/${active.id}/why`);
                      setWhyResult(res.analysis);
                    } catch (err) { toast.push("error", errorMessage(err)); } finally { setWhyLoading(false); }
                  }}>🤔 我為什麼會錯？</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      await apiPost(`/wrong/${active.id}/practice`);
                      toast.push("success", "已建立一題針對相同錯誤的練習題，請到測驗查看");
                    } catch (err) { toast.push("error", errorMessage(err)); }
                  }}>再練一題</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={tipLoading}
                    onClick={async () => {
                      setTipLoading(true);
                      try {
                        const res = await apiPost<{ tip: string }>(`/wrong/${active.id}/ai-tip`);
                        setActive({ ...active, aiTip: res.tip });
                        toast.push("success", "AI 已提供更簡單的解法");
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      } finally {
                        setTipLoading(false);
                      }
                    }}
                  >
                    AI 記憶法／更簡單解法
                  </Button>
                </div>
                {whyResult && <div className="mt-2 rounded-xl border border-[#37d3ff]/30 bg-[#37d3ff]/5 p-3 text-xs leading-5"><p className="font-semibold text-[#7dd3fc]">可能的錯誤原因</p><p className="mt-1">{whyResult.reason}</p><p className="mt-2 font-semibold text-[#7dd3fc]">下次注意</p><p className="mt-1">{whyResult.nextStep}</p><p className="mt-2 text-muted">針對重點：{whyResult.focus}。{whyResult.practicePrompt}</p><p className="mt-2 text-[10px] text-muted">分析依據：本題題幹、正確答案、最近一次作答與累積錯誤次數。</p></div>}
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setRevealed(true)}>
                顯示答案
              </Button>
            )}
            {revealed && (
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    await apiPost(`/wrong/${active.id}/review`, { correct: true });
                    toast.push("success", "熟練度提升！");
                    setActive(null);
                    await reload();
                  }}
                >
                  我會了 👍
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await apiPost(`/wrong/${active.id}/review`, { correct: false });
                    toast.push("info", "明天會再出現這題");
                    setActive(null);
                    await reload();
                  }}
                >
                  還不熟 🔁
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
