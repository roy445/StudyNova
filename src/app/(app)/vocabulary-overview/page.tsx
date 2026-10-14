"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Select, Skeleton, useToast } from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";

type Level = { id: "junior" | "senior"; label: string; description: string; count: number; target: number };
type Word = { id: string; word: string; meaning: string; meanings?: string[]; phrases?: string[]; partOfSpeech: string; phonetic: string; example: string; exampleZh: string; familiarity: number; correctCount: number; wrongCount: number };
type Catalog = { levels: Level[] };
type WordResponse = { level: string; letter: string; count: number; words: Word[] };
type DisplayMode = "overview" | "card";
type StudyMode = "learn" | "zh2en" | "en2zh";

const LETTERS = ["all", ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))];

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(text);
  voice.lang = "en-US";
  voice.rate = 0.86;
  window.speechSynthesis.speak(voice);
}

export default function VocabularyOverviewPage() {
  const toast = useToast();
  const catalog = useApi<Catalog>("/vocabulary-overview/catalog");
  const [level, setLevel] = useState<"junior" | "senior">("junior");
  const [letter, setLetter] = useState("all");
  const wordsApi = useApi<WordResponse>(`/vocabulary-overview/${level}?letter=${letter}`, [level, letter]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("overview");
  const [studyMode, setStudyMode] = useState<StudyMode>("learn");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [aiWordId, setAiWordId] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const words = wordsApi.data?.words ?? [];
  const current = words[index % Math.max(words.length, 1)];
  const selectedLevel = catalog.data?.levels.find((item) => item.id === level);

  useEffect(() => { setIndex(0); setRevealed(false); setAiWordId(null); setAiReply(""); }, [level, letter]);

  const progressText = useMemo(() => {
    if (!current) return "尚無單字";
    return `${index + 1} / ${words.length}`;
  }, [current, index, words.length]);

  const next = () => { setIndex((value) => (value + 1) % Math.max(words.length, 1)); setRevealed(false); setAiReply(""); };
  const previous = () => { setIndex((value) => (value - 1 + words.length) % Math.max(words.length, 1)); setRevealed(false); setAiReply(""); };

  const askAi = async (word: Word) => {
    setAiBusy(true); setAiWordId(word.id); setAiReply("");
    const question = aiQuestion.trim() || `請用繁體中文解釋「${word.word}」的意思、詞性、常見搭配、記憶方法與一個適合學生的例句。`;
    try {
      const created = await apiPost<{ conversation: { id: string } }>("/ai/conversations", { title: `單字總覽：${word.word}`, mode: "teacher", allowContext: [] });
      const result = await apiPost<{ message: { content: string } }>(`/ai/conversations/${created.conversation.id}/messages`, { content: `${question}\n\n單字：${word.word}\n中文意思：${word.meaning}\n詞性：${word.partOfSpeech || "未標註"}\n例句：${word.example || "無"}`, featureKey: "learning_ai_chat" });
      setAiReply(result.message.content);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "AI 暫時無法回答"); }
    finally { setAiBusy(false); }
  };

  if (catalog.loading) return <Skeleton lines={8} />;
  if (catalog.error) return <ErrorState message={catalog.error} onRetry={catalog.reload} />;

  return <div className="mx-auto min-w-0 max-w-6xl space-y-5 overflow-hidden pb-8">
    <Card className="overflow-hidden border-cyan-300/35 bg-[radial-gradient(circle_at_90%_0%,rgba(55,211,255,.22),transparent_35%),linear-gradient(135deg,rgba(16,39,70,.98),rgba(23,15,52,.98))]">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-[.25em] text-cyan-200">VOCABULARY OVERVIEW</p><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">單字總覽</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">仿照英文段考總單字複習，依國中／高中與 A～Z 分類，支援單字卡、總覽、朗讀與 Novi AI 即時解釋。</p></div><Badge tone="cyan">{selectedLevel?.label ?? "單字學習"}</Badge></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{(catalog.data?.levels ?? []).map((item) => <button key={item.id} type="button" onClick={() => setLevel(item.id)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${level === item.id ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_28px_rgba(55,211,255,.16)]" : "border-white/10 bg-white/[.03] hover:border-cyan-300/35"}`}><div className="flex items-center justify-between gap-2"><b className="text-white">{item.label}</b><span className="text-cyan-200">→</span></div><p className="mt-1 text-xs text-muted">{item.description}</p><p className="mt-2 text-xs font-bold text-cyan-100">目前資料 {item.count.toLocaleString()} / 目標 {item.target.toLocaleString()}</p></button>)}</div>
    </Card>

    <Card title="選擇字母與學習模式" subtitle="切換字母會重新載入該分類的完整單字，不會只顯示示範資料。">
      <div className="flex flex-wrap gap-1.5">{LETTERS.map((item) => <button key={item} type="button" onClick={() => setLetter(item)} className={`min-w-9 rounded-lg border px-2.5 py-2 text-xs font-bold transition ${letter === item ? "border-cyan-300 bg-cyan-300/20 text-cyan-100" : "border-white/10 bg-white/[.03] text-muted hover:border-cyan-300/40"}`}>{item === "all" ? "全部" : item}</button>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><Select value={displayMode} onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}><option value="overview">總覽模式</option><option value="card">單字卡模式</option></Select>{displayMode === "card" && <div className="flex flex-wrap gap-2">{([ ["learn", "學習卡"], ["zh2en", "中翻英"], ["en2zh", "英翻中"] ] as const).map(([key, label]) => <Button key={key} size="sm" variant={studyMode === key ? "gold" : "ghost"} onClick={() => { setStudyMode(key); setRevealed(false); }}>{label}</Button>)}</div>}</div>
    </Card>

    {wordsApi.loading && <Skeleton lines={8} />}
    {wordsApi.error && <ErrorState message={wordsApi.error} onRetry={wordsApi.reload} />}
    {wordsApi.data && !words.length && <EmptyState icon="⌁" title={`${letter === "all" ? "這個程度" : `字母 ${letter}`} 尚無單字`} hint="請稍後再試，或切換其他程度與字母。" />}

    {current && displayMode === "overview" && <Card title={`總覽・${wordsApi.data?.count ?? words.length} 個單字`} subtitle="每張卡片都可以朗讀、查看例句並詢問 Novi AI。"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{words.map((word) => <article key={word.id} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.06] to-transparent p-4 transition hover:border-cyan-300/40"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-black text-cyan-100">{word.word}</h2>{word.phonetic && <p className="text-xs text-muted">{word.phonetic}</p>}<p className="mt-1 text-sm font-semibold text-amber-100">{word.meaning}</p>{word.partOfSpeech && <p className="mt-1 text-xs text-muted">{word.partOfSpeech}</p>}</div><button type="button" title={`朗讀 ${word.word}`} aria-label={`朗讀 ${word.word}`} onClick={() => speak(word.word)} className="rounded-lg border border-cyan-300/25 px-2 py-1.5 text-cyan-100 hover:bg-cyan-300/10">◉</button></div>{word.example && <div className="mt-3 rounded-xl bg-white/[.04] p-2 text-xs leading-5"><p>{word.example}</p>{word.exampleZh && <p className="text-muted">{word.exampleZh}</p>}<button type="button" onClick={() => speak(word.example)} className="mt-1 text-cyan-200 hover:underline">朗讀例句</button></div>}<button type="button" onClick={() => { setAiWordId(word.id); setAiQuestion(""); setAiReply(""); }} className="mt-3 rounded-lg border border-violet-300/25 px-2.5 py-1.5 text-xs text-violet-100 hover:bg-violet-300/10">詢問這個單字的 AI</button>{aiWordId === word.id && <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/[.06] p-3"><textarea value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} rows={2} placeholder="例如：如何記憶？和相似字有什麼不同？" className="w-full rounded-lg border border-white/10 bg-black/20 p-2 text-xs outline-none" /><Button size="sm" className="mt-2" loading={aiBusy} onClick={() => void askAi(word)}>詢問 Novi</Button>{aiReply && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-violet-50">{aiReply}</p>}</div>}</article>)}</div></Card>}

    {current && displayMode === "card" && <Card title={`${progressText}・${current.word}`} subtitle="點擊卡片翻面；每個單字都可朗讀或交給 AI 解釋。"><div className="flex justify-end"><button type="button" onClick={() => speak(current.word)} className="rounded-xl border border-cyan-300/25 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10">◉ 朗讀單字</button></div><button type="button" onClick={() => setRevealed((value) => !value)} className="mt-3 w-full rounded-[2rem] border border-cyan-300/30 bg-[radial-gradient(circle_at_18%_0%,rgba(112,224,255,.35),transparent_38%),linear-gradient(145deg,#315b8a,#273b70)] p-7 text-left shadow-[0_18px_70px_rgba(0,0,0,.28)] sm:p-10"><p className="text-xs font-bold tracking-[.22em] text-cyan-200">{studyMode === "zh2en" ? "中文提示" : "ENGLISH WORD"}</p><p className="mt-4 break-words text-3xl font-black text-white sm:text-5xl">{studyMode === "zh2en" ? current.meaning : current.word}</p><p className="mt-3 text-sm text-muted">{current.phonetic} {current.partOfSpeech && `・${current.partOfSpeech}`}</p>{(revealed || studyMode === "learn") && <div className="mt-8 border-t border-white/10 pt-5"><p className="text-2xl font-black text-amber-100">{studyMode === "zh2en" ? current.word : current.meaning}</p>{current.example && <p className="mt-3 text-sm leading-7 text-muted">{current.example}{current.exampleZh && `（${current.exampleZh}）`}</p>}</div>}</button>{(studyMode === "zh2en" || studyMode === "en2zh") && <p className="mt-3 text-xs text-muted">切換至總覽可直接查看完整例句與 AI 助教。</p>}<div className="mt-5 flex justify-between gap-2"><Button variant="ghost" onClick={previous}>上一個</Button><Button onClick={next}>下一個</Button></div><div className="mt-5 rounded-2xl border border-violet-300/20 bg-violet-300/[.05] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-violet-100">即時 AI 助教</p><Button size="sm" variant="outline" loading={aiBusy && aiWordId === current.id} onClick={() => void askAi(current)}>快速詢問</Button></div><input value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askAi(current); }} placeholder="例如：如何記憶、常見搭配、和相似字差異" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none" />{aiReply && aiWordId === current.id && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-violet-50">{aiReply}</p>}</div></Card>}
  </div>;
}
