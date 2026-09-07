"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui";
import { MaterialsPanel, NotesPanel, OcrPanel } from "@/features/study/panels-a";
import { QuizPanel, WrongPanel } from "@/features/study/panels-b";
import { FocusPanel, MyVocabularyPanel, PlanPanel, QuickMemoryPanel, SentencesPanel, VoicePanel, WordLibraryPanel, WordsPanel } from "@/features/study/panels-c";

const TABS = [
  { key: "plan", label: "今日計畫", icon: "▤" },
  { key: "materials", label: "教材", icon: "▦" },
  { key: "ocr", label: "圖片 OCR", icon: "▧" },
  { key: "quiz", label: "測驗", icon: "▤" },
  { key: "wrong", label: "錯題本", icon: "◇" },
  { key: "words", label: "單字", icon: "⌁" },
  { key: "word-library", label: "字詞百科", icon: "▤" },
  { key: "my-vocabulary", label: "我的單字", icon: "◇" },
  { key: "quick-memory", label: "快速背", icon: "✦" },
  { key: "sentences", label: "句子", icon: "◌" },
  { key: "voice", label: "錄音", icon: "◉" },
  { key: "focus", label: "計時", icon: "◷" },
  { key: "notes", label: "筆記", icon: "▤" },
];

function StudyInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "plan");
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

      <div ref={contentRef} className={`scroll-mt-24 scroll-mb-24 pb-[calc(5rem+env(safe-area-inset-bottom))] ${tab === "words" || tab === "word-library" || tab === "my-vocabulary" ? "study-vocabulary-fullbleed" : ""}`}>
        {tab === "plan" && <PlanPanel />}
        {tab === "materials" && <MaterialsPanel />}
        {tab === "ocr" && <OcrPanel />}
        {tab === "quiz" && <QuizPanel />}
        {tab === "wrong" && <WrongPanel />}
        {tab === "words" && <WordsPanel />}
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
