"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const seed = error.digest ?? error.message ?? "unknown";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const code = `SN-UI-${hash.toString(16).slice(0, 4).toUpperCase().padStart(4, "0")}`;

  return (
    <html lang="zh-Hant-TW">
      <body className="antialiased">
        <main className="grid min-h-dvh place-items-center bg-[#060915] px-4 py-10 text-white">
          <section className="w-full max-w-md rounded-3xl border border-rose-400/20 bg-[#10172d] p-6 text-center shadow-2xl">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-rose-400/70 bg-rose-950/30 text-3xl text-rose-300" aria-hidden>
              !
            </div>
            <h1 className="mt-4 text-lg font-bold">頁面發生錯誤</h1>
            <p className="mt-2 text-sm text-slate-300">你的學習資料仍會保留，請重新整理頁面或回到首頁。</p>
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 font-mono text-sm text-rose-100">錯誤代碼：{code}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href="/dashboard" className="rounded-xl border border-slate-600 px-4 py-2 text-sm">回到首頁</a>
              <a href={`/support?code=${code}`} className="rounded-xl border border-slate-600 px-4 py-2 text-sm">回報問題</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
