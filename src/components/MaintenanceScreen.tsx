import { maintenanceDateLabel, type MaintenanceState } from "@/server/maintenance";

export function MaintenanceScreen({ state }: { state: MaintenanceState }) {
  const recoveryLabel = maintenanceDateLabel(state.estimatedRecoveryAt);
  const recoveryPassed = Boolean(state.estimatedRecoveryAt && new Date(state.estimatedRecoveryAt).getTime() < Date.now());

  return (
    <main className="grid min-h-dvh place-items-center bg-[#060915] px-4 py-10 text-white">
      <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-300/20 bg-[#111a32] p-7 text-center shadow-[0_24px_100px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-orange-400 to-amber-300" />
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-amber-300/30 bg-amber-300/10 text-5xl shadow-[0_0_55px_rgba(251,191,36,0.18)]" aria-hidden>
          🔧
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-amber-200">StudyNova Maintenance</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{state.title}</h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{state.description}</p>
        {state.notice && <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">{state.notice}</p>}
        <div className="my-6 border-y border-white/10 py-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">預計恢復時間</p>
          <p className="mt-1 text-base font-semibold text-amber-100">{recoveryLabel ?? "尚未設定，請以管理員公告為準"}</p>
          {recoveryPassed && <p className="mt-2 text-xs text-orange-200">原預計恢復時間已到，系統仍在維護中。</p>}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100">
          <span aria-hidden>🚧</span>
          {state.badgeText}
        </div>
      </section>
    </main>
  );
}
