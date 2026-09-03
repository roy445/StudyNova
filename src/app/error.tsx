"use client";


export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const seed = error.digest ?? error.message ?? "unknown";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const code = `SN-UI-${hash.toString(16).slice(0, 4).toUpperCase().padStart(4, "0")}`;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="glass anim-pop w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-22 w-22 place-items-center rounded-full border-2 border-rose-400/70 bg-rose-950/30 text-3xl text-rose-300 shadow-[0_0_42px_rgba(251,113,133,0.25)]" aria-hidden>
          !
        </div>
        <h1 className="mt-3 text-lg font-bold">頁面發生錯誤</h1>
        <p className="mt-1 text-sm text-muted">別擔心，你的學習資料都安全保存著。可以重試，或把下面的代碼回報給我們。</p>
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 font-mono text-sm text-rose-100">
          錯誤代碼：{code}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="focus-ring rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-4 py-2 text-sm text-white">重試</button>
          <a href="/dashboard" className="focus-ring rounded-xl border border-[var(--line)] px-4 py-2 text-sm">回到首頁</a>
          <a href={`/support?code=${code}`} className="focus-ring rounded-xl border border-[var(--line)] px-4 py-2 text-sm">回報問題</a>
        </div>
        <p className="mt-3 text-xs text-muted">
          也可以先查看 <a href="/faq" className="underline">常見問題</a>
        </p>
      </div>
    </div>
  );
}
