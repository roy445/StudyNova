"use client";

import { useState } from "react";
import type { MaintenanceState } from "@/server/maintenance";

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

export function MaintenanceNotice({ state }: { state: MaintenanceState }) {
  const [open, setOpen] = useState(true);
  if (!state.enabled || !open) return null;
  return (
    <>
      <div className="fixed inset-x-3 top-3 z-[95] mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-amber-300/35 bg-[#11182c]/95 px-4 py-3 text-sm text-amber-50 shadow-[0_12px_45px_rgba(0,0,0,.3)] backdrop-blur-xl">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-300/15 text-xl" aria-hidden="true">⚠</span>
        <div className="min-w-0 flex-1"><p className="font-bold">{state.title || "StudyNova 正在進行系統維護"}</p><p className="truncate text-xs text-amber-100/70">{state.notice || state.description || "部分功能可能暫時受到影響；你的帳號與學習資料會保留。"}</p></div>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-amber-100/70 hover:bg-white/10" aria-label="關閉維護提示">關閉</button>
      </div>
      <div className="fixed inset-0 z-[94] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="系統維護資訊">
        <section className="w-full max-w-lg rounded-[2rem] border border-amber-300/30 bg-[#0c142a] p-6 text-center shadow-[0_25px_110px_rgba(0,0,0,.65)] sm:p-8">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-amber-300/35 bg-amber-300/10 text-5xl" aria-hidden="true">⚠</div>
          <p className="mt-4 text-xs font-black uppercase tracking-[.25em] text-amber-200">{state.badgeText}</p>
          <h1 className="mt-2 text-2xl font-black text-white">{state.title || "StudyNova 正在進行系統維護"}</h1>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{state.description || "我們正在進行系統更新與維護。"}</p>
          {state.notice && <p className="mt-4 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-amber-50">{state.notice}</p>}
          {state.estimatedRecoveryAt && <p className="mt-4 text-xs text-slate-400">預計恢復時間：<strong className="text-amber-100">{dateLabel(state.estimatedRecoveryAt)}</strong></p>}
          <p className="mt-5 rounded-xl border border-cyan-200/15 bg-cyan-300/[.05] px-4 py-3 text-sm leading-6 text-cyan-50">你的帳號沒有被登出，學習資料也會保留。<br /><span className="text-xs text-cyan-100/65">關閉此提示後仍可繼續使用 StudyNova。</span></p>
          <button type="button" onClick={() => setOpen(false)} className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-4 py-3 text-sm font-bold text-white shadow-lg">繼續使用 StudyNova</button>
        </section>
      </div>
    </>
  );
}
