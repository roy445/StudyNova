"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];

function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

type Word = { id: string; word: string; meaning: string; meanings?: string[]; phrases?: Array<{ en: string; zh: string }>; part_of_speech: string; example: string; example_zh: string; familiarity: number; memory_tip: string | null };

function fallbackExample(word: string, level?: string) {
  return level === "senior" ? `In the passage, the word “${word}” helps explain the writer's main idea.` : `I learned the word “${word}” in English class today.`;
}

export function WordsPanel({ track }: { track?: "junior" | "senior" } = {}) {
  const toast = useToast();
  const dailyPath = track ? `/words/daily?track=${track}` : "/words/daily";
  const { data, loading, error, reload } = useApi<{ words: Word[]; level: string; track?: string; count: number; dailyTarget?: number; appearedCount?: number; totalWords?: number; resetAt?: string }>(dailyPath, [track]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"card" | "zh2en" | "en2zh" | "spell" | "timed">("card");
  const [flipped, setFlipped] = useState(false);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [startedAt] = useState(() => Date.now());
  const [timeLeft, setTimeLeft] = useState(60);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [detailWord, setDetailWord] = useState<Word | null>(null);
  const touchStartX = useRef<number | null>(null);

  const words = data?.words ?? [];
  const current = words[index];

  useEffect(() => {
    if (mode !== "timed") return;
    const resetTimer = window.setTimeout(() => setTimeLeft(60), 0);
    const t = window.setInterval(() => setTimeLeft((v) => Math.max(0, v - 1)), 1000);
    return () => { window.clearTimeout(resetTimer); window.clearInterval(t); };
  }, [mode]);

  const answer = useCallback(
    async (correct: boolean) => {
      if (!current) return;
      setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      try {
        await apiPost("/words/answer", { wordId: current.id, correct, mode });
      } catch (err) {
        toast.push("error", errorMessage(err));
      }
      setFlipped(false);
      setInput("");
      setTip(null);
      if (index + 1 < words.length) setIndex(index + 1);
      else {
        try {
          const res = await apiPost<{ reward: { nova: number; xp: number } }>("/words/session-complete", {
            correct: stats.correct + (correct ? 1 : 0),
            total: stats.total + 1,
            seconds: Math.round((Date.now() - startedAt) / 1000),
          });
          toast.push("success", `完成今日單字！+${res.reward.nova} Nova / +${res.reward.xp} XP`);
        } catch (err) {
          toast.push("error", errorMessage(err));
        }
        setIndex(0);
        setStats({ correct: 0, total: 0 });
        toast.push("info", "今天的單字已完成，你仍可繼續回看與重練這 10 個單字。");
      }
    },
    [current, index, mode, startedAt, stats, toast, words.length],
  );

  if (loading) return <Card title="▤ 每日單字"><Skeleton lines={4} /></Card>;
  if (error) return <Card title="▤ 每日單字"><ErrorState message={error} onRetry={reload} /></Card>;
  if (!current) return <Card title="▤ 每日 10 個單字"><EmptyState icon="□" title="題庫正在準備中" hint="請稍後再試；如果持續沒有單字，請按瀏覽器重新整理或聯絡管理員。" action={<Button size="sm" onClick={() => reload()}>重新載入</Button>} /></Card>;

  return (
    <Card
      title="▤ 每日 10 個單字"
      subtitle={`${track === "senior" ? "高中 7000 單" : track === "junior" ? "國中 2000 單" : `程度 ${data?.level}`}・每日 ${data?.dailyTarget ?? words.length} 個・目前第 ${index + 1}/${words.length} 個・答對 ${stats.correct}/${stats.total}`}
      action={
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="!w-auto !py-1.5 text-xs">
          <option value="card">單字卡</option>
          <option value="en2zh">英 → 中</option>
          <option value="zh2en">中 → 英</option>
          <option value="spell">拼寫</option>
          <option value="timed">限時挑戰</option>
        </Select>
      }
    >
      <div className="mb-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span>已出現過 {data?.appearedCount ?? words.length} / 共 {data?.totalWords ?? words.length} 個單字</span><span className="text-muted">每日 {data?.resetAt ?? "00:00（台灣時間）"} 重置</span></div><Progress value={data?.appearedCount ?? words.length} max={data?.totalWords ?? words.length} tone="cyan" /><p className="mt-1 text-muted">已出現的單字會保留在「學習中心 → 字詞百科」，每天慢慢解鎖新單字。</p></div>
      {mode === "timed" && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Badge tone={timeLeft < 15 ? "rose" : "cyan"}>剩餘 {timeLeft}s</Badge>
          <Progress value={timeLeft} max={60} tone={timeLeft < 15 ? "gold" : "cyan"} />
        </div>
      )}

      <section className="mb-3 rounded-2xl border border-[#37d3ff]/30 bg-gradient-to-br from-[#37d3ff]/10 to-[#7c5cff]/10 p-4" aria-label="目前單字詳細資訊">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7dd3fc]">目前單字・第 {index + 1} 題</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"><h2 className="break-words text-2xl font-extrabold tracking-tight">{current.word}</h2><span className="text-xs text-muted">{current.part_of_speech || "單字"}</span></div>
            <p className="mt-1 text-base font-semibold text-[#7dd3fc]">{current.meaning || "尚未補上中文釋義"}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { if (!speak(current.word)) toast.push("error", "此瀏覽器不支援語音"); }}>🔊 朗讀</Button>
        </div>
        {current.meanings && current.meanings.length > 1 && <div className="mt-3"><p className="text-[11px] font-semibold text-muted">一字多意</p><div className="mt-1 flex flex-wrap gap-1.5">{current.meanings.slice(0, 6).map((meaning) => <span key={meaning} className="rounded-lg bg-white/10 px-2 py-1 text-xs">{meaning}</span>)}</div></div>}
        {current.phrases?.length ? <div className="mt-3"><p className="text-[11px] font-semibold text-muted">常用片語</p><div className="mt-1 grid gap-1.5 sm:grid-cols-2">{current.phrases.slice(0, 4).map((phrase) => <div key={`${phrase.en}-${phrase.zh}`} className="rounded-lg bg-black/15 px-2.5 py-1.5 text-xs"><span className="font-medium">{phrase.en}</span><span className="ml-1 text-muted">{phrase.zh}</span></div>)}</div></div> : null}
        {(current.example || current.example_zh) && <div className="mt-3 rounded-xl bg-black/15 px-3 py-2 text-xs leading-5"><p className="text-muted">例句</p>{current.example && <p>{current.example}</p>}{current.example_zh && <p className="text-muted">{current.example_zh}</p>}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => setDetailWord(current)}>查看完整解析</Button><span className="text-[11px] text-muted">熟悉度 {current.familiarity}%・點擊下方單字可切換</span></div>
      </section>

      <ol className="mb-3 space-y-2" aria-label="今日單字清單">
        {words.map((word, wordIndex) => (
          <li key={word.id}>
            <button
              type="button"
              onClick={() => { setIndex(wordIndex); setFlipped(false); setTip(null); setDetailWord(word); }}
              className={`w-full rounded-xl border p-3 text-left transition ${wordIndex === index ? "border-[#37d3ff]/60 bg-[#37d3ff]/10" : "border-[var(--line)] bg-black/10 hover:border-[#37d3ff]/40"}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 min-w-5 text-xs font-semibold text-muted">{wordIndex + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <strong className="text-base text-[var(--text)]">{word.word}</strong>
                    <span className="text-xs text-muted">{word.part_of_speech}</span>
                    <span className="text-sm text-[#7dd3fc]">{word.meaning}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{word.example || fallbackExample(word.word, data?.level)}</span>
                  <span className="block text-xs leading-relaxed text-muted">{word.example_zh || "我今天在課堂上學會了這個單字。"}</span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ol>

      <div
        className="glass-soft flex min-h-[190px] touch-pan-y select-none flex-col items-center justify-center gap-2 p-5 text-center"
        onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartX.current = null;
          if (start === null || end === null || Math.abs(end - start) < 55) return;
          setFlipped(false); setTip(null); setDetailWord(null);
          setIndex((value) => end < start ? Math.min(value + 1, words.length - 1) : Math.max(value - 1, 0));
        }}
      >
        {mode === "zh2en" ? (
          <>
            <p className="text-lg font-semibold">{current.meaning}</p>
            {flipped && <p className="text-2xl font-bold text-[#37d3ff]">{current.word}</p>}
          </>
        ) : (
          <>
            <p className="text-3xl font-extrabold tracking-tight">{current.word}</p>
            <p className="text-xs text-muted">{current.part_of_speech}</p>
            {(flipped || mode === "card") && mode !== "spell" && <p className="text-lg text-[#37d3ff]">{flipped ? current.meaning : "　"}</p>}
          </>
        )}
        {flipped && (current.example || current.word) && (
          <div className="mt-1 text-xs text-muted">
            <p>{current.example || fallbackExample(current.word, data?.level)}</p>
            <p>{current.example_zh || "我今天在課堂上學會了這個單字。"}</p>
          </div>
        )}
        {tip && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-black/30 p-2 text-left text-xs text-muted">{tip}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <Progress value={current.familiarity} tone="green" />
          <span className="shrink-0 text-[11px] text-muted">熟悉度 {current.familiarity}%</span>
        </div>
      </div>

      {mode === "spell" || mode === "zh2en" ? (
        <div className="mt-3 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="輸入英文單字" onKeyDown={(e) => e.key === "Enter" && answer(input.trim().toLowerCase() === current.word.toLowerCase())} />
          <Button onClick={() => answer(input.trim().toLowerCase() === current.word.toLowerCase())}>送出</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setFlipped((f) => !f)}>
            {flipped ? "隱藏答案" : "顯示答案"}
          </Button>
          <Button variant="ghost" onClick={() => { if (!speak(current.word)) toast.push("error", "此瀏覽器不支援語音"); }}>
            朗讀
          </Button>
          <Button onClick={() => answer(true)}>我記得</Button>
          <Button variant="outline" onClick={() => answer(false)}>
            還不熟
          </Button>
        </div>
      )}

      <Modal open={Boolean(detailWord)} onClose={() => setDetailWord(null)} title={detailWord?.word ?? "單字詳情"} fullScreen>
        {detailWord && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="cyan">{detailWord.part_of_speech}</Badge>
              <Badge tone="muted">熟悉度 {detailWord.familiarity}%</Badge>
              <Button size="sm" variant="ghost" onClick={() => { if (!speak(detailWord.word)) toast.push("error", "此瀏覽器不支援語音"); }}>朗讀</Button>
            </div>
            <section className="rounded-2xl border border-[#37d3ff]/20 bg-[#37d3ff]/10 p-3.5">
              <p className="text-xs text-muted">主要中文</p>
              <p className="mt-1 text-lg font-semibold text-[#7dd3fc]">{detailWord.meaning || "尚未補上中文釋義"}</p>
            </section>
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">一字多意</p>
              <div className="space-y-1.5">
                {(detailWord.meanings?.length ? detailWord.meanings : [detailWord.meaning]).filter(Boolean).map((meaning, meaningIndex) => (
                  <div key={`${meaning}-${meaningIndex}`} className="rounded-xl bg-white/5 px-3 py-2 text-sm">{meaning}</div>
                ))}
              </div>
            </section>
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">相關片語與中文</p>
              {detailWord.phrases?.length ? (
                <div className="space-y-1.5">
                  {detailWord.phrases.map((phrase) => <div key={`${phrase.en}-${phrase.zh}`} className="rounded-xl border border-[var(--line)] px-3 py-2"><p className="text-sm font-medium text-[#e8edff]">{phrase.en}</p><p className="mt-0.5 text-xs text-muted">{phrase.zh}</p></div>)}
                </div>
              ) : <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-muted">這個單字目前沒有整理到常用片語。</p>}
            </section>
            <section className="rounded-xl bg-black/20 p-3 text-sm"><p className="text-xs text-muted">例句</p><p className="mt-1">{detailWord.example || fallbackExample(detailWord.word, data?.level)}</p><p className="mt-0.5 text-muted">{detailWord.example_zh || "我今天在課堂上學會了這個單字。"}</p></section>
          </div>
        )}
      </Modal>

      <div className="mt-2">
        <Button
          size="sm"
          variant="ghost"
          loading={tipLoading}
          onClick={async () => {
            setTipLoading(true);
            try {
              const res = await apiPost<{ tip: string }>("/words/memory-tip", { wordId: current.id });
              setTip(res.tip);
            } catch (err) {
              toast.push("error", errorMessage(err));
            } finally {
              setTipLoading(false);
            }
          }}
        >
          ✦ 記憶方法
        </Button>
      </div>
    </Card>
  );
}

type PersonalWord = { id: string; word: string; meaning: string; partOfSpeech: string; phonetic: string; example: string; exampleZh: string; analysis: Record<string, unknown>; familiarity: number; reviewCount: number; updatedAt: string };

export function MyVocabularyPanel() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<PersonalWord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newWord, setNewWord] = useState({ word: "", meaning: "", partOfSpeech: "", phonetic: "", example: "", exampleZh: "" });
  const { data, loading, error, reload } = useApi<{ items: PersonalWord[]; total: number }>(`/my-vocabulary?q=${encodeURIComponent(q)}`, [q]);
  const items = (data?.items ?? []).filter((item) => filter === "all" || filter === "new" && item.familiarity < 40 || filter === "review" && item.familiarity >= 40 && item.familiarity < 80 || filter === "mastered" && item.familiarity >= 80);
  async function review(item: PersonalWord, known: boolean) {
    try {
      await apiPatch(`/my-vocabulary/${item.id}`, { familiarity: Math.max(0, Math.min(100, item.familiarity + (known ? 20 : -10))), review: true });
      toast.push("success", known ? "已記錄熟悉度" : "已標記為需要複習");
      setActive(null);
      await reload();
    } catch (err) { toast.push("error", errorMessage(err)); }
  }
  async function addWord() {
    if (!newWord.word.trim()) return toast.push("error", "請輸入單字");
    try {
      await apiPost("/my-vocabulary", newWord);
      toast.push("success", "已加入我的單字");
      setAddOpen(false);
      setNewWord({ word: "", meaning: "", partOfSpeech: "", phonetic: "", example: "", exampleZh: "" });
      await reload();
    } catch (err) { toast.push("error", errorMessage(err)); }
  }
  return <Card title="我的單字" subtitle={`OCR、教材與手動收藏的單字都集中在這裡・共 ${data?.total ?? 0} 個`} action={<div className="flex flex-wrap gap-1.5"><Button size="sm" onClick={() => setAddOpen(true)}>＋ 手動新增</Button><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋單字或中文" className="!w-36 !py-1.5 text-xs" /><Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto !py-1.5 text-xs"><option value="all">全部</option><option value="new">需加強</option><option value="review">複習中</option><option value="mastered">已熟悉</option></Select></div>}>
    <div className="mb-3 grid grid-cols-3 gap-2"><div className="glass-soft p-2"><p className="text-[11px] text-muted">總單字</p><p className="text-lg font-bold">{data?.total ?? 0}</p></div><div className="glass-soft p-2"><p className="text-[11px] text-muted">需要加強</p><p className="text-lg font-bold text-rose-300">{(data?.items ?? []).filter((i) => i.familiarity < 40).length}</p></div><div className="glass-soft p-2"><p className="text-[11px] text-muted">已熟悉</p><p className="text-lg font-bold text-emerald-300">{(data?.items ?? []).filter((i) => i.familiarity >= 80).length}</p></div></div>
    {loading && <Skeleton lines={4} />}{error && <ErrorState message={error} onRetry={reload} />}{!loading && !items.length && <EmptyState icon="◇" title="還沒有我的單字" hint="從圖片 OCR 或教材分析結果按『加入單字本』開始建立。" />}
    <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.word ?? "單字詳細資訊"} fullScreen>{active && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{active.partOfSpeech || "單字"}・熟悉度 {active.familiarity}%・{active.phonetic || ""}</p><div className="flex flex-wrap gap-1.5"><Button size="sm" variant="ghost" onClick={() => { if (!speak(active.word)) toast.push("error", "此瀏覽器不支援語音"); }}>朗讀</Button><Button size="sm" onClick={() => review(active, true)}>我會了</Button><Button size="sm" variant="outline" onClick={() => review(active, false)}>加入複習</Button><Button size="sm" variant="ghost" onClick={async () => { if (confirm("確定移除此單字？")) { await apiDelete(`/my-vocabulary/${active.id}`); setActive(null); await reload(); } }}>刪除</Button></div></div><div className="rounded-xl bg-[#37d3ff]/10 p-3"><p className="text-lg font-semibold">{active.meaning || "尚未補上中文釋義"}</p></div>{active.example && <div className="rounded-xl bg-white/5 p-3 text-sm"><p className="text-xs text-muted">例句</p><p className="mt-1">{active.example}</p><p className="text-muted">{active.exampleZh}</p></div>}{(() => { const a = active.analysis ?? {}; const list = (key: string) => Array.isArray(a[key]) ? (a[key] as unknown[]).map(String).filter(Boolean) : []; const confusables = list("confusables"); const synonyms = list("synonyms"); const nearSynonyms = list("nearSynonyms"); const collocations = list("collocations"); return <div className="grid gap-2 text-xs sm:grid-cols-2">{collocations.length > 0 && <div className="rounded-xl bg-white/5 p-2"><p className="font-semibold">相關片語</p><p className="mt-1 text-muted">{collocations.join("、")}</p></div>}{confusables.length > 0 && <div className="rounded-xl bg-amber-400/10 p-2"><p className="font-semibold">易錯與易混淆</p><p className="mt-1 text-muted">{confusables.join("；")}</p></div>}{synonyms.length > 0 && <div className="rounded-xl bg-white/5 p-2"><p className="font-semibold">相似字</p><p className="mt-1 text-muted">{synonyms.join("、")}</p></div>}{nearSynonyms.length > 0 && <div className="rounded-xl bg-white/5 p-2"><p className="font-semibold">近義字</p><p className="mt-1 text-muted">{nearSynonyms.join("、")}</p></div>}</div>; })()}</div>}</Modal>
    <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <button key={item.id} type="button" onClick={() => setActive(item)} className="glass-soft rounded-xl p-3 text-left transition hover:border-[#37d3ff]/50"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.word}</p><p className="text-xs text-[#7dd3fc]">{item.meaning}</p><p className="mt-1 text-[11px] text-muted">{item.partOfSpeech || "未分類"}・複習 {item.reviewCount} 次</p></div><Badge tone={item.familiarity >= 80 ? "green" : item.familiarity >= 40 ? "cyan" : "rose"}>{item.familiarity}%</Badge></div><Progress value={item.familiarity} max={100} tone={item.familiarity >= 80 ? "green" : "violet"} /></button>)}</div>
    <Modal open={addOpen} onClose={() => setAddOpen(false)} title="手動新增單字"><div className="space-y-3"><Field label="單字" required><Input value={newWord.word} onChange={(e) => setNewWord({ ...newWord, word: e.target.value })} /></Field><Field label="中文意思"><Input value={newWord.meaning} onChange={(e) => setNewWord({ ...newWord, meaning: e.target.value })} /></Field><Field label="詞性／音標"><div className="grid gap-2 sm:grid-cols-2"><Input value={newWord.partOfSpeech} onChange={(e) => setNewWord({ ...newWord, partOfSpeech: e.target.value })} placeholder="例如：noun" /><Input value={newWord.phonetic} onChange={(e) => setNewWord({ ...newWord, phonetic: e.target.value })} placeholder="音標" /></div></Field><Field label="例句"><Textarea value={newWord.example} onChange={(e) => setNewWord({ ...newWord, example: e.target.value })} /></Field><Field label="例句中文"><Input value={newWord.exampleZh} onChange={(e) => setNewWord({ ...newWord, exampleZh: e.target.value })} /></Field><Button full onClick={addWord}>加入我的單字</Button></div></Modal>
  </Card>;
}

type BrowseWord = { id: string; word: string; meaning: string; meanings?: string[]; phrases?: Array<{ en: string; zh: string }>; partOfSpeech: string; example: string; exampleZh: string; level: string; familiarity: number };

export function WordLibraryPanel() {
  const toast = useToast();
  const [track, setTrack] = useState<"junior" | "senior">("senior");
  const [category, setCategory] = useState<"words" | "phrases" | "sentences">("words");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "mastered" | "unmastered">("all");
  const [active, setActive] = useState<BrowseWord | null>(null);
  const wordsApi = useApi<{ words: BrowseWord[]; unlockedCount?: number; totalWords?: number }>(`/words/all?track=${track}&limit=7000&unlocked=true`, [track]);
  const sentencesApi = useApi<{ sentences: Sentence[] }>("/sentences");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const words = (wordsApi.data?.words ?? []).filter((word) => {
    const matchesQuery = !normalizedQuery || [word.word, word.meaning, word.example, word.exampleZh, ...(word.phrases ?? []).flatMap((phrase) => [phrase.en, phrase.zh])].join(" ").toLocaleLowerCase().includes(normalizedQuery);
    return matchesQuery;
  });
  const phrases = words.flatMap((word) => (word.phrases ?? []).map((phrase, index) => ({ ...phrase, id: `${word.id}-${index}`, word: word.word })));
  const sentences = (sentencesApi.data?.sentences ?? []).filter((sentence) => !normalizedQuery || `${sentence.en} ${sentence.zh}`.toLocaleLowerCase().includes(normalizedQuery));
  const filteredWords = words.filter((word) => status === "all" || status === "mastered" ? status === "all" || word.familiarity >= 80 : word.familiarity < 80);
  return <Card title="📚 字詞百科" subtitle={`像查單字網站一樣，搜尋單字、片語與句子，點擊即可查看完整內容。已出現 ${wordsApi.data?.unlockedCount ?? words.length} / 共 ${wordsApi.data?.totalWords ?? words.length} 個，每日慢慢解鎖。`}>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋英文、中文、片語或例句…" />
      <Select value={track} onChange={(e) => setTrack(e.target.value as typeof track)}><option value="senior">高中詞庫</option><option value="junior">國中詞庫</option></Select>
      <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">全部</option><option value="mastered">已掌握</option><option value="unmastered">未掌握</option></Select>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {([['words', '單字'], ['phrases', '片語'], ['sentences', '句子']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setCategory(key)} className={`rounded-full border px-3 py-1.5 text-xs transition ${category === key ? "border-[#37d3ff]/70 bg-[#37d3ff]/15 text-[#b9f2ff]" : "border-[var(--line)] text-muted hover:border-[#37d3ff]/40"}`}>{label}</button>)}
      <span className="ml-auto text-xs text-muted">{category === "words" ? words.length : category === "phrases" ? phrases.length : sentences.length} 筆</span>
    </div>
    {category === "words" && <div className="mt-3 grid max-h-[560px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{wordsApi.loading && <Skeleton lines={5} />}{!wordsApi.loading && filteredWords.map((word) => <button key={word.id} type="button" onClick={() => setActive(word)} className="glass-soft rounded-xl p-3 text-left transition hover:border-[#37d3ff]/50"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{word.word}</p><p className="mt-0.5 text-xs text-[#7dd3fc]">{word.meaning}</p><p className="mt-1 text-[11px] text-muted">{word.partOfSpeech || "未分類"}・{word.level === "senior" ? "高中" : "國中"}・熟悉度 {word.familiarity}%</p></div><Badge tone={word.familiarity >= 80 ? "green" : "cyan"}>詳細</Badge></div><p className="mt-2 line-clamp-2 text-xs text-muted">{word.example || fallbackExample(word.word, word.level)}</p></button>)}</div>}
    {category === "phrases" && <div className="mt-3 grid max-h-[560px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{phrases.map((phrase) => <button key={phrase.id} type="button" onClick={() => { const source = words.find((word) => word.word === phrase.word); if (source) setActive(source); }} className="glass-soft rounded-xl p-3 text-left"><p className="font-semibold text-[#e8edff]">{phrase.en}</p><p className="mt-1 text-xs text-[#7dd3fc]">{phrase.zh}</p><p className="mt-2 text-[11px] text-muted">來源單字：{phrase.word}</p></button>)}</div>}
    {category === "sentences" && <div className="mt-3 space-y-2">{sentences.map((sentence) => <button key={sentence.id} type="button" onClick={() => { setQuery(sentence.en); toast.push("info", "已定位這個句子，可切換回單字或片語繼續查詢"); }} className="glass-soft w-full rounded-xl p-3 text-left"><p className="text-sm font-medium">{sentence.en}</p><p className="mt-1 text-xs text-muted">{sentence.zh}</p><p className="mt-2 text-[11px] text-muted">熟悉度 {sentence.familiarity}%</p></button>)}</div>}
    {category === "words" && !wordsApi.loading && !filteredWords.length && <EmptyState icon="⌕" title="找不到符合的內容" hint="試試其他英文、中文或片語關鍵字。" />}
    <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.word ?? "單字詳細資訊"} fullScreen>{active && <div className="mx-auto max-w-3xl space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">{active.partOfSpeech || "單字"}</Badge><Button size="sm" variant="ghost" onClick={() => { if (!speak(active.word)) toast.push("error", "此瀏覽器不支援語音"); }}>🔊 朗讀</Button></div><section className="rounded-xl bg-[#37d3ff]/10 p-3"><p className="text-xs text-muted">主要意思</p><p className="mt-1 text-lg font-semibold text-[#7dd3fc]">{active.meaning}</p>{active.meanings?.filter(Boolean).map((meaning, index) => <p key={`${meaning}-${index}`} className="mt-1 text-sm">{meaning}</p>)}</section><section className="rounded-xl bg-white/5 p-3"><p className="text-xs font-semibold text-muted">例句</p><p className="mt-1 text-sm">{active.example || fallbackExample(active.word, active.level)}</p><p className="mt-1 text-sm text-muted">{active.exampleZh || "我今天在課堂上學會了這個單字。"}</p></section><section><p className="mb-2 text-xs font-semibold text-muted">相關片語</p>{active.phrases?.length ? active.phrases.map((phrase) => <div key={`${phrase.en}-${phrase.zh}`} className="mb-1.5 rounded-lg border border-[var(--line)] p-2"><p className="text-sm">{phrase.en}</p><p className="text-xs text-muted">{phrase.zh}</p></div>) : <p className="text-sm text-muted">目前沒有整理到相關片語。</p>}</section></div>}</Modal>
  </Card>;
}

type Sentence = { id: string; en: string; zh: string; level: string; familiarity: number };

export function SentencesPanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ sentences: Sentence[] }>("/sentences");
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<"zh2en" | "en2zh" | "fill">("zh2en");
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);

  const s = data?.sentences[i];
  if (loading) return <Card title="💬 快速背句子"><Skeleton lines={3} /></Card>;
  if (error) return <Card title="💬 快速背句子"><ErrorState message={error} onRetry={reload} /></Card>;
  if (!s) return <Card title="💬 快速背句子"><EmptyState icon="💬" title="目前沒有句子" /></Card>;

  const blanked = s.en
    .split(" ")
    .map((w, idx) => (idx % 4 === 2 ? "____" : w))
    .join(" ");

  async function grade(correct: boolean) {
    if (!s) return;
    await apiPost("/sentences/answer", { sentenceId: s.id, correct });
    toast.push(correct ? "success" : "info", correct ? "很好！" : "沒關係，等一下會再出現");
    setShow(false);
    setInput("");
    setI((v) => (v + 1) % (data?.sentences.length ?? 1));
  }

  return (
    <Card
      title="💬 快速背句子"
      subtitle={`第 ${i + 1}/${data?.sentences.length} 句・熟悉度 ${s.familiarity}%`}
      action={
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="!w-auto !py-1.5 text-xs">
          <option value="zh2en">中 → 英</option>
          <option value="en2zh">英 → 中</option>
          <option value="fill">關鍵字填空</option>
        </Select>
      }
    >
      <div className="glass-soft min-h-[130px] p-4 text-center">
        <p className="text-lg font-medium">{mode === "en2zh" ? s.en : mode === "fill" ? blanked : s.zh}</p>
        {show && <p className="mt-2 text-[#37d3ff]">{mode === "en2zh" ? s.zh : s.en}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="輸入你的答案（選填）" className="min-w-[180px] flex-1" />
        <Button variant="ghost" onClick={() => setShow((v) => !v)}>
          {show ? "隱藏" : "看答案"}
        </Button>
        <Button variant="ghost" onClick={() => { speak(s.en); }}>
          🔊 朗讀
        </Button>
        <Button onClick={() => grade(true)}>我會了</Button>
        <Button variant="outline" onClick={() => grade(false)}>
          再練習
        </Button>
      </div>
    </Card>
  );
}

type VoiceRecord = {
  id: string;
  mode: string;
  subject: string;
  referenceText: string;
  durationSec: number;
  status: string;
  audioUrl: string | null;
  transcript: { transcript: string } | null;
  analysis: { score: number; fluency: number; accuracy: number; completeness: number; pace: number; missingWords: string[]; advice: string } | null;
};

export function VoicePanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ records: VoiceRecord[] }>("/voice");
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number }> }>("/quotas");
  const voiceCost = quotas.data?.quotas.find((item) => item.feature === "ai_speech")?.novaCost ?? null;
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState("reading");
  const [subject, setSubject] = useState("英文");
  const [reference, setReference] = useState("");
  const [uploading, setUploading] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const b = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.push("error", "無法存取麥克風，請確認瀏覽器權限");
    }
  }

  function stop() {
    recorder.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    setPaused(false);
  }

  async function upload() {
    if (!blob || !confirmNovaSpend("AI 口說分析", voiceCost)) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "record.webm");
      fd.append("mode", mode);
      fd.append("subject", subject);
      fd.append("referenceText", reference);
      fd.append("durationSec", String(seconds));
      await apiPost("/voice", fd);
      toast.push("success", "AI 分析完成！");
      setBlob(null);
      setPreviewUrl(null);
      setSeconds(0);
      await reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card title="🎤 錄音分析・背誦測試・AI 口說" subtitle="英文朗讀、國文背課文、口說練習，AI 會比對逐字稿並評分">
      <NovaCostNotice cost={voiceCost} action="AI 口說分析" className="mb-3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="模式">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="reading">朗讀評分</option>
            <option value="recite">背誦測試</option>
            <option value="speaking">AI 口說對話</option>
          </Select>
        </Field>
        <Field label="科目">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="參考文本（背誦／朗讀時提供，AI 會比對漏字與順序）">
        <Textarea value={reference} onChange={(e) => setReference(e.target.value)} placeholder="貼上課文或句子…" className="!min-h-[80px]" />
      </Field>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording && !blob && <Button onClick={start}>● 開始錄音</Button>}
        {recording && (
          <>
            <Badge tone="rose">錄音中 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</Badge>
            {!paused ? (
              <Button variant="ghost" onClick={() => { recorder.current?.pause(); setPaused(true); if (timer.current) clearInterval(timer.current); }}>
                ⏸ 暫停
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => { recorder.current?.resume(); setPaused(false); timer.current = setInterval(() => setSeconds((s) => s + 1), 1000); }}>
                ▶ 繼續
              </Button>
            )}
            <Button variant="danger" onClick={stop}>
              ■ 結束
            </Button>
          </>
        )}
        {blob && !recording && (
          <>
            {previewUrl && <audio src={previewUrl} controls className="h-9" />}
            <Button loading={uploading} onClick={upload}>
              ✨ 送出 AI 分析
            </Button>
            <Button variant="ghost" onClick={() => { setBlob(null); setPreviewUrl(null); setSeconds(0); }}>
              重錄
            </Button>
          </>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {loading && <Skeleton lines={3} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !data?.records.length && <EmptyState icon="🎙️" title="還沒有錄音紀錄" hint="錄一段英文朗讀，AI 會給你 0-100 分與改善建議。" />}
        {data?.records.map((r) => (
          <div key={r.id} className="glass-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="cyan">{r.mode === "reading" ? "朗讀" : r.mode === "recite" ? "背誦" : "口說"}</Badge>
                <span className="text-xs text-muted">{r.durationSec}s・{r.subject}</span>
              </div>
              {r.analysis && <span className="text-lg font-bold text-[#37d3ff]">{r.analysis.score} / 100</span>}
            </div>
            {r.audioUrl && <audio src={r.audioUrl} controls className="mt-2 h-9 w-full" />}
            {r.transcript?.transcript && (
              <p className="mt-2 rounded-lg bg-black/25 p-2 text-xs text-muted">
                <span className="font-medium text-[var(--text)]">逐字稿：</span>
                {r.transcript.transcript}
              </p>
            )}
            {r.analysis && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <div>流暢度 {r.analysis.fluency}</div>
                <div>正確度 {r.analysis.accuracy}</div>
                <div>完整度 {r.analysis.completeness}</div>
                <div>語速 {r.analysis.pace}</div>
              </div>
            )}
            {r.analysis?.missingWords?.length ? <p className="mt-1 text-[11px] text-rose-300">漏讀：{r.analysis.missingWords.join("、")}</p> : null}
            {r.analysis?.advice && <p className="mt-1 text-xs text-muted">💡 {r.analysis.advice}</p>}
            <div className="mt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await apiDelete(`/voice/${r.id}`);
                  toast.push("success", "已刪除錄音");
                  await reload();
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function FocusPanel() {
  const toast = useToast();
  const history = useApi<{ sessions: Array<{ id: string; subject: string; minutes: number; reflection: string; completedAt: string }> }>("/focus/history");
  const [target, setTarget] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [subject, setSubject] = useState("英文");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          setRunning(false);
          setDone(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const pct = ((target * 60 - left) / (target * 60)) * 100;

  async function complete() {
    setSaving(true);
    try {
      const res = await apiPost<{ reward: { nova: number; xp: number }; streak: number }>("/focus/complete", {
        minutes: target,
        subject,
        reflection,
      });
      toast.push("success", `專注完成！+${res.reward.nova} Nova / +${res.reward.xp} XP・連續 ${res.streak} 天`);
      setDone(false);
      setReflection("");
      setLeft(target * 60);
      await history.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="⏱️ 專注計時器" subtitle="完成後選科目並寫下反思，資料寫入成功才算完成">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="relative grid h-40 w-40 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="#37d3ff" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 283} 283`} />
          </svg>
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">
              {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
            </p>
            <p className="text-[11px] text-muted">{target} 分鐘</p>
          </div>
        </div>

        {!done && (
          <>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[15, 25, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => { setTarget(m); setLeft(m * 60); setRunning(false); }}
                  className={`focus-ring rounded-xl border px-3 py-1.5 text-xs ${target === m ? "border-[#37d3ff] bg-[#37d3ff]/15" : "border-[var(--line)]"}`}
                >
                  {m} 分
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={300}
                value={target}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(300, Number(e.target.value) || 1));
                  setTarget(v);
                  setLeft(v * 60);
                }}
                className="!w-20 !py-1.5 text-xs"
              />
            </div>
            <div className="flex gap-2">
              {!running ? <Button onClick={() => setRunning(true)}>▶ 開始</Button> : <Button variant="ghost" onClick={() => setRunning(false)}>⏸ 暫停</Button>}
              <Button variant="outline" onClick={() => { setRunning(false); setLeft(target * 60); }}>
                重設
              </Button>
              <Button variant="ghost" onClick={() => { setRunning(false); setDone(true); }}>
                提前完成
              </Button>
            </div>
          </>
        )}

        {done && (
          <div className="w-full max-w-sm space-y-2">
            <Field label="這段時間讀了什麼科目？">
              <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="簡短反思">
              <Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="今天掌握了什麼？哪裡還卡住？" className="!min-h-[70px]" />
            </Field>
            <Button full loading={saving} onClick={complete}>
              完成並記錄
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {history.data?.sessions.slice(0, 5).map((s) => (
          <div key={s.id} className="glass-soft flex items-center justify-between px-3 py-2 text-xs">
            <span>
              {s.subject}・{s.minutes} 分鐘
            </span>
            <span className="text-muted">{new Date(s.completedAt).toLocaleString("zh-TW")}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PlanPanel() {
  const toast = useToast();
  const plan = useApi<{ plan: { planDate: string; totalMinutes: number; rationale: string; blocks: Array<{ subject: string; minutes: number; focus: string; done: boolean }> } }>("/plan");
  const tasks = useApi<{ tasks: Array<{ id: string; title: string; done: boolean }>; assignments: Array<{ id: string; title: string; subject: string; dueDate: string; done: boolean }> }>("/tasks");
  const [newTask, setNewTask] = useState("");

  return (
    <div className="space-y-4">
      <Card
        title="🗓️ 今日讀書計畫"
        subtitle={plan.data?.plan.rationale}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await apiPost("/plan/regenerate");
              toast.push("success", "已依最新資料重新計算");
              await plan.reload();
            }}
          >
            重新計算
          </Button>
        }
      >
        {plan.loading && <Skeleton lines={3} />}
        {plan.error && <ErrorState message={plan.error} onRetry={plan.reload} />}
        <div className="space-y-2">
          {plan.data?.plan.blocks.map((b, i) => (
            <label key={`${b.subject}-${i}`} className="glass-soft flex cursor-pointer items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={b.done}
                onChange={async (e) => {
                  await apiPost("/plan/block-done", { index: i, done: e.target.checked });
                  await plan.reload();
                }}
                className="h-4 w-4 accent-[#7c5cff]"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${b.done ? "line-through opacity-60" : ""}`}>
                  {b.subject}・{b.minutes} 分鐘
                </p>
                <p className="truncate text-xs text-muted">{b.focus}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card title="📋 待辦與作業">
        <div className="flex gap-2">
          <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="新增待辦事項…" onKeyDown={async (e) => {
            if (e.key === "Enter" && newTask.trim()) {
              await apiPost("/tasks", { title: newTask.trim() });
              setNewTask("");
              await tasks.reload();
            }
          }} />
          <Button
            onClick={async () => {
              if (!newTask.trim()) return;
              await apiPost("/tasks", { title: newTask.trim() });
              setNewTask("");
              await tasks.reload();
            }}
          >
            新增
          </Button>
        </div>
        <div className="mt-3 space-y-1.5">
          {tasks.data?.tasks.map((t) => (
            <div key={t.id} className="glass-soft flex items-center gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={t.done}
                onChange={async (e) => {
                  await apiPost(`/tasks/${t.id}`, { done: e.target.checked }).catch(async () => {
                    await fetch(`/api/v1/tasks/${t.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ done: e.target.checked }) });
                  });
                  await tasks.reload();
                }}
                className="accent-[#7c5cff]"
              />
              <span className={`flex-1 ${t.done ? "line-through opacity-60" : ""}`}>{t.title}</span>
              <button
                onClick={async () => {
                  await apiDelete(`/tasks/${t.id}`);
                  await tasks.reload();
                }}
                className="text-xs text-muted hover:text-rose-300"
              >
                刪除
              </button>
            </div>
          ))}
          {!tasks.data?.tasks.length && <EmptyState icon="✅" title="沒有待辦事項" hint="Novi 建議的任務經你確認後也會出現在這裡。" />}
        </div>
      </Card>
    </div>
  );
}


type QuickMemoryItem = { id: string; question: string; answer: string; explanation: string; createdAt: string };

export function QuickMemoryPanel() {
  const toast = useToast();
  const list = useApi<{ items: QuickMemoryItem[] }>("/quick-memory");
  const [title, setTitle] = useState("我的快速背題目");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, QuickMemoryItem>>({});

  async function createItems() {
    if (!file && content.trim().length < 3) return toast.push("error", "請貼上題目與答案，或選擇檔案");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title.trim() || "我的快速背題目");
      form.append("content", content);
      if (file) form.append("file", file);
      const res = await apiPost<{ created: number }>("/quick-memory", form);
      toast.push("success", `已自動建立 ${res.created} 題快速背題目`);
      setContent("");
      setFile(null);
      await list.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(item: QuickMemoryItem) {
    const draft = drafts[item.id] ?? item;
    setBusy(true);
    try {
      await apiPatch(`/quick-memory/${item.id}`, { question: draft.question, answer: draft.answer, explanation: draft.explanation });
      toast.push("success", "題目與答案已更新");
      await list.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="✦ 快速背" subtitle="上傳或貼上「題目 → 答案」，系統會自動拆成可練習題目；每一題都能再手動修改。">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[#0b1428] p-3 opacity-100 shadow-inner">
          <Field label="這組題目的名稱"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：段考片語" /></Field>
          <Field label="上傳題目／答案檔案" hint="支援 TXT、CSV、JSON、PDF；文字檔建議每行一題">
            <Input type="file" accept=".txt,.csv,.json,.pdf,text/plain,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-[#101d35]" />
          </Field>
          <Field label="或直接貼上內容" hint="格式：題目 → 答案，也支援題目 Tab 答案、題目：答案">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} placeholder={'例：\nWhat is the opposite of hot? → cold\n光合作用的原料 → 二氧化碳和水'} className="bg-[#101d35]" />
          </Field>
          <Button full loading={busy} onClick={createItems}>自動生成快速背題目</Button>
        </div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[#0b1428] p-3 opacity-100 shadow-inner">
          {list.loading && <Skeleton lines={5} />}
          {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
          {!list.loading && !list.data?.items.length && <EmptyState icon="✦" title="還沒有快速背題目" hint="左側上傳或貼上題目與答案後，這裡會出現可編輯的題目卡。" />}
          {list.data?.items.map((item) => {
            const draft = drafts[item.id] ?? item;
            return (
              <div key={item.id} className="space-y-2 rounded-xl border border-[var(--line)] bg-[#111d35] p-3 opacity-100">
                <Input value={draft.question} onChange={(e) => setDrafts((all) => ({ ...all, [item.id]: { ...draft, question: e.target.value } }))} aria-label="快速背題目" />
                <Input value={draft.answer} onChange={(e) => setDrafts((all) => ({ ...all, [item.id]: { ...draft, answer: e.target.value } }))} aria-label="快速背答案" />
                <Textarea value={draft.explanation} onChange={(e) => setDrafts((all) => ({ ...all, [item.id]: { ...draft, explanation: e.target.value } }))} rows={2} placeholder="詳解（選填）" aria-label="快速背詳解" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={busy} onClick={() => saveItem(item)}>儲存修改</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await apiDelete(`/quick-memory/${item.id}`); toast.push("success", "已刪除題目"); await list.reload(); }}>刪除</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
