import Link from "next/link";

export function PkDisabledPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4 py-12">
      <section className="w-full overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[radial-gradient(circle_at_50%_0%,rgba(55,211,255,.18),transparent_45%),linear-gradient(145deg,rgba(16,30,60,.98),rgba(22,18,52,.98))] p-8 text-center shadow-[0_24px_90px_rgba(5,12,40,.35)] sm:p-14">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-4xl shadow-[0_0_36px_rgba(251,191,36,.16)]" aria-hidden="true">
          !
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/75">StudyNova 線上 PK</p>
        <h1 className="mt-4 text-2xl font-black leading-tight text-white sm:text-4xl">Oops 😬</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-slate-200 sm:text-lg">
          這個功能好像有點問題，改天再回來看看吧。
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-400">
          線上 PK 目前暫時關閉，配對、房間與 Bot 練習會在重新開放後恢復。
        </p>
        <Link href="/dashboard" className="mt-8 inline-flex rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/20">
          返回首頁
        </Link>
      </section>
    </main>
  );
}
