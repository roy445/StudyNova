import Link from "next/link";
export const metadata = { title: "找不到頁面" };

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="glass anim-pop w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-22 w-22 place-items-center rounded-full border-2 border-[#7c5cff]/70 bg-[#10172d] text-3xl shadow-[0_0_42px_rgba(124,92,255,0.35)]" aria-hidden>
          ◌
        </div>
        <h1 className="mt-3 text-lg font-bold">找不到這個頁面</h1>
        <p className="mt-1 text-sm text-muted">連結可能已失效或輸入錯誤。</p>
        <p className="mt-3 rounded-xl border border-[var(--line)] px-3 py-2 font-mono text-sm">錯誤代碼：SN-UI-4040</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="focus-ring rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-4 py-2 text-sm text-white">
            回到 Dashboard
          </Link>
          <Link href="/faq" className="focus-ring rounded-xl border border-[var(--line)] px-4 py-2 text-sm">
            常見問題
          </Link>
          <Link href="/support?code=SN-UI-4040" className="focus-ring rounded-xl border border-[var(--line)] px-4 py-2 text-sm">
            回報問題
          </Link>
        </div>
      </div>
    </div>
  );
}
