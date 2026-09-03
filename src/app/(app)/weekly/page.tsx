"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Progress, Skeleton, Stat, Tabs, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, useApi } from "@/lib/api";

type WeekSummary = {
  id: string;
  weekCode: string;
  title: string;
  note: string;
  novaCost: number;
  proOnly: boolean;
  open: boolean;
  openDays: number[];
  openTime: string;
  closeTime: string;
  myResult: { score: number; correctCount: number; total: number; reciteCompleted: boolean } | null;
};

type WeekDetail = {
  week: { id: string; weekCode: string; title: string; note: string; novaCost: number; highlightMap: Record<string, string> };
  words: Array<{ id: string; word: string; meaning: string; example: string; highlightColor: string }>;
  sentences: Array<{ id: string; en: string; zh: string; highlightColor: string }>;
  questions: Array<{ id: string; orderIndex: number; stem: string; options: string[] }>;
  papers: Array<{ id: string; kind: string; url: string | null }>;
  attempt: { id: string; responses: Record<string, string[]> } | null;
  result: { score: number; correctCount: number; total: number; reciteCompleted: boolean } | null;
};

const DAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

export default function WeeklyPage() {
  const toast = useToast();
  const list = useApi<{ weeks: WeekSummary[] }>("/weekly");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeekDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("recite");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [review, setReview] = useState<{ score: number; correct: number; total: number; review: Array<{ id: string; stem: string; answer: string[]; response: string[]; isCorrect: boolean; explanation: string }> } | null>(null);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quickStep, setQuickStep] = useState(0);
  const [quickLeft, setQuickLeft] = useState(0);
  const stats = useApi<{ participants: number; average: number; highest: number; lowest: number; myScore: number | null; rank: number | null; reciteRate: number }>(
    activeId ? `/weekly/${activeId}/stats` : null,
    [activeId],
  );

  useEffect(() => {
    if (!activeId) return;
    setLoading(true);
    setError(null);
    apiGet<WeekDetail>(`/weekly/${activeId}`)
      .then((d) => {
        setDetail(d);
        setAttemptId(d.attempt?.id ?? null);
        setAnswers(d.attempt?.responses ?? {});
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);

  useEffect(() => {
    if (!quickLeft) return;
    const t = setInterval(() => setQuickLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [quickLeft]);

  const QUICK_STEPS = [
    { label: "1 分鐘預覽本週內容", seconds: 60 },
    { label: "3 分鐘快速背單字", seconds: 180 },
    { label: "3 分鐘快速背句子", seconds: 180 },
    { label: "2 分鐘小測驗", seconds: 120 },
    { label: "1 分鐘弱點回顧", seconds: 60 },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">▦ 每週小考</h1>
        <p className="text-xs text-muted sm:text-sm">管理員上傳的本週單字、句子、考卷與答案，經人工確認後才會發布給你。</p>
      </header>

      {list.loading && <Card><Skeleton lines={3} /></Card>}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.data?.weeks.map((w) => (
          <button
            key={w.id}
            onClick={() => { setActiveId(w.id); setReview(null); setTab("recite"); }}
            className={`glass-soft focus-ring p-3 text-left transition hover:bg-white/5 ${activeId === w.id ? "border border-[#37d3ff]/60" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{w.title}</p>
              <Badge tone={w.open ? "green" : "muted"}>{w.open ? "開放中" : "未開放"}</Badge>
            </div>
            <p className="text-[11px] text-muted">
              {w.weekCode}・每週{w.openDays.map((d) => DAY_LABEL[d]).join("、")} {w.openTime}-{w.closeTime}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {w.proOnly && <Badge tone="gold">Nova Pro</Badge>}
              {w.novaCost > 0 && <Badge tone="violet">{w.novaCost} Nova</Badge>}
              {w.myResult && <Badge tone="cyan">我的分數 {w.myResult.score}</Badge>}
            </div>
          </button>
        ))}
        {!list.loading && !list.data?.weeks.length && <EmptyState icon="▤" title="目前沒有已發布的週次" hint="管理員建立並發布週次後就會顯示在這裡。" />}
      </div>

      {loading && <Card><Skeleton lines={5} /></Card>}
      {error && <ErrorState message={error} onRetry={() => setActiveId(activeId)} />}

      {detail && !loading && (
        <>
          <Card title={detail.week.title} subtitle={detail.week.note || `${detail.week.weekCode}・單字 ${detail.words.length}・句子 ${detail.sentences.length}・題目 ${detail.questions.length}`}>
            <Tabs
              tabs={[
                { key: "recite", label: "快速背誦", icon: "✦" },
                { key: "words", label: "本週單字", icon: "⌁" },
                { key: "sentences", label: "本週句子", icon: "◌" },
                { key: "exam", label: "模擬測驗", icon: "▤" },
                { key: "paper", label: "考卷", icon: "▧" },
                { key: "stats", label: "成績統計", icon: "◒" },
              ]}
              active={tab}
              onChange={setTab}
            />

            <div className="mt-3">
              {tab === "recite" && (
                <div className="space-y-3">
                  <div className="glass-soft p-3">
                    <p className="text-sm font-medium">✦ 10 分鐘快速複習</p>
                    <p className="text-xs text-muted">依序完成 5 個階段，結束後可獲得 Nova 與 XP。</p>
                    <div className="mt-2 space-y-1.5">
                      {QUICK_STEPS.map((s, i) => (
                        <div key={s.label} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${i === quickStep ? "border-[#37d3ff] bg-[#37d3ff]/10" : "border-[var(--line)]"}`}>
                          <span>
                            {i + 1}. {s.label}
                          </span>
                          {i === quickStep ? (
                            quickLeft > 0 ? (
                              <span className="tabular-nums">{quickLeft}s</span>
                            ) : (
                              <Button size="sm" onClick={() => setQuickLeft(s.seconds)}>
                                開始
                              </Button>
                            )
                          ) : i < quickStep ? (
                            <Badge tone="green">完成</Badge>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={quickStep >= QUICK_STEPS.length - 1}
                        onClick={() => { setQuickStep((s) => Math.min(QUICK_STEPS.length - 1, s + 1)); setQuickLeft(0); }}
                      >
                        下一階段
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await apiPost(`/weekly/${detail.week.id}/recite`);
                            toast.push("success", "完成快速背誦！+Nova +XP");
                            await list.reload();
                          } catch (err) {
                            toast.push("error", errorMessage(err));
                          }
                        }}
                      >
                        完成快速背誦
                      </Button>
                    </div>
                  </div>

                  {detail.words.length > 0 && (
                    <div className="glass-soft p-4 text-center">
                      <p className="text-xs text-muted">單字卡 {flashIndex + 1}/{detail.words.length}</p>
                      <p className="mt-2 text-2xl font-bold">{detail.words[flashIndex]?.word}</p>
                      {flipped && (
                        <>
                          <p className="mt-1 text-[#37d3ff]">{detail.words[flashIndex]?.meaning}</p>
                          <p className="mt-1 text-xs text-muted">{detail.words[flashIndex]?.example}</p>
                        </>
                      )}
                      <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setFlipped((f) => !f)}>
                          {flipped ? "隱藏" : "看中文"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setFlipped(false);
                            setFlashIndex((i) => (i + 1) % detail.words.length);
                          }}
                        >
                          下一個
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "words" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.words.map((w) => (
                    <div key={w.id} className="glass-soft p-3">
                      <p className="text-sm font-semibold">
                        {w.word} <Badge tone="violet">{detail.week.highlightMap[w.highlightColor] ?? w.highlightColor}</Badge>
                      </p>
                      <p className="text-xs text-muted">{w.meaning}</p>
                      {w.example && <p className="mt-1 text-[11px] text-muted">{w.example}</p>}
                    </div>
                  ))}
                  {!detail.words.length && <EmptyState icon="⌁" title="本週尚未發布單字" />}
                </div>
              )}

              {tab === "sentences" && (
                <div className="space-y-2">
                  {detail.sentences.map((s) => (
                    <div key={s.id} className="glass-soft p-3">
                      <p className="text-sm">{s.en}</p>
                      <p className="text-xs text-muted">{s.zh}</p>
                    </div>
                  ))}
                  {!detail.sentences.length && <EmptyState icon="◌" title="本週尚未發布句子" />}
                </div>
              )}

              {tab === "exam" && (
                <div className="space-y-3">
                  {detail.result ? (
                    <div className="glass-soft p-3">
                      <p className="text-lg font-bold text-[#37d3ff]">你的成績：{detail.result.score} 分</p>
                      <p className="text-xs text-muted">
                        答對 {detail.result.correctCount}/{detail.result.total} 題
                      </p>
                    </div>
                  ) : !attemptId ? (
                    <Button
                      onClick={async () => {
                        try {
                          const res = await apiPost<{ attempt: { id: string; responses: Record<string, string[]> }; resumed: boolean }>(`/weekly/${detail.week.id}/start`);
                          setAttemptId(res.attempt.id);
                          setAnswers(res.attempt.responses ?? {});
                          toast.push("success", res.resumed ? "已恢復上次作答" : `開始測驗${detail.week.novaCost ? `（扣除 ${detail.week.novaCost} Nova）` : ""}`);
                        } catch (err) {
                          toast.push("error", errorMessage(err));
                        }
                      }}
                    >
                      開始本週測驗（{detail.questions.length} 題）
                    </Button>
                  ) : null}

                  {attemptId && !detail.result && (
                    <>
                      {detail.questions.map((q, i) => (
                        <div key={q.id} className="glass-soft p-3">
                          <p className="text-sm font-medium">
                            {i + 1}. {q.stem}
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {q.options.length ? (
                              q.options.map((o) => (
                                <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${answers[q.id]?.[0] === o ? "border-[#37d3ff] bg-[#37d3ff]/10" : "border-[var(--line)]"}`}>
                                  <input
                                    type="radio"
                                    name={q.id}
                                    checked={answers[q.id]?.[0] === o}
                                    onChange={async () => {
                                      setAnswers((a) => ({ ...a, [q.id]: [o] }));
                                      await apiPost(`/weekly/attempts/${attemptId}/save`, { questionId: q.id, response: [o] });
                                    }}
                                    className="accent-[#37d3ff]"
                                  />
                                  {o}
                                </label>
                              ))
                            ) : (
                              <Input
                                value={answers[q.id]?.[0] ?? ""}
                                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: [e.target.value] }))}
                                onBlur={async (e) => {
                                  await apiPost(`/weekly/attempts/${attemptId}/save`, { questionId: q.id, response: [e.target.value] });
                                }}
                                placeholder="輸入答案"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      <Button
                        onClick={async () => {
                          try {
                            const res = await apiPost<typeof review>(`/weekly/attempts/${attemptId}/submit`);
                            setReview(res);
                            toast.push("success", `交卷完成！得分 ${res?.score}`);
                            await list.reload();
                            await stats.reload();
                          } catch (err) {
                            toast.push("error", errorMessage(err));
                          }
                        }}
                      >
                        交卷
                      </Button>
                    </>
                  )}

                  {review && (
                    <div className="space-y-2">
                      <p className="text-lg font-bold text-[#37d3ff]">
                        {review.score} 分（{review.correct}/{review.total}）
                      </p>
                      {review.review.map((r, i) => (
                        <div key={r.id} className={`glass-soft p-3 text-xs ${r.isCorrect ? "" : "border border-rose-400/30"}`}>
                          <p className="text-sm">
                            {i + 1}. {r.stem}
                          </p>
                          <p className={r.isCorrect ? "text-emerald-300" : "text-rose-300"}>你的答案：{r.response.join("、") || "（未作答）"}</p>
                          {!r.isCorrect && <p className="text-emerald-300">正解：{r.answer.join("、")}</p>}
                          {r.explanation && <p className="text-muted">{r.explanation}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "paper" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.papers.map((p) => (
                    <div key={p.id} className="glass-soft p-2">
                      <p className="mb-1 text-xs text-muted">{p.kind === "paper" ? "考卷" : p.kind === "answer" ? "答案（完成測驗後開放）" : "補充教材"}</p>
                      {p.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.url} alt="考卷" className="w-full rounded-lg" />
                      )}
                    </div>
                  ))}
                  {!detail.papers.length && <EmptyState icon="▧" title="本週沒有上傳檔案" />}
                </div>
              )}

              {tab === "stats" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="參與人數" value={stats.data?.participants ?? 0} />
                  <Stat label="平均分" value={stats.data?.average ?? 0} tone="cyan" />
                  <Stat label="最高分" value={stats.data?.highest ?? 0} tone="gold" />
                  <Stat label="我的分數" value={stats.data?.myScore ?? "-"} tone="violet" />
                  <Stat label="我的排名" value={stats.data?.rank ?? "-"} />
                  <Stat label="背誦完成率" value={`${stats.data?.reciteRate ?? 0}%`} />
                  <div className="col-span-2 sm:col-span-3">
                    <Progress value={stats.data?.myScore ?? 0} tone="gold" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
