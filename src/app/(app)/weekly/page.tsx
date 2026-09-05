"use client";

import { useEffect, useMemo, useState } from "react";
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

type MiniMode = "zh2en" | "en2zh" | "handwriting" | "listening" | "choice";
type MiniQuestion = { word: string; meaning: string; example: string; mode: MiniMode; options: string[] };

function speak(text: string, lang: "en-US" | "zh-TW" = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = lang === "en-US" ? 0.86 : 0.95;
  window.speechSynthesis.speak(utterance);
}

function grammarHint(example: string) {
  if (/\b(if|unless|when|although|because)\b/i.test(example)) return "句中有連接詞，注意條件、時間或原因子句的邏輯。";
  if (/\b(am|is|are|was|were)\s+\w+ing\b/i.test(example)) return "be + V-ing 常見於進行式，注意主詞與 be 動詞一致。";
  if (/\bto\s+\w+\b/i.test(example)) return "to + 原形動詞常見於不定詞，留意前後動詞搭配。";
  if (/\b(has|have|had)\s+\w+ed\b/i.test(example)) return "have/has/had + 過去分詞常見於完成式。";
  return "留意這個單字在例句中的詞性、搭配與前後文語意。";
}

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
  const [showMore, setShowMore] = useState(false);
  const [quickStep, setQuickStep] = useState(0);
  const [quickLeft, setQuickLeft] = useState(0);
  const [miniMode, setMiniMode] = useState<MiniMode>("choice");
  const [miniIndex, setMiniIndex] = useState(0);
  const [miniInput, setMiniInput] = useState("");
  const [miniStarted, setMiniStarted] = useState(false);
  const [miniScore, setMiniScore] = useState(0);
  const [miniChecked, setMiniChecked] = useState(false);
  const [miniResult, setMiniResult] = useState<boolean | null>(null);
  const stats = useApi<{ participants: number; average: number; highest: number; lowest: number; myScore: number | null; rank: number | null; reciteRate: number }>(
    activeId ? `/weekly/${activeId}/stats` : null,
    [activeId],
  );

  const miniQuestions = useMemo<MiniQuestion[]>(() => {
    if (!detail?.words.length) return [];
    return detail.words.slice(0, 10).map((w, i) => {
      const distractors = detail.words.filter((x) => x.id !== w.id).slice(0, 3).map((x) => x.meaning);
      return { word: w.word, meaning: w.meaning, example: w.example, mode: miniMode, options: [w.meaning, ...distractors].sort(() => (i % 2 ? 1 : -1)) };
    });
  }, [detail, miniMode]);
  const currentMini = miniQuestions[miniIndex];
  function resetMini(mode = miniMode) {
    setMiniMode(mode); setMiniIndex(0); setMiniInput(""); setMiniStarted(true); setMiniScore(0); setMiniChecked(false); setMiniResult(null);
  }
  function checkMini(answer: string) {
    if (!currentMini || miniChecked) return;
    const expected = miniMode === "en2zh" || miniMode === "choice" || miniMode === "listening" ? currentMini.meaning : currentMini.word;
    const correct = answer.trim().toLowerCase() === expected.trim().toLowerCase();
    setMiniResult(correct); setMiniChecked(true); if (correct) setMiniScore((s) => s + 1);
  }

  useEffect(() => {
    if (!activeId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
                { key: "mini", label: "測一測我會哪些", icon: "✎" },
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
                          <Button size="sm" variant="ghost" onClick={() => speak(detail.words[flashIndex]?.word ?? "")}>🔊 朗讀</Button>
                          {flipped && (
                        <>
                          <p className="mt-1 text-[#37d3ff]">{detail.words[flashIndex]?.meaning}</p>
                          <p className="mt-1 text-xs text-muted">{detail.words[flashIndex]?.example}</p>
                        </>
                          )}
                          {showMore && (
                            <div className="mt-2 rounded-xl bg-white/5 p-3 text-left text-xs">
                              <p className="font-semibold text-[#f9c74f]">更多單字知識</p>
                              <p className="mt-1">易錯提醒：注意這個字與相近拼字或相似意思單字在語境中的差異。</p>
                              <p className="mt-1">文法／搭配：{grammarHint(detail.words[flashIndex]?.example ?? "")}</p>
                              <p className="mt-1 text-muted">建議：先看英文例句，再嘗試用自己的句子重述。</p>
                            </div>
                          )}
                          <div className="mt-3 flex justify-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setFlipped((f) => !f)}>
                          {flipped ? "隱藏" : "看中文"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowMore((v) => !v)}>{showMore ? "收起" : "看更多"}</Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setFlipped(false);
                            setShowMore(false);
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
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">
                        {w.word} <Badge tone="violet">{detail.week.highlightMap[w.highlightColor] ?? w.highlightColor}</Badge>
                      </p><Button size="sm" variant="ghost" onClick={() => speak(w.word)}>🔊</Button></div>
                      <p className="text-xs text-muted">{w.meaning}</p>
                      {w.example && <p className="mt-1 text-[11px] text-muted">{w.example}</p>}
                      <p className="mt-2 text-[11px] text-muted">易錯／文法：{grammarHint(w.example)}</p>
                    </div>
                  ))}
                  {!detail.words.length && <EmptyState icon="⌁" title="本週尚未發布單字" />}
                </div>
              )}

              {tab === "sentences" && (
                <div className="space-y-2">
                  {detail.sentences.map((s) => (
                    <div key={s.id} className="glass-soft p-3">
                      <div className="flex items-start justify-between gap-2"><p className="text-sm">{s.en}</p><Button size="sm" variant="ghost" onClick={() => speak(s.en)}>🔊 英文</Button></div>
                      <div className="mt-1 flex items-start justify-between gap-2"><p className="text-xs text-muted">{s.zh}</p><Button size="sm" variant="ghost" onClick={() => speak(s.zh, "zh-TW")}>🔊 中文</Button></div>
                    </div>
                  ))}
                  {!detail.sentences.length && <EmptyState icon="◌" title="本週尚未發布句子" />}
                </div>
              )}

              {tab === "mini" && (
                <div className="space-y-3">
                  <div className="glass-soft p-3">
                    <p className="text-sm font-semibold">✎ 測一測我會哪些</p>
                    <p className="mt-1 text-xs text-muted">從本週單字隨機抽題，檢查你能不能看懂、拼出、聽出並活用單字。</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["choice", "zh2en", "en2zh", "handwriting", "listening"] as MiniMode[]).map((mode) => (
                        <Button key={mode} size="sm" variant={miniMode === mode ? "primary" : "ghost"} onClick={() => resetMini(mode)}>
                          {mode === "choice" ? "選擇" : mode === "zh2en" ? "中翻英" : mode === "en2zh" ? "英翻中" : mode === "handwriting" ? "手寫" : "聽力"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {!detail.words.length && <EmptyState icon="✎" title="目前沒有可測驗的本週單字" />}
                  {detail.words.length > 0 && !miniStarted && <Button onClick={() => resetMini()}>開始測驗</Button>}
                  {miniStarted && currentMini && (
                    <div className="glass-soft p-4">
                      <div className="flex items-center justify-between text-xs text-muted"><span>第 {miniIndex + 1}/{miniQuestions.length} 題</span><span>目前得分 {miniScore}</span></div>
                      <p className="mt-4 text-center text-2xl font-bold">{miniMode === "zh2en" || miniMode === "handwriting" ? currentMini.meaning : currentMini.word}</p>
                      {miniMode === "listening" && <div className="mt-3 text-center"><Button onClick={() => speak(currentMini.word)}>🔊 播放聽力</Button><p className="mt-2 text-xs text-muted">聽完後選出正確中文意思</p></div>}
                      {miniMode === "choice" || miniMode === "listening" ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">{currentMini.options.map((option: string) => <Button key={option} variant={miniChecked && option === currentMini.meaning ? "primary" : "ghost"} onClick={() => checkMini(option)}>{option}</Button>)}</div>
                      ) : (
                        <div className="mt-4 flex gap-2"><Input value={miniInput} onChange={(e) => setMiniInput(e.target.value)} placeholder={miniMode === "en2zh" ? "輸入中文意思" : "輸入英文答案"} onKeyDown={(e) => { if (e.key === "Enter") checkMini(miniInput); }} /><Button onClick={() => checkMini(miniInput)}>作答</Button></div>
                      )}
                      {miniChecked && <div className={`mt-3 rounded-xl p-3 text-sm ${miniResult ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}><p>{miniResult ? "答對了！" : `再複習一下：${currentMini.word} — ${currentMini.meaning}`}</p>{currentMini.example && <p className="mt-1 text-xs text-muted">例句：{currentMini.example}</p>}<Button size="sm" className="mt-2" onClick={() => { if (miniIndex + 1 >= miniQuestions.length) { setMiniStarted(false); toast.push("success", `測驗完成！得分 ${miniScore + (miniResult ? 0 : 0)}/${miniQuestions.length}`); } else { setMiniIndex((i) => i + 1); setMiniInput(""); setMiniChecked(false); setMiniResult(null); } }}>下一題</Button></div>}
                    </div>
                  )}
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
