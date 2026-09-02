import Link from "next/link";
import { Wordmark } from "@/components/brand";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/faq", label: "常見問題" },
  { href: "/support", label: "回報問題" },
  { href: "/privacy", label: "隱私條款" },
  { href: "/terms", label: "使用條款" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--bg)]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
          <Link href="/" className="focus-ring rounded-lg">
            <Wordmark size={18} />
          </Link>
          <nav className="no-scrollbar -mx-1 flex flex-1 justify-end gap-1 overflow-x-auto px-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="focus-ring shrink-0 rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">
                {l.label}
              </Link>
            ))}
            <Link href="/dashboard" className="focus-ring shrink-0 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-3 py-1.5 text-xs font-medium text-white">
              進入平台
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">{children}</main>
      <footer className="border-t border-[var(--line)] px-4 py-6 text-center text-xs text-muted">
        <p>StudyNova AI · 讓學習更聰明，讓進步看得見</p>
        <p className="mt-1 flex flex-wrap justify-center gap-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="underline">
              {l.label}
            </Link>
          ))}
        </p>
      </footer>
    </div>
  );
}
