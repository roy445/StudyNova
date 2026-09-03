"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark, NoviAvatar, Wordmark, type NoviState } from "./brand";
import { Badge, Button, Input, Modal, Skeleton, useToast } from "./ui";
import { apiGet, apiPost, useApi } from "@/lib/api";

export type ShellUser = {
  userId: string;
  novaId: string;
  displayName: string;
  role: string;
  isPro: boolean;
};

const NAV = [
  { href: "/dashboard", label: "首頁", icon: "⌂" },
  { href: "/study", label: "學習", icon: "▦" },
  { href: "/ai", label: "AI", icon: "✦" },
  { href: "/challenge", label: "挑戰", icon: "◇" },
  { href: "/profile", label: "我的", icon: "◎" },
];

const ENCOURAGEMENTS: Array<{ text: string; state: NoviState }> = [
  { text: "慢慢來也沒關係，今天完成一小步，就是在變強。", state: "cheer" },
  { text: "你不需要一次做到完美，只要比昨天多理解一點。", state: "happy" },
  { text: "把現在的專注留給眼前這一題，答案會一步一步清楚。", state: "thinking" },
  { text: "每一次回想，都是在替記憶鋪一條更穩的路。", state: "remind" },
  { text: "相信累積的力量，你正在成為更好的自己。", state: "success" },
  { text: "千里之行，始於足下。先完成眼前這一步，Novi 陪你一起走。", state: "cheer" },
  { text: "學而不思則罔，思而不學則殆。今天也留一點時間動手練習吧。", state: "remind" },
];

const SIDE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/study", label: "學習中心", icon: "▦" },
  { href: "/ai", label: "Novi AI", icon: "✦" },
  { href: "/grades", label: "成績分析", icon: "⌁" },
  { href: "/weekly", label: "每週補習小考", icon: "▤" },
  { href: "/challenge", label: "好友・活動", icon: "◇" },
  { href: "/report", label: "學習報告", icon: "◒" },
  { href: "/profile", label: "我的 Nova", icon: "◎" },
];

type SearchResult = { kind: string; id: string; title: string; subject?: string };

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [noviOpen, setNoviOpen] = useState(false);
  const [noviMinimized, setNoviMinimized] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noviState, setNoviState] = useState<NoviState>("idle");
  const [advice, setAdvice] = useState<string>("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [encouragement, setEncouragement] = useState<{ text: string; state: NoviState } | null>(null);

  const notif = useApi<{ notifications: Array<{ id: string; title: string; body: string; link: string; readAt: string | null; createdAt: string }>; unread: number }>(
    "/notifications",
  );
  const summary = useApi<{ nova: number; novi: { level: number; xp: number; skin: string; effect: string } | null; greeting: string; dueWrong: number; tasks: Array<{ id: string; title: string; progress: number; target: number }> }>(
    "/dashboard",
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const next = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
        setEncouragement(next);
        setNoviState(next.state);
        timer = setTimeout(() => {
          if (cancelled) return;
          setEncouragement(null);
          setNoviState("idle");
          schedule(45_000 + Math.random() * 75_000);
        }, 9_000);
      }, delay);
    };
    schedule(25_000 + Math.random() * 45_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const runSearch = useCallback(async () => {
    if (query.trim().length < 1) return;
    setSearching(true);
    try {
      const res = await apiGet<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.results);
    } catch {
      toast.push("error", "搜尋失敗，請稍後再試");
    } finally {
      setSearching(false);
    }
  }, [query, toast]);

  const askQuick = useCallback(
    async (kind: "today_advice" | "weak_focus" | "encourage") => {
      setAdviceLoading(true);
      setNoviState("thinking");
      try {
        const res = await apiPost<{ text: string }>("/ai/quick", { kind });
        setAdvice(res.text);
        setNoviState("happy");
      } catch (err) {
        setNoviState("error");
        toast.push("error", err instanceof Error ? err.message : "Novi 暫時無法回應");
      } finally {
        setAdviceLoading(false);
      }
    },
    [toast],
  );

  const logout = useCallback(async () => {
    await apiPost("/auth/logout");
    router.replace("/login");
    router.refresh();
  }, [router]);

  const unread = notif.data?.unread ?? 0;
  const nova = summary.data?.nova ?? 0;
  const level = summary.data?.novi?.level ?? 1;

  const kindLabel = useMemo(
    () => ({ material: "教材", note: "筆記", quiz: "測驗", question: "題目", activity: "活動" }) as Record<string, string>,
    [],
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 border-r border-[var(--line)] bg-black/20 px-3 py-4 lg:flex">
        <Link href="/dashboard" className="focus-ring mb-4 rounded-xl px-2 py-1">
          <Wordmark size={19} />
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto scroll-thin">
          {SIDE_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-gradient-to-r from-[#7c5cff]/30 to-[#37d3ff]/10 text-[var(--text)] shadow-inner" : "text-muted hover:bg-white/5 hover:text-[var(--text)]"
                }`}
              >
                <span>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          {(user.role === "admin" || user.role === "owner") && (
            <Link href="/admin" className="focus-ring mt-2 flex items-center gap-3 rounded-xl border border-[#ffc857]/30 px-3 py-2.5 text-sm text-[#ffd98a] hover:bg-[#ffc857]/10">
              <span>▣</span> 管理後台
            </Link>
          )}
        </nav>
        <div className="glass-soft p-3 text-xs">
          <p className={`truncate font-medium ${user.isPro ? "pro-name" : ""}`}>{user.displayName}</p>
          <p className="truncate text-muted">{user.novaId}</p>
          <div className="mt-2 flex items-center gap-1.5">
            {user.isPro && <Badge tone="gold">Nova Pro</Badge>}
            <Badge tone="cyan">Lv.{level}</Badge>
          </div>
          <button onClick={logout} className="focus-ring mt-3 w-full rounded-lg border border-[var(--line)] py-1.5 text-muted hover:text-[var(--text)]">
            登出
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--bg)]/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-5">
            <Link href="/dashboard" className="focus-ring flex items-center gap-2 lg:hidden">
              <LogoMark size={30} />
              <span className="neon-text text-base font-extrabold">StudyNova</span>
            </Link>
            <div className="flex-1" />
            <button onClick={() => setSearchOpen(true)} aria-label="搜尋" className="focus-ring rounded-xl border border-[var(--line)] px-2.5 py-2 text-sm hover:bg-white/5">
              ⌕
            </button>
            <Link href="/profile?tab=nova" className="focus-ring hidden items-center gap-1 rounded-xl border border-[#ffc857]/30 px-2.5 py-2 text-xs text-[#ffd98a] sm:flex">
              ✦ {nova}
            </Link>
            <button onClick={() => setNotifOpen(true)} aria-label="通知" className="focus-ring relative rounded-xl border border-[var(--line)] px-2.5 py-2 text-sm hover:bg-white/5">
              ◌
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <Link href="/profile" className={`focus-ring flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs ${user.isPro ? "pro-frame" : "border-[var(--line)]"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${user.isPro ? "bg-gradient-to-br from-[#ffc857] to-[#ff9f43] text-black" : "bg-white/10"}`}>
                {user.displayName.slice(0, 1)}
              </span>
              <span className={`hidden max-w-[90px] truncate sm:inline ${user.isPro ? "pro-name font-semibold" : ""}`}>{user.displayName}</span>
            </Link>
          </div>
        </header>

        <main className="app-main mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
          {children}
          <footer aria-label="網站資訊" className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-[var(--line)] pt-4 text-[11px] text-muted">
            <Link href="/faq" className="underline">常見問題</Link>
            <Link href="/support" className="underline">回報問題</Link>
            <Link href="/privacy" className="underline">隱私條款</Link>
            <Link href="/terms" className="underline">使用條款</Link>
            <span>StudyNova AI</span>
          </footer>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[color:var(--bg)]/95 backdrop-blur-xl lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 py-1.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`focus-ring flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] ${active ? "text-[#37d3ff]" : "text-muted"}`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Novi dock */}
      <div className="novi-dock fixed right-3 z-[60] flex flex-col items-end gap-2 sm:right-5">
        {!noviOpen && encouragement && (
          <button type="button" onClick={() => setNoviOpen(true)} className="glass anim-pop max-w-[min(82vw,300px)] p-3 text-left text-xs leading-relaxed text-[#e8edff] shadow-[0_0_28px_rgba(55,211,255,0.18)]">
            <span className="mb-1 block text-[10px] font-semibold tracking-wider text-[#37d3ff]">Novi 給你的話</span>
            {encouragement.text}
          </button>
        )}
        {noviOpen && (
          <div className="glass anim-pop w-[min(92vw,340px)] p-3">
            <div className="flex items-start gap-2">
              <NoviAvatar size={54} state={noviState} effect={summary.data?.novi?.effect} level={level} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Novi 小助理</p>
                <p className="text-[11px] text-muted">Lv.{level}・你的專屬 AI 學習夥伴</p>
              </div>
              <button onClick={() => setNoviOpen(false)} aria-label="收起 Novi" className="focus-ring rounded-lg px-1.5 text-muted hover:bg-white/10">
                ✕
              </button>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto scroll-thin rounded-xl bg-black/25 p-2.5 text-xs leading-relaxed">
              {adviceLoading ? <Skeleton lines={2} /> : encouragement?.text || advice || summary.data?.greeting || "點下方按鈕，我來告訴你今天該做什麼。"}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => askQuick("today_advice")}>
                今日建議
              </Button>
              <Button size="sm" variant="ghost" onClick={() => askQuick("weak_focus")}>
                弱點分析
              </Button>
              <Button size="sm" variant="ghost" onClick={() => router.push("/ai")}>
                問 AI
              </Button>
              <Button size="sm" variant="ghost" onClick={() => router.push("/study?tab=wrong")}>
                最近錯題{summary.data?.dueWrong ? `（${summary.data.dueWrong}）` : ""}
              </Button>
            </div>
            {summary.data?.tasks?.length ? (
              <div className="mt-2 space-y-1 text-[11px]">
                <p className="text-muted">今日任務</p>
                {summary.data.tasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="tabular-nums text-muted">
                      {Math.min(t.progress, t.target)}/{t.target}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {noviMinimized ? (
            <button onClick={() => setNoviMinimized(false)} className="focus-ring glass rounded-full px-3 py-2 text-xs" aria-label="展開 Novi">
              ✦
            </button>
          ) : (
            <>
              <button
                onClick={() => setNoviMinimized(true)}
                className="focus-ring glass rounded-full px-2 py-1 text-[10px] text-muted"
                aria-label="縮小 Novi"
                title="縮小"
              >
                －
              </button>
              <button onClick={() => setNoviOpen((v) => !v)} className="focus-ring rounded-full" aria-label="開啟 Novi 小助理">
                <NoviAvatar size={58} state={encouragement?.state ?? (noviOpen ? "happy" : "idle")} effect={summary.data?.novi?.effect} level={level} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search modal */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="全站搜尋">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="搜尋教材、筆記、題目、測驗、活動…"
            autoFocus
          />
          <Button onClick={runSearch} loading={searching}>
            搜尋
          </Button>
        </div>
        <div className="mt-3 space-y-1.5">
          {searching && <Skeleton lines={4} />}
          {!searching && results.length === 0 && <p className="py-4 text-center text-xs text-muted">輸入關鍵字開始搜尋（只會搜尋你自己的內容與公開內容）</p>}
          {results.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{r.title}</span>
              <Badge tone="muted">{kindLabel[r.kind] ?? r.kind}</Badge>
            </div>
          ))}
        </div>
      </Modal>

      {/* Notifications */}
      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="通知">
        <div className="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await apiPost("/notifications/read", {});
              await notif.reload();
            }}
          >
            全部標為已讀
          </Button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto scroll-thin">
          {notif.loading && <Skeleton lines={4} />}
          {!notif.loading && !notif.data?.notifications.length && <p className="py-6 text-center text-xs text-muted">目前沒有通知</p>}
          {notif.data?.notifications.map((n) => (
            <Link
              key={n.id}
              href={n.link || "/dashboard"}
              onClick={async () => {
                await apiPost("/notifications/read", { id: n.id });
                setNotifOpen(false);
                await notif.reload();
              }}
              className={`focus-ring block rounded-xl border px-3 py-2.5 text-sm transition hover:bg-white/5 ${n.readAt ? "border-[var(--line)] opacity-70" : "border-[#37d3ff]/40 bg-[#37d3ff]/5"}`}
            >
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
              <p className="mt-1 text-[10px] text-muted">{new Date(n.createdAt).toLocaleString("zh-TW")}</p>
            </Link>
          ))}
        </div>
      </Modal>
    </div>
  );
}
