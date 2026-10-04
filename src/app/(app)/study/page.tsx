"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, Select, Skeleton, Tabs, useToast } from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";
import { MaterialsPanel, NotesPanel, OcrPanel } from "@/features/study/panels-a";
import { QuizPanel, WrongPanel } from "@/features/study/panels-b";
import { FocusPanel, MyVocabularyPanel, QuickMemoryPanel, SentencesPanel, VoicePanel, VisualNotesPanel, WordLibraryPanel, WordsPanel } from "@/features/study/panels-c";
import { learningSubjects } from "@/content/learning/ch1";

const TABS = [
  { key: "timeline", label: "我的學習足跡", icon: "◷" },
  { key: "online-courses", label: "線上學習", icon: "📚", featured: true },
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
  const centerControl = useApi<{ status: "enabled" | "repairing" | "disabled"; message: string }>("/learning/center-control");
  const examHubs = useApi<{ hubs: Array<{ id: string; name: string; examNumber: string; closeAt: string | null }> }>("/exam-hubs/available");
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

  if (centerControl.data && centerControl.data.status !== "enabled") return <Card title={centerControl.data.status === "repairing" ? "🛠️ 學習中心修復中" : "🔒 學習中心目前關閉"} subtitle="為避免資料在維護期間不完整，暫時不能使用學習中心功能。"><div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-5 text-sm leading-7 text-amber-50">{centerControl.data.message}<br />請稍後再回來查看。</div></Card>;

  return (
    <div className="space-y-4">
      <Link href="/learning" className="learning-hero-link group block overflow-hidden rounded-[2rem] border-2 border-cyan-300/45 bg-[radial-gradient(circle_at_85%_15%,rgba(55,211,255,.35),transparent_34%),radial-gradient(circle_at_8%_100%,rgba(124,92,255,.3),transparent_42%),linear-gradient(135deg,rgba(8,28,58,.98),rgba(32,25,78,.94))] p-6 shadow-[0_0_34px_rgba(55,211,255,.2)] transition hover:-translate-y-0.5 hover:border-cyan-200/80 hover:shadow-[0_0_48px_rgba(55,211,255,.34)] sm:p-8">
        <div className="flex min-h-44 items-center justify-between gap-6 sm:min-h-56">
          <div className="relative z-10 max-w-2xl"><div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone="cyan">StudyNova Learning</Badge><Badge tone="gold">推薦入口</Badge></div><h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">📚 線上學習</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">進入互動課程、詳細知識、比較表、AI 問答與隨堂練習。從這裡開始你的完整學習路線。</p><span className="mt-6 inline-flex items-center rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(55,211,255,.45)]">立即開始線上學習 <span className="ml-2 transition group-hover:translate-x-1">→</span></span></div>
          <div className="hidden select-none text-[9rem] opacity-25 drop-shadow-[0_0_30px_rgba(55,211,255,.9)] sm:block">✦</div>
        </div>
      </Link>
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">學習專區</h1>
        <p className="text-xs text-muted sm:text-sm">線上課程、教材、OCR、測驗、錯題、單字、句子、錄音與專注計時，全部在同一個地方。</p>
      </header>

      {examHubs.data?.hubs.length ? <Link href={`/exam-hubs/${examHubs.data.hubs[0].id}`} className="group block overflow-hidden rounded-[1.75rem] border-2 border-[#ffc857]/65 bg-[radial-gradient(circle_at_85%_15%,rgba(255,200,87,.3),transparent_35%),linear-gradient(135deg,rgba(52,27,72,.98),rgba(8,28,58,.98))] p-5 shadow-[0_0_32px_rgba(255,200,87,.17)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(255,200,87,.3)]"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge tone="gold">限時段考考題專區</Badge><Badge tone="rose">現在開放</Badge></div><h2 className="mt-2 text-xl font-black text-white sm:text-2xl">{examHubs.data.hubs[0].name}</h2><p className="mt-1 text-sm text-slate-200">{examHubs.data.hubs[0].examNumber}・計時作答、完成後留下個人紀錄。</p></div><span className="rounded-xl bg-[#ffc857] px-4 py-2.5 text-sm font-black text-slate-950">立即作答 →</span></div></Link> : null}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div ref={contentRef} className={`scroll-mt-24 scroll-mb-24 pb-[calc(5rem+env(safe-area-inset-bottom))] ${tab === "words" || tab === "word-library" || tab === "my-vocabulary" || tab === "visual-notes" ? "study-vocabulary-fullbleed" : ""}`}>
        {tab === "timeline" && <TimelinePanel />}
        {tab === "online-courses" && <OnlineCoursesPanel />}
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

function OnlineCoursesPanel() {
  return <Card title="📚 線上學習" subtitle="從學習專區直接進入互動教材、詳細知識、AI 問答與課後練習。">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {learningSubjects.map((subject) => subject.status === "PUBLISHED" ? <Link key={subject.slug} href={`/learning/${subject.slug}`} className="group rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/50">
        <div className="flex items-start justify-between gap-3"><span className="text-3xl">{subject.icon}</span><Badge tone="cyan">{subject.statusLabel}</Badge></div>
        <h3 className="mt-3 font-bold">{subject.title}</h3><p className="mt-1 text-xs leading-5 text-muted">{subject.subtitle}</p><p className="mt-3 text-xs font-semibold text-cyan-200">開始課程 →</p>
      </Link> : <div key={subject.slug} className="rounded-2xl border border-[var(--line)] p-4 opacity-70"><span className="text-3xl grayscale">{subject.icon}</span><h3 className="mt-3 font-bold">{subject.title}</h3><p className="mt-1 text-xs text-muted">{subject.statusLabel}</p></div>)}
    </div>
  </Card>;
}

export default function StudyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <StudyInner />
    </Suspense>
  );
}
