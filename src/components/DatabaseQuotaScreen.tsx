"use client";
import Link from "next/link";
import { Wordmark } from "@/components/brand";

export function DatabaseQuotaScreen() {
  return (
    <main className="quota-screen relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#050812] px-4 py-10 text-white sm:px-6">
      <div className="quota-orb quota-orb-one" aria-hidden="true" />
      <div className="quota-orb quota-orb-two" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl rounded-[2rem] border-2 border-rose-300/35 bg-[#0d1428]/95 p-6 text-center shadow-[0_28px_140px_rgba(0,0,0,.72)] backdrop-blur-xl sm:p-10 lg:p-14">
        <div className="mx-auto flex justify-center"><Wordmark size={56} /></div>
        <div className="quota-alert-icon mx-auto mt-8 grid h-28 w-28 place-items-center rounded-full border-4 border-rose-300/70 bg-rose-500/15 text-6xl text-rose-100 shadow-[0_0_70px_rgba(244,63,94,.3)]" role="img" aria-label="重要警告">!</div>
        <p className="mt-7 text-xs font-black uppercase tracking-[.28em] text-rose-200 sm:text-sm">StudyNova AI · 重要服務公告</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">資料庫配額已達上限</h1>
        <p className="mx-auto mt-6 max-w-2xl text-base font-semibold leading-8 text-rose-50 sm:text-xl sm:leading-9">
          目前資料庫可用配額已經用完，StudyNova 暫時無法正常載入首頁及學習功能。
        </p>
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-200/25 bg-amber-300/[.08] px-5 py-5 text-left text-sm leading-7 text-amber-50 sm:px-7 sm:text-base">
          <p className="font-black text-amber-200">預計恢復時間</p>
          <p className="mt-1 font-semibold">預計於下個月（2026 年 11 月）資料庫配額重置後恢復服務。</p>
          <p className="mt-3 text-amber-100/80">實際恢復時間仍會以資料庫服務商的配額重置狀態為準。</p>
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
          如果你原本預計使用 StudyNova，我們對這次造成的不便深感抱歉，也謝謝你的耐心等候。配額恢復後，我們會儘快恢復網站服務。
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/support" className="rounded-xl border border-white/15 bg-white/[.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">聯絡支援</Link>
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110">重新檢查網站</button>
        </div>
      </div>
    </main>
  );
}
