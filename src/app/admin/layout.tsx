import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { LogoMark } from "@/components/brand";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "總覽・使用者", icon: "◒" },
  { href: "/admin/weekly", label: "每週小考", icon: "▤" },
  { href: "/admin/ops", label: "AI・會員・內容", icon: "✦" },
  { href: "/admin/support", label: "問題回報", icon: "◇" },
  { href: "/admin/system", label: "系統・測試・匯出", icon: "▣" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "owner") redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
          <Link href="/admin" className="focus-ring flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-sm font-bold">StudyNova 管理中心</span>
          </Link>
          <nav className="no-scrollbar -mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="focus-ring shrink-0 rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">
                {n.icon} {n.label}
              </Link>
            ))}
          </nav>
          <span className="rounded-full border border-[#ffc857]/40 px-2 py-1 text-[11px] text-[#ffd98a]">{session.user.role}</span>
          <Link href="/dashboard" className="focus-ring rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs hover:bg-white/5">
            回學生端
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6">{children}</main>
    </div>
  );
}
