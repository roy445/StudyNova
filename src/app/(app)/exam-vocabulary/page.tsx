"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Select, Skeleton, useToast } from "@/components/ui";
import { apiGet, useApi } from "@/lib/api";

type Catalog = { enabled: boolean; totalItems: number; sets: Array<{ id: string; title: string; description: string; examLabel: string; itemCount: number; unitCount: number }> };
type Item = { id: string; unitId: string; word: string; meaning: string; partOfSpeech: string; phonetic: string; phrase: string; phraseMeaning: string; example: string; exampleZh: string };
type Detail = { set: Catalog["sets"][number]; units: Array<{ id: string; title: string; description: string }>; items: Item[] };
type Mode = "cards" | "memory" | "zh2en" | "en2zh" | "context";

const modeLabels: Array<[Mode, string, string]> = [["cards", "瀏覽", "快速掃描全部內容"], ["memory", "記憶卡", "翻面建立記憶"], ["zh2en", "中翻英", "主動回想英文"], ["en2zh", "英翻中", "確認理解程度"], ["context", "情境練習", "放進句子裡學會"]];

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(text);
  voice.lang = "en-US";
  voice.rate = 0.86;
  window.speechSynthesis.speak(voice);
}

export default function ExamVocabularyPage() {
  const toast = useToast();
  const catalog = useApi<Catalog>("/exam-vocabulary/catalog");
  const [selectedSet, setSelectedSet] = useState("");
  const detail = useApi<Detail>(selectedSet ? `/exam-vocabulary/${selectedSet}` : null, [selectedSet]);
  const [unit, setUnit] = useState("all");
  const [mode, setMode] = useState<Mode>("cards");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const items = useMemo(() => (detail.data?.items ?? []).filter((item) => (unit === "all" || item.unitId === unit) && (!search.trim() || `${item.word} ${item.meaning} ${item.phrase}`.toLowerCase().includes(search.trim().toLowerCase()))), [detail.data, unit, search]);
  const current = items[index % Math.max(items.length, 1)];
  const mastery = items.length ? Math.round((items.filter((item) => known.has(item.id)).length / items.length) * 100) : 0;
  const resetCard = () => { setRevealed(false); setAnswer(""); setFeedback(null); };
  const selectSet = (id: string) => { setSelectedSet(id); setIndex(0); setUnit("all"); setSearch(""); resetCard(); };
  const next = () => { setIndex((value) => (value + 1) % Math.max(items.length, 1)); resetCard(); };
  const previous = () => { setIndex((value) => (value - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1)); resetCard(); };
  const mark = (isKnown: boolean) => {
    if (!current) return;
    setKnown((value) => { const nextValue = new Set(value); if (isKnown) nextValue.add(current.id); else nextValue.delete(current.id); return nextValue; });
    toast.push(isKnown ? "success" : "info", isKnown ? "已加入熟悉清單" : "保留在待複習清單");
    next();
  };
  const check = () => {
    if (!current) return;
    const typed = answer.trim().toLowerCase();
    const expected = mode === "zh2en" ? current.word.toLowerCase() : current.meaning.toLowerCase();
    const ok = mode === "zh2en" ? typed === expected : expected.includes(typed) && typed.length > 0;
    setFeedback(ok ? "答對了，這個字已經開始留下來。" : `再看一次：${mode === "zh2en" ? current.word : current.meaning}`);
    if (ok) setKnown((value) => new Set(value).add(current.id));
  };
  if (catalog.loading) return <Skeleton lines={8} />;
  if (catalog.error) return <ErrorState message={catalog.error} onRetry={catalog.reload} />;
  if (!catalog.data?.enabled) return <EmptyState icon="▣" title="英文段考總單字尚在準備中" hint="內容開放後，這裡會出現你的專屬複習空間。" />;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-5 overflow-hidden pb-12">
    <section className="relative overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_88%_12%,rgba(55,211,255,.24),transparent_28%),radial-gradient(circle_at_12%_100%,rgba(124,92,255,.23),transparent_34%),linear-gradient(135deg,#0b1732,#11152f 55%,#171334)] p-5 shadow-[0_20px_80px_rgba(7,15,45,.45)] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-cyan-200/10" /><div className="pointer-events-none absolute right-8 top-10 h-32 w-32 rounded-full border border-violet-200/10" />
      <p className="text-[11px] font-bold uppercase tracking-[.32em] text-cyan-200/80">STUDYNOVA · ENGLISH LAB</p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">把單字，變成你的直覺。</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">一個不只是列表的段考單字中心。先理解、再回想、放進情境，讓每次練習都留下進步。</p></div><div className="grid grid-cols-3 gap-2 sm:min-w-[300px]"><div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-2xl font-black text-cyan-100">{catalog.data.totalItems}</p><p className="mt-1 text-[11px] text-slate-400">全站單字</p></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-2xl font-black text-violet-100">{catalog.data.sets.length}</p><p className="mt-1 text-[11px] text-slate-400">段考範圍</p></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-2xl font-black text-amber-100">{mastery}%</p><p className="mt-1 text-[11px] text-slate-400">本輪熟悉度</p></div></div></div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{catalog.data.sets.map((set) => <button key={set.id} onClick={() => selectSet(set.id)} className={`min-w-[220px] rounded-2xl border p-4 text-left transition ${selectedSet === set.id ? "border-cyan-200/70 bg-cyan-200/15 shadow-[0_0_24px_rgba(55,211,255,.14)]" : "border-white/10 bg-white/[.04] hover:border-cyan-200/40"}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-bold text-white">{set.title}</span><span className="text-cyan-200">↗</span></div><p className="mt-2 text-xs text-slate-400">{set.examLabel} · {set.unitCount} 單元 · {set.itemCount} 字</p></button>)}</div>
    </section>
    {!selectedSet && <EmptyState icon="⌁" title="選一個段考範圍開始" hint="選好後，你會看到單元地圖、學習卡片與練習模式。" />}
    {detail.loading && <Skeleton lines={8} />}
    {detail.data && <>
      <section className="grid gap-3 sm:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200/75">YOUR LEARNING PATH</p><h2 className="mt-1 text-xl font-black text-white">{detail.data.set.title}</h2></div><a className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-cyan-200/50" href={`/api/v1/exam-vocabulary/${selectedSet}/pdf`} target="_blank" rel="noreferrer">下載總覽</a></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-all" style={{ width: `${mastery}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{known.size} 個已熟悉</span><span>{items.length} 個目前範圍</span></div></div><div className="rounded-2xl border border-amber-200/15 bg-amber-100/[.04] p-4"><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-100/80">TODAY'S FOCUS</p><p className="mt-2 text-sm leading-6 text-slate-200">每次只攻克一小段，完成後再挑戰下一個單元。</p><div className="mt-3 flex items-center gap-2 text-xs text-amber-100"><span className="text-lg">◈</span> 建議先用「記憶卡」暖身</div></div></section>
      <section className="rounded-2xl border border-white/10 bg-[#0b1228]/80 p-3 sm:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 flex-1 flex-wrap gap-2"><Select value={unit} onChange={(e) => { setUnit(e.target.value); setIndex(0); resetCard(); }}><option value="all">全部範圍 · {detail.data.items.length} 字</option>{detail.data.units.map((item) => <option key={item.id} value={item.id}>{item.title} · {detail.data?.items.filter((word) => word.unitId === item.id).length ?? 0} 字</option>)}</Select><input value={search} onChange={(e) => { setSearch(e.target.value); setIndex(0); }} placeholder="搜尋單字、中文或片語" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/60" /></div><div className="flex gap-1 overflow-x-auto">{modeLabels.map(([key, label]) => <button key={key} onClick={() => { setMode(key); resetCard(); }} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs transition ${mode === key ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}>{label}</button>)}</div></div></section>
      {current ? <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"><div className="overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_80%_0%,rgba(55,211,255,.12),transparent_35%),linear-gradient(145deg,#111c3d,#0d142c)] p-5 shadow-[0_18px_60px_rgba(3,11,36,.4)] sm:p-8"><div className="flex items-center justify-between text-xs text-slate-400"><span className="rounded-full border border-cyan-200/20 px-3 py-1 text-cyan-100">{String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span><button onClick={() => speak(current.word)} className="rounded-xl border border-white/10 px-3 py-2 text-cyan-100 transition hover:border-cyan-200/60">朗讀 ↗</button></div>{mode === "context" ? <div className="mt-8"><p className="text-xs font-bold uppercase tracking-[.25em] text-violet-200/80">CONTEXT MODE</p><p className="mt-4 text-xl font-semibold leading-9 text-white">{current.example || `The teacher asked us to understand the meaning of “${current.word}”.`}</p><p className="mt-5 rounded-2xl border border-violet-200/15 bg-violet-100/[.05] p-4 text-sm text-violet-100">線索：{current.meaning || current.word}</p></div> : <button className="mt-8 w-full text-left" onClick={() => setRevealed((value) => !value)}><p className="break-words text-4xl font-black tracking-tight text-white sm:text-6xl">{mode === "zh2en" ? current.meaning || "中文意義" : current.word}</p><p className="mt-4 text-sm text-cyan-100/70">{current.phonetic || "尚未提供音標"} {current.partOfSpeech && ` · ${current.partOfSpeech}`}</p>{(revealed || mode === "cards") && <div className="mt-10 border-t border-white/10 pt-6"><p className="break-words text-2xl font-bold text-amber-100">{mode === "en2zh" || mode === "cards" || mode === "memory" ? current.meaning : current.word}</p>{current.phrase && <p className="mt-4 break-words text-sm text-cyan-100">片語 · {current.phrase}{current.phraseMeaning && ` · ${current.phraseMeaning}`}</p>}{current.example && <p className="mt-4 break-words text-sm leading-7 text-slate-300">{current.example}{current.exampleZh && <span className="block text-slate-500">{current.exampleZh}</span>}</p>}</div>}</button>}{(mode === "zh2en" || mode === "en2zh") && <div className="mt-8 flex gap-2"><input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder={mode === "zh2en" ? "輸入英文答案" : "輸入中文意思"} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-cyan-200" /><Button onClick={check}>檢查</Button></div>}{feedback && <p className={`mt-4 rounded-2xl border p-4 text-sm ${feedback.startsWith("答對") ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100" : "border-amber-200/20 bg-amber-300/10 text-amber-100"}`}>{feedback}</p>}<div className="mt-8 flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" onClick={previous}>← 上一個</Button><div className="flex gap-2"><Button variant="outline" onClick={() => mark(false)}>待複習</Button><Button onClick={() => mark(true)}>我會了</Button></div><Button variant="ghost" onClick={next}>下一個 →</Button></div></div><aside className="space-y-3"><div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200/70">MODES</p><div className="mt-3 space-y-2">{modeLabels.map(([key, label, hint]) => <button key={key} onClick={() => { setMode(key); resetCard(); }} className={`w-full rounded-xl p-3 text-left transition ${mode === key ? "bg-cyan-200/15 text-cyan-100" : "text-slate-400 hover:bg-white/5"}`}><span className="text-sm font-semibold">{label}</span><span className="mt-1 block text-[11px] text-slate-500">{hint}</span></button>)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200/70">UNIT MAP</p><div className="mt-3 space-y-2">{detail.data.units.slice(0, 6).map((item) => { const count = detail.data?.items.filter((word) => word.unitId === item.id).length ?? 0; return <button key={item.id} onClick={() => { setUnit(item.id); setIndex(0); resetCard(); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${unit === item.id ? "bg-violet-200/15 text-violet-100" : "text-slate-400 hover:bg-white/5"}`}><span className="truncate">{item.title}</span><span>{count}</span></button>; })}</div></div></aside></section> : <EmptyState title="這個範圍尚無單字" hint="內容準備完成後，會在這裡出現。" />}
    </>}
  </div>;
}
