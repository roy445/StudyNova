import { maintenanceDateLabel, type MaintenanceState } from "@/server/maintenance";

export function MaintenanceScreen({ state }: { state: MaintenanceState }) {
  const recoveryLabel = maintenanceDateLabel(state.estimatedRecoveryAt);
  const startedLabel = maintenanceDateLabel(state.startedAt);

  return (
    <main className="maintenance-screen relative isolate grid min-h-dvh w-full place-items-center overflow-hidden bg-[#060915] px-4 py-10 text-white sm:px-6">
      <div className="maintenance-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="maintenance-tape maintenance-tape-top pointer-events-none" aria-hidden="true"><span>🚧 SYSTEM MAINTENANCE · STUDYNOVA · SYSTEM MAINTENANCE · 🚧</span></div>
      <div className="maintenance-tape maintenance-tape-bottom pointer-events-none" aria-hidden="true"><span>MAINTENANCE MODE · 暫時維護 · MAINTENANCE MODE ·</span></div>

      <section className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-amber-200/20 bg-[#0c142a]/95 px-5 py-8 text-center shadow-[0_28px_120px_rgba(0,0,0,0.58)] backdrop-blur-xl sm:px-10 sm:py-11">
        <div className="maintenance-fade-in">
          <div className="maintenance-warning mx-auto w-[min(48vw,14rem)] sm:w-56" role="img" aria-label="系統維護施工警示">
            <svg viewBox="0 0 240 210" className="h-auto w-full" aria-hidden="true">
              <defs>
                <linearGradient id="maintenanceTriangle" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffe59a" />
                  <stop offset="0.45" stopColor="#ffc857" />
                  <stop offset="1" stopColor="#e87522" />
                </linearGradient>
                <filter id="maintenanceGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path d="M120 12 226 196H14Z" fill="rgba(255,200,87,.08)" stroke="rgba(255,200,87,.28)" strokeWidth="14" strokeLinejoin="round" filter="url(#maintenanceGlow)" />
              <path d="M120 12 226 196H14Z" fill="url(#maintenanceTriangle)" stroke="#ffe7a3" strokeWidth="5" strokeLinejoin="round" />
              <path d="m73 157 94-76M103 178l94-76" stroke="#51351d" strokeWidth="11" strokeLinecap="round" opacity=".84" />
              <circle cx="120" cy="93" r="18" fill="#261b15" />
              <path d="m120 81 5 9 10 1-7 7 2 10-10-5-10 5 2-10-7-7 10-1Z" fill="#ffc857" />
              <path d="M84 131h72" stroke="#261b15" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/90 sm:text-xs">StudyNova · {state.badgeText}</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">{state.title || "StudyNova 正在進行系統維護"}</h1>
          <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-sm leading-7 text-slate-300 sm:text-base">{state.description || "我們正在進行系統維護與更新。"}</p>

          {state.notice && <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-amber-200/15 bg-amber-300/[0.07] px-4 py-3 text-sm leading-6 text-amber-50">{state.notice}</p>}

          <div className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-2">
            {state.startedAt && <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">開始時間</p><p className="mt-1 text-sm font-semibold text-slate-200">{startedLabel}</p></div>}
            {state.estimatedRecoveryAt && <div className="rounded-2xl border border-amber-200/20 bg-amber-300/[0.06] p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-amber-200/75">預計恢復時間</p><p className="mt-1 text-sm font-semibold text-amber-50">{recoveryLabel}</p></div>}
          </div>

          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.045] px-4 py-3 text-sm leading-6 text-cyan-50">
            <p className="font-bold">你的帳號沒有被登出</p>
            <p className="mt-1 text-xs text-cyan-100/70">帳號與學習資料都會保留，維護完成後重新整理即可繼續使用。</p>
          </div>
        </div>
      </section>
    </main>
  );
}
