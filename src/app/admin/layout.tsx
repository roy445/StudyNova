import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { SymbolIcon, type SymbolName } from "@/components/Symbol";

export const dynamic = "force-dynamic";

type AdminNavItem = { href: string; label: string; icon: SymbolName };
type AdminNavGroup = { label: string; items: AdminNavItem[] };

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "核心與使用者",
    items: [
      { href: "/admin", label: "總覽・使用者", icon: "home" },
      { href: "/admin/features", label: "功能總控台", icon: "admin" },
      { href: "/admin/support", label: "問題回報", icon: "challenge" },
    ],
  },
  {
    label: "學習內容",
    items: [
      { href: "/admin/weekly", label: "每週小考", icon: "weekly" },
      { href: "/admin/reference-materials", label: "AI 參考資料", icon: "admin" },
      { href: "/admin/content", label: "Content Studio", icon: "study" },
      { href: "/admin/challenges", label: "挑戰管理", icon: "challenge" },
    ],
  },
  {
    label: "AI、會員與紀錄",
    items: [
      { href: "/admin/ops", label: "AI・會員・內容", icon: "nova" },
      { href: "/admin/audit", label: "Audit Log", icon: "admin" },
    ],
  },
  {
    label: "系統與維運",
    items: [
      { href: "/admin/system", label: "系統・測試・匯出", icon: "admin" },
      { href: "/admin/performance", label: "系統效能", icon: "grades" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "owner") redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--bg)]/95 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/70 pb-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7dd3fc]">StudyNova</p>
              <h1 className="text-base font-bold text-white sm:text-lg">管理中心</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-[#ffc857]/40 px-2 py-1 text-[11px] text-[#ffd98a]">{session.user.role}</span>
              <Link href="/dashboard" className="focus-ring rounded-xl border border-[var(--line)] px-2.5 py-1.5 text-xs hover:bg-white/5 sm:px-3">
                回學生端
              </Link>
            </div>
          </div>

          <nav aria-label="管理員功能分類" className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {NAV_GROUPS.map((group) => (
              <section key={group.label} className="min-w-0 rounded-2xl border border-[var(--line)]/80 bg-white/[0.025] p-2">
                <h2 className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{group.label}</h2>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1 2xl:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="focus-ring flex min-h-9 min-w-0 items-center gap-1.5 rounded-xl border border-transparent px-2 py-1.5 text-[11px] leading-tight text-white/85 transition-colors hover:border-[var(--line)] hover:bg-white/10 hover:text-white"
                    >
                      <SymbolIcon name={item.icon} size={15} />
                      <span className="min-w-0 break-words">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6">{children}</main>
    </div>
  );
}
