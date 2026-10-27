"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Skeleton, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPost, errorMessage } from "@/lib/api";
import { inferSpeechLanguage, stripPronunciationAnnotations } from "@/lib/browser-speech";

type DocumentRow = { id: string; title: string; sourceKind: string; summary: string; status: string; createdAt: string; updatedAt: string };
type Item = { id: string; itemType: "vocabulary" | "sentence"; orderIndex: number; word: string; meaning: string; partOfSpeech: string; phonetic: string; sentence: string; sentenceZh: string };
type Detail = { document: DocumentRow & { originalText: string }; items: Item[] };

function speak(text: string, onEnd?: () => void, rate = 0.9) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const clean = stripPronunciationAnnotations(text);
  if (!clean.trim()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = inferSpeechLanguage(clean) || "en-US";
  utterance.rate = rate;
  utterance.onend = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export default function EnglishReaderPage() {
  const toast = useToast();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSentence, setActiveSentence] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(0.9);
  const sentences = useMemo(() => detail?.items.filter((item) => item.itemType === "sentence") ?? [], [detail]);
  const vocabulary = useMemo(() => detail?.items.filter((item) => item.itemType === "vocabulary") ?? [], [detail]);

  async function loadDocuments() {
    setLoading(true);
    try { const result = await apiGet<{ documents: DocumentRow[] }>("/english-reader/documents", { fresh: true }); setDocuments(result.documents); }
    catch (error) { toast.push("error", errorMessage(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadDocuments(); return () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }; }, []);

  async function openDocument(id: string) {
    try { setDetail(await apiGet<Detail>(`/english-reader/documents/${id}`, { fresh: true })); setActiveSentence(-1); }
    catch (error) { toast.push("error", errorMessage(error)); }
  }
  async function analyze() {
    if (!file && content.trim().length < 20) { toast.push("info", "請上傳檔案或貼上至少 20 個英文單字。"); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title.trim() || file?.name.replace(/\.[^.]+$/, "") || "英文閱讀文章");
      form.append("content", content);
      if (file) form.append("file", file);
      const result = await apiPost<{ document: DocumentRow; items: Item[]; counts: { vocabulary: number; sentences: number } }>("/english-reader/documents", form);
      setDetail({ document: result.document as Detail["document"], items: result.items });
      setDocuments((rows) => [result.document, ...rows.filter((row) => row.id !== result.document.id)]);
      setTitle(""); setContent(""); setFile(null); const input = document.getElementById("english-reader-file") as HTMLInputElement | null; if (input) input.value = "";
      toast.push("success", `分析完成：${result.counts.vocabulary} 個單字、${result.counts.sentences} 個句子`);
    } catch (error) { toast.push("error", errorMessage(error)); }
    finally { setBusy(false); }
  }
  function playSentence(index: number) {
    const item = sentences[index];
    if (!item) return;
    setActiveSentence(index); setPlaying(true);
    if (!speak(item.sentence, () => { setPlaying(false); setActiveSentence(-1); }, rate)) { setPlaying(false); toast.push("error", "此瀏覽器不支援英文朗讀"); }
  }
  function stop() { window.speechSynthesis?.cancel(); setPlaying(false); setActiveSentence(-1); }
  async function remove(id: string) {
    if (!window.confirm("確定刪除這份英文閱讀內容？")) return;
    try { await apiDelete(`/english-reader/documents/${id}`); if (detail?.document.id === id) setDetail(null); await loadDocuments(); toast.push("success", "已刪除"); }
    catch (error) { toast.push("error", errorMessage(error)); }
  }

  return <main className="space-y-5">
    <header className="overflow-hidden rounded-[2rem] border-2 border-cyan-300/35 bg-[radial-gradient(circle_at_85%_10%,rgba(55,211,255,.3),transparent_35%),linear-gradient(135deg,rgba(8,28,58,.98),rgba(38,22,72,.95))] p-5 shadow-[0_0_38px_rgba(55,211,255,.12)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge tone="gold">NOVA PRO</Badge><Badge tone="cyan">ENGLISH READER</Badge></div><h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">英文閱讀分析室</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">上傳英文雜誌圖片、PDF 或文字檔，AI 會整理單字、中文意思與值得朗讀的完整句子。閱讀時可逐句播放，播放中的句子會自動反白。</p></div><span className="select-none text-7xl opacity-30">🔊</span></div>
      <div className="mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-3"><div className="rounded-xl bg-white/[.06] p-3">① 上傳英文內容</div><div className="rounded-xl bg-white/[.06] p-3">② AI 條列分析</div><div className="rounded-xl bg-white/[.06] p-3">③ 逐句朗讀高亮</div></div>
    </header>
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,.78fr)_minmax(0,1.5fr)]">
      <Card title="新增英文內容" subtitle="限定英文科目；圖片與 PDF 會先進行文字擷取。">
        <div className="space-y-3"><Field label="文章名稱"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：The future of clean energy" /></Field><Field label="上傳檔案" hint="PDF、TXT、Markdown、JSON、JPG、PNG、WebP，最大 15MB"><Input id="english-reader-file" type="file" accept=".pdf,.txt,.md,.json,image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field><Field label="或直接貼上英文"><Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste an English article, dialogue, or study passage here…" /></Field><p className="rounded-xl border border-amber-300/25 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">這是 Nova Pro 專屬功能。AI 只會根據你上傳的內容整理，不會保證辨識結果等同老師正式講義，請自行核對原文。</p><Button full loading={busy} onClick={analyze}>分析英文內容</Button></div>
      </Card>
      <Card title="我的英文閱讀紀錄" subtitle="點選左側紀錄即可重新開啟分析結果。">
        {loading ? <Skeleton lines={5} /> : !documents.length ? <EmptyState icon="▤" title="還沒有英文閱讀內容" hint="上傳一份英文文章開始建立你的閱讀資料庫。" /> : <div className="space-y-2">{documents.map((row) => <div key={row.id} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${detail?.document.id === row.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-[var(--line)] bg-white/[.03]"}`}><button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openDocument(row.id)}><p className="truncate font-semibold text-cyan-100">{row.title}</p><p className="mt-1 text-xs text-muted">{row.sourceKind.toUpperCase()}・{new Date(row.updatedAt).toLocaleString("zh-TW")}</p></button><Button size="sm" variant="ghost" onClick={() => void remove(row.id)}>刪除</Button></div>)}</div>}
      </Card>
    </div>
    {detail && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
      <Card title={`📖 ${detail.document.title}`} subtitle={`${vocabulary.length} 個單字・${sentences.length} 個句子・逐句朗讀會同步反白`} action={<div className="flex items-center gap-2"><label className="text-xs text-muted">語速 <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-lg border border-[var(--line)] bg-black/20 px-2 py-1"><option value={0.7}>0.7×</option><option value={0.9}>0.9×</option><option value={1}>1×</option><option value={1.15}>1.15×</option></select></label>{playing && <Button size="sm" variant="ghost" onClick={stop}>停止</Button>}</div>}>
        {detail.document.summary && <p className="mb-4 rounded-2xl border border-violet-300/20 bg-violet-300/[.06] p-4 text-sm leading-7 text-violet-50"><strong>AI 摘要：</strong>{detail.document.summary}</p>}
        <div className="space-y-2">{sentences.map((item, index) => <button type="button" key={item.id} onClick={() => playSentence(index)} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${activeSentence === index ? "border-amber-300 bg-amber-300/15 shadow-[0_0_24px_rgba(255,200,87,.18)]" : "border-[var(--line)] bg-white/[.025] hover:border-cyan-300/45"}`}><span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${activeSentence === index ? "bg-amber-300 text-slate-950" : "bg-cyan-300/15 text-cyan-100"}`}>{index + 1}</span><span className="min-w-0"><span className="block text-sm font-semibold leading-6 text-white">{item.sentence}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.sentenceZh}</span><span className="mt-2 block text-[11px] text-cyan-200">{activeSentence === index ? "正在朗讀・目前句子" : "點擊播放並反白"}</span></span></button>)}{!sentences.length && <p className="text-sm text-muted">AI 沒有找到可確認的完整句子，請檢查原文或重新分析。</p>}</div>
      </Card>
      <Card title="🧠 單字清單" subtitle="點擊喇叭即可朗讀單字。"><div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">{vocabulary.map((item) => <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-white/[.025] p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-cyan-100">{item.word}</p><p className="mt-1 text-sm text-amber-100">{item.meaning}</p></div><Button size="sm" variant="ghost" title={`朗讀 ${item.word}`} onClick={() => { void speak(item.word, undefined, rate); }}>🔊</Button></div>{(item.partOfSpeech || item.phonetic) && <p className="mt-2 text-xs text-muted">{item.partOfSpeech}{item.partOfSpeech && item.phonetic ? "・" : ""}{item.phonetic}</p>}</article>)}{!vocabulary.length && <p className="text-sm text-muted">AI 沒有找到可確認的單字。</p>}</div></Card>
    </div>}
  </main>;
}
