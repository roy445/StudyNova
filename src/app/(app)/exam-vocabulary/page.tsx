"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Select, Skeleton, useToast } from "@/components/ui";
import { apiGet, useApi } from "@/lib/api";

type Catalog = { enabled: boolean; totalItems: number; sets: Array<{ id: string; title: string; description: string; examLabel: string; itemCount: number; unitCount: number }> };
type Item = { id: string; unitId: string; word: string; meaning: string; partOfSpeech: string; phonetic: string; phrase: string; phraseMeaning: string; example: string; exampleZh: string };
type Detail = { set: Catalog["sets"][number]; units: Array<{ id: string; title: string; description: string }>; items: Item[] };
type Mode = "cards" | "memory" | "zh2en" | "en2zh" | "context";

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
  const items = useMemo(() => (detail.data?.items ?? []).filter((item) => unit === "all" || item.unitId === unit), [detail.data, unit]);
  const current = items[index % Math.max(items.length, 1)];
  const next = () => { setIndex((value) => (value + 1) % Math.max(items.length, 1)); setRevealed(false); setAnswer(""); setFeedback(null); };
  const check = () => {
    if (!current) return;
    const typed = answer.trim().toLowerCase();
    const expected = mode === "zh2en" ? current.word.toLowerCase() : current.meaning;
    const ok = mode === "zh2en" ? typed === expected : expected.includes(answer.trim());
    setFeedback(ok ? "答對了！" : `答案：${mode === "zh2en" ? current.word : current.meaning}`);
  };
  if (catalog.loading) return <Skeleton lines={8} />;
  if (catalog.error) return <ErrorState message={catalog.error} onRetry={catalog.reload} />;
  if (!catalog.data?.enabled) return <EmptyState icon="▣" title="英文段考總單字尚在準備中" hint="管理員開放後，這裡會顯示單元與段考全範圍。你可以先使用其他學習功能。" />;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-5 overflow-hidden pb-8">
    <Card className="overflow-hidden border-cyan-300/30 bg-gradient-to-br from-cyan-300/10 via-violet-300/10 to-transparent" title="英文段考總單字" subtitle="分單元上傳、段考全範圍總覽；可用單字卡、記憶卡與仿學測情境練習。">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><Badge tone="cyan">共 {catalog.data.totalItems} 字</Badge><span className="text-xs text-muted">不是網頁列印：可下載含 StudyNova Logo 與浮水印的正式 PDF 總覽。</span></div>
      <div className="mt-4 flex min-w-0 flex-wrap gap-2">{catalog.data.sets.map((set) => <button key={set.id} onClick={() => { setSelectedSet(set.id); setIndex(0); setUnit("all"); }} className={`min-w-0 flex-1 rounded-2xl border p-4 text-left transition sm:min-w-[240px] ${selectedSet === set.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-[var(--line)] bg-white/[.03] hover:bg-white/[.06]"}`}><p className="truncate font-bold">{set.title}</p><p className="mt-1 text-xs text-muted">{set.examLabel}・{set.unitCount} 單元・{set.itemCount} 字</p></button>)}</div>
    </Card>
    {!selectedSet && <EmptyState icon="▣" title="請選擇一個段考範圍" hint="選擇後可以切換單元，或直接選擇「全部段考範圍」總覽。" />}
    {detail.loading && <Skeleton lines={8} />}
    {detail.data && <>
      <Card title={detail.data.set.title} subtitle={detail.data.set.description || "段考全範圍學習中心"} action={<a className="rounded-xl border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10" href={`/api/v1/exam-vocabulary/${selectedSet}/pdf`} target="_blank" rel="noreferrer">下載 PDF 總覽</a>}>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><Select value={unit} onChange={(e) => { setUnit(e.target.value); setIndex(0); }}><option value="all">全部段考範圍（{detail.data.items.length} 字）</option>{detail.data.units.map((item) => <option key={item.id} value={item.id}>{item.title}（{detail.data?.items.filter((word) => word.unitId === item.id).length ?? 0} 字）</option>)}</Select><div className="flex min-w-0 flex-wrap gap-2">{([ ["cards", "單字卡"], ["memory", "記憶卡"], ["zh2en", "中翻英"], ["en2zh", "英翻中"], ["context", "仿學測情境"]] as const).map(([key, label]) => <Button key={key} size="sm" variant={mode === key ? "gold" : "ghost"} onClick={() => { setMode(key); setRevealed(false); setFeedback(null); }}>{label}</Button>)}</div></div>
      </Card>
      {current ? <Card className="overflow-hidden" title={`${index + 1} / ${items.length}`} subtitle={mode === "context" ? "請依語境判斷最適合的單字或片語" : "按一下翻面，先回想再查看答案"}>
        {mode === "context" ? <div className="rounded-2xl border border-violet-300/30 bg-violet-300/10 p-5"><p className="text-sm text-muted">情境題：在下列句子中，最適合填入哪個字？</p><p className="mt-4 break-words text-lg leading-9">{current.example || `The teacher asked us to understand the meaning of “${current.word}”.`}</p><p className="mt-3 text-sm text-cyan-100">提示：{current.meaning || current.word}</p></div> : <button className="w-full min-w-0 rounded-3xl border border-cyan-300/30 bg-gradient-to-br from-[#17294a] to-[#10172e] p-8 text-left shadow-2xl transition hover:border-cyan-200/60" onClick={() => setRevealed((value) => !value)}><p className="break-words text-3xl font-black tracking-wide text-cyan-100">{mode === "zh2en" ? current.meaning || "中文意義" : current.word}</p><p className="mt-3 break-words text-sm text-muted">{current.phonetic} {current.partOfSpeech && `・${current.partOfSpeech}`}</p>{(revealed || mode === "cards") && <div className="mt-8 border-t border-white/10 pt-5"><p className="break-words text-xl font-bold text-amber-100">{mode === "en2zh" || mode === "cards" || mode === "memory" ? current.meaning : current.word}</p>{current.phrase && <p className="mt-3 break-words text-sm text-cyan-100">片語：{current.phrase} {current.phraseMeaning && `｜${current.phraseMeaning}`}</p>}{current.example && <p className="mt-3 break-words text-sm leading-7 text-muted">例句：{current.example}{current.exampleZh && `（${current.exampleZh}）`}</p>}</div>}</button>}
        {(mode === "zh2en" || mode === "en2zh") && <div className="mt-4 flex min-w-0 flex-wrap gap-2"><input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="輸入答案後按檢查" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-300" /><Button onClick={check}>檢查</Button></div>}
        {feedback && <p className={`mt-3 rounded-xl p-3 text-sm ${feedback.startsWith("答對") ? "bg-emerald-300/10 text-emerald-100" : "bg-amber-300/10 text-amber-100"}`}>{feedback}</p>}
        <div className="mt-5 flex justify-between gap-2"><Button variant="ghost" onClick={() => { setIndex((value) => (value - 1 + items.length) % items.length); setRevealed(false); }}>上一個</Button><Button onClick={next}>下一個</Button></div>
      </Card> : <EmptyState title="這個範圍尚無單字" hint="請管理員從後台上傳圖片或片語資料。" />}
    </>}
  </div>;
}
