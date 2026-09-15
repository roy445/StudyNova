"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, Select, Skeleton, Tabs, useToast } from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";
import { MaterialsPanel, NotesPanel, OcrPanel } from "@/features/study/panels-a";
import { QuizPanel, WrongPanel } from "@/features/study/panels-b";
import { FocusPanel, MyVocabularyPanel, QuickMemoryPanel, SentencesPanel, VoicePanel, VisualNotesPanel, WordLibraryPanel, WordsPanel } from "@/features/study/panels-c";

const TABS = [
  { key: "timeline", label: "我的學習足跡", icon: "◷" },
  { key: "one-page", label: "考前一頁紙", icon: "▤" },
  { key: "materials", label: "教材", icon: "▦" },
  { key: "ocr", label: "圖片 OCR", icon: "▧" },
  { key: "quiz", label: "測驗", icon: "▤" },
  { key: "wrong", label: "錯題本", icon: "◇" },
  { key: "words", label: "單字", icon: "⌁" },
  { key: "visual-notes", label: "重點心智圖", icon: "✦" },
  { key: "word-library", label: "字詞百科", icon: "▤" },
  { key: "my-vocabulary", label: "我的單字", icon: "◇" },
  { key: "quick-memory", label: "快速背", icon: "✦" },
  { key: "sentences", label: "句子", icon: "◌" },
  { key: "voice", label: "錄音", icon: "◉" },
  { key: "focus", label: "計時", icon: "◷" },
  { key: "notes", label: "筆記", icon: "▤" },
];

function TimelinePanel() {
  const [filter, setFilter] = useState("all");
  const timeline = useApi<{ items: Array<{ id: string; type: string; kind: string; subject: string; title: string; minutes: number; occurredAt: string; source: string; detail: Record<string, unknown> }> }>(`/learning/timeline?type=${filter}`, [filter]);
  const labels: Record<string, string> = { all: "全部", vocabulary: "單字", quiz: "測驗", wrong: "錯題", material: "教材", focus: "專注", ai: "AI", exam: "考試" };
  return <Card title="🕘 我的學習足跡" subtitle="只顯示目前帳號自己的真實學習紀錄。" action={<Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto !py-1.5 text-xs">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>}>
    {timeline.loading && <Skeleton lines={5} />}
    {!timeline.loading && !timeline.data?.items.length && <EmptyState icon="◷" title="還沒有學習足跡" hint="完成單字、測驗、教材閱讀或專注後，紀錄會自動出現在這裡。" />}
    <div className="space-y-2">{timeline.data?.items.map((item) => <div key={`${item.source ?? "item"}-${item.id}`} className="glass-soft flex items-start gap-3 rounded-xl p-3"><div className="mt-0.5 shrink-0 text-xs tabular-nums text-muted">{new Date(item.occurredAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.title}</p><Badge tone="cyan">{labels[item.type] ?? item.subject}</Badge></div><p className="mt-1 text-xs text-muted">{item.subject}{item.minutes > 0 ? `・${item.minutes} 分鐘` : ""}</p></div></div>)}</div>
  </Card>;
}

function OnePagePanel() {
  const toast = useToast();
  const modes = useApi<{ policies: Array<{ mode: string; label: string }> }>("/exam-modes");
  const [mode, setMode] = useState("general");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ note: { id: string; title: string }; sections: Array<{ subject: string; bullets: string[] }>; evidence: Record<string, number> } | null>(null);
  async function generate() {
    setBusy(true);
    try { const res = await apiPost<typeof result>("/learning/one-page", { title: `考前一頁紙・${modes.data?.policies.find((item) => item.mode === mode)?.label ?? mode}`, examMode: mode }); setResult(res); toast.push("success", "考前一頁紙已產生並保存到我的筆記"); } catch (err) { toast.push("error", err instanceof Error ? err.message : "產生失敗"); } finally { setBusy(false); }
  }
  return <Card title="📄 產生考前一頁紙" subtitle="Novi 只會從你的錯題、單字、教材與成績挑出最值得看的內容，並保存到我的筆記。" action={<Select value={mode} onChange={(e) => setMode(e.target.value)} className="!w-auto !py-1.5 text-xs">{(modes.data?.policies ?? [{ mode: "general", label: "一般練習" }]).map((item) => <option key={item.mode} value={item.mode}>{item.label}</option>)}</Select>}>
    <Button loading={busy} onClick={generate}>✨ 產生並保存</Button>
    {result && <div className="mt-3 space-y-3">{result.sections.map((section) => <div key={section.subject} className="glass-soft rounded-xl p-3"><p className="font-semibold text-[#7dd3fc]">{section.subject}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></div>)}<p className="text-[10px] text-muted">資料依據：錯題 {result.evidence.wrong} 筆・單字 {result.evidence.vocabulary} 筆・教材 {result.evidence.materials} 份・成績 {result.evidence.grades} 筆；已保存筆記：{result.note.title}</p></div>}
  </Card>;
}

function StudyInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "plan" ? "timeline" : (params.get("tab") ?? "timeline"));
  const contentRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const frame = window.requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [tab]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">學習中心</h1>
        <p className="text-xs text-muted sm:text-sm">教材、OCR、測驗、錯題、單字、句子、錄音與專注計時，全部在同一個地方。</p>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div ref={contentRef} className={`scroll-mt-24 scroll-mb-24 pb-[calc(5rem+env(safe-area-inset-bottom))] ${tab === "words" || tab === "word-library" || tab === "my-vocabulary" || tab === "visual-notes" ? "study-vocabulary-fullbleed" : ""}`}>
        {tab === "timeline" && <TimelinePanel />}
        {tab === "one-page" && <OnePagePanel />}
        {tab === "materials" && <MaterialsPanel />}
        {tab === "ocr" && <OcrPanel />}
        {tab === "quiz" && <QuizPanel />}
        {tab === "wrong" && <WrongPanel />}
        {tab === "words" && <WordsPanel />}
        {tab === "visual-notes" && <VisualNotesPanel />}
        {tab === "word-library" && <WordLibraryPanel />}
        {tab === "my-vocabulary" && <MyVocabularyPanel />}
        {tab === "quick-memory" && <QuickMemoryPanel />}
        {tab === "sentences" && <SentencesPanel />}
        {tab === "voice" && <VoicePanel />}
        {tab === "focus" && <FocusPanel />}
        {tab === "notes" && <NotesPanel />}
      </div>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <StudyInner />
    </Suspense>
  );
}
