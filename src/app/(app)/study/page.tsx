"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui";
import { MaterialsPanel, NotesPanel, OcrPanel } from "@/features/study/panels-a";
import { QuizPanel, WrongPanel } from "@/features/study/panels-b";
import { FocusPanel, PlanPanel, QuickMemoryPanel, SentencesPanel, VoicePanel, WordsPanel } from "@/features/study/panels-c";

const TABS = [
  { key: "plan", label: "今日計畫", icon: "▤" },
  { key: "materials", label: "教材", icon: "▦" },
  { key: "ocr", label: "圖片 OCR", icon: "▧" },
  { key: "quiz", label: "測驗", icon: "▤" },
  { key: "wrong", label: "錯題本", icon: "◇" },
  { key: "words", label: "單字", icon: "⌁" },
  { key: "quick-memory", label: "快速背", icon: "✦" },
  { key: "sentences", label: "句子", icon: "◌" },
  { key: "voice", label: "錄音", icon: "◉" },
  { key: "focus", label: "計時", icon: "◷" },
  { key: "notes", label: "筆記", icon: "▤" },
];

function StudyInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "plan");

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">學習中心</h1>
        <p className="text-xs text-muted sm:text-sm">教材、OCR、測驗、錯題、單字、句子、錄音與專注計時，全部在同一個地方。</p>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "plan" && <PlanPanel />}
      {tab === "materials" && <MaterialsPanel />}
      {tab === "ocr" && <OcrPanel />}
      {tab === "quiz" && <QuizPanel />}
      {tab === "wrong" && <WrongPanel />}
      {tab === "words" && <WordsPanel />}
      {tab === "quick-memory" && <QuickMemoryPanel />}
      {tab === "sentences" && <SentencesPanel />}
      {tab === "voice" && <VoicePanel />}
      {tab === "focus" && <FocusPanel />}
      {tab === "notes" && <NotesPanel />}
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
