"use client";

import { QuizPanel } from "@/features/study/panels-b";

export default function AiQuizPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <header className="rounded-3xl border border-cyan-300/25 bg-[radial-gradient(circle_at_85%_15%,rgba(55,211,255,.18),transparent_35%),linear-gradient(135deg,rgba(8,28,58,.98),rgba(18,25,58,.95))] p-5 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">StudyNova AI Learning</p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-4xl">AI 幫你出題</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">給我教材、範圍或一個想學的觀念，剩下的交給 AI。生成後會進入逐題互動作答、即時批改與錯題解析。</p>
      </header>
      <QuizPanel />
    </main>
  );
}
