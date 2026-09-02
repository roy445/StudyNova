"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Skeleton, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, useApi } from "@/lib/api";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];

type Quiz = { id: string; title: string; subject: string; difficulty: string; questionCount: number; timeLimitSec: number; createdAt: string; source: string };
type Attempt = { id: string; quizId: string; status: string; score: number; total: number; correctCount: number; submittedAt: string | null };
type QuizQuestion = { id: string; type: string; stem: string; options: string[] };
type ReviewItem = { questionId: string; stem: string; options: string[]; answer: string[]; explanation: string; response: string[]; isCorrect: boolean };

export function QuizPanel() {
  const toast = useToast();
  const list = useApi<{ quizzes: Quiz[]; attempts: Attempt[] }>("/quizzes");
  const materials = useApi<{ materials: Array<{ id: string; title: string }> }>("/materials");
  const [genOpen, setGenOpen] = useState(false);
  const [form, setForm] = useState({ subject: "英文", topic: "", materialId: "", sourceText: "", count: 5, difficulty: "normal", type: "single", timeLimitSec: 600 });
  const [active, setActive] = useState<{ quiz: Quiz; questions: QuizQuestion[]; attemptId: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remaining, setRemaining] = useState(0);
  const [review, setReview] = useState<{ score: number; correct: number; total: number; items: ReviewItem[] } | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        subject: form.subject,
        topic: form.topic,
        count: form.count,
        difficulty: form.difficulty,
        type: form.type,
        timeLimitSec: form.timeLimitSec,
      };
      if (form.materialId) payload.materialId = form.materialId;
      else payload.sourceText = form.sourceText;
      const res = await apiPost<{ quiz: Quiz; generated: number }>("/quizzes/generate", payload);
      toast.push("success", `已產生 ${res.generated} 題`);
      setGenOpen(false);
      await list.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
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

  if (active) {
    const answered = Object.values(answers).filter((v) => v.length).length;
    return (
      <Card
        title={active.quiz.title}
        subtitle={`${active.questions.length} 題・已作答 ${answered} 題（答案會自動儲存，可中斷後恢復）`}
        action={<Badge tone={remaining < 60 ? "rose" : "cyan"}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Badge>}
      >
        <div className="space-y-3">
          {active.questions.map((q, i) => (
            <div key={q.id} className="glass-soft p-3">
              <p className="text-sm font-medium">
                {i + 1}. {q.stem}
              </p>
              <div className="mt-2 space-y-1.5">
                {q.type === "single" || q.type === "truefalse" ? (
                  q.options.map((o) => (
                    <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${answers[q.id]?.[0] === o ? "border-[#37d3ff] bg-[#37d3ff]/10" : "border-[var(--line)]"}`}>
                      <input type="radio" name={q.id} checked={answers[q.id]?.[0] === o} onChange={() => saveAnswer(q.id, [o])} className="accent-[#37d3ff]" />
                      <span>{o}</span>
                    </label>
                  ))
                ) : q.type === "multiple" ? (
                  q.options.map((o) => (
                    <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${answers[q.id]?.includes(o) ? "border-[#37d3ff] bg-[#37d3ff]/10" : "border-[var(--line)]"}`}>
                      <input
                        type="checkbox"
                        checked={answers[q.id]?.includes(o) ?? false}
                        onChange={(e) => {
                          const cur = answers[q.id] ?? [];
                          saveAnswer(q.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o));
                        }}
                        className="accent-[#37d3ff]"
                      />
                      <span>{o}</span>
                    </label>
                  ))
                ) : (
                  <Input value={answers[q.id]?.[0] ?? ""} onChange={(e) => saveAnswer(q.id, [e.target.value])} placeholder="輸入答案" />
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => submit(active.attemptId, active.quiz.timeLimitSec - remaining)}>
              交卷
            </Button>
            <Button variant="ghost" onClick={() => setActive(null)}>
              稍後再作答
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="📝 AI 測驗"
        subtitle="依教材、章節、錯題與弱點出題，支援單選／多選／填空／是非／簡答"
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
                <option value="fill">填空題</option>
                <option value="truefalse">是非題</option>
                <option value="short">簡答題</option>
                <option value="reading">閱讀測驗</option>
                <option value="mixed">混合題型</option>
              </Select>
            </Field>
            <Field label="題數">
              <Input type="number" min={1} max={20} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
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
          {!form.materialId && (
            <Field label="教材內容" hint="至少 20 個字，AI 只會依此內容出題">
              <textarea
                value={form.sourceText}
                onChange={(e) => setForm({ ...form, sourceText: e.target.value })}
                className="focus-ring min-h-[120px] w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm"
              />
            </Field>
          )}
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
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await apiPost<{ url: string }>("/shares", { kind: "quiz", title: `我拿到 ${review.score} 分！`, payload: { score: review.score, correct: review.correct, total: review.total } });
                  await navigator.clipboard.writeText(`${window.location.origin}${res.url}`);
                  toast.push("success", "分享連結已複製");
                }}
              >
                分享成績卡
              </Button>
            </div>
            {review.items.map((r, i) => (
              <div key={r.questionId} className={`glass-soft p-3 ${r.isCorrect ? "" : "border border-rose-400/30"}`}>
                <p className="text-sm font-medium">
                  {i + 1}. {r.stem}
                </p>
                <p className="mt-1 text-xs">
                  你的答案：<span className={r.isCorrect ? "text-emerald-300" : "text-rose-300"}>{r.response.join("、") || "（未作答）"}</span>
                </p>
                {!r.isCorrect && <p className="text-xs text-emerald-300">正解：{r.answer.join("、")}</p>}
                {r.explanation && <p className="mt-1 text-xs text-muted">解析：{r.explanation}</p>}
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
              <Button size="sm" onClick={() => { setActive(item); setRevealed(false); }}>
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
