"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoMark, NoviAvatar, Wordmark, type NoviState } from "./brand";
import { SymbolIcon, type SymbolName } from "./Symbol";
import { Badge, Button, Field, Input, Modal, Skeleton, useToast } from "./ui";
import { apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

export type ShellUser = {
  userId: string;
  novaId: string;
  displayName: string;
  role: string;
  isPro: boolean;
};

const NAV: Array<{ href: string; label: string; icon: SymbolName }> = [
  { href: "/dashboard", label: "首頁", icon: "home" },
  { href: "/study", label: "學習", icon: "study" },
  { href: "/ai", label: "AI", icon: "nova" },
  { href: "/essay", label: "作文批改", icon: "pen" },
  { href: "/compress", label: "壓縮", icon: "archive" },
  { href: "/export", label: "匯出", icon: "archive" },
  { href: "/weekly", label: "小考", icon: "weekly" },
  { href: "/challenge", label: "挑戰", icon: "challenge" },
  { href: "/profile", label: "我的", icon: "profile" },
];

  const PAGE_PROMPTS: Record<string, string> = {
  "/dashboard": "如果今天不知道要做什麼，不妨參考看看：單字、小知識或讀書計畫都可以，照你的步調就好。",
  "/study": "需要我陪你複習錯題、練單字，或安排一段專注時間嗎？",
  "/weekly": "這裡可以查看每週小考、單字與解析；要不要先看看本週重點？",
  "/challenge": "想和好友比一場嗎？可以選每日單字或已開放的每週小考。",
  "/grades": "我可以幫你看成績趨勢，找出下一個最值得補強的科目。",
  "/ai": "把題目或不懂的地方交給我，我可以用更有趣的方式拆解。",
  "/profile": "要調整 Novi、學習設定或查看 PRO 身分嗎？我可以陪你一起設定。",
};

const ENCOURAGEMENTS: Array<{ text: string; state: NoviState }> = [
  { text: "慢慢來也沒關係，今天完成一小步，就是在變強。", state: "cheer" },
  { text: "你不需要一次做到完美，只要比昨天多理解一點。", state: "happy" },
  { text: "把現在的專注留給眼前這一題，答案會一步一步清楚。", state: "thinking" },
  { text: "每一次回想，都是在替記憶鋪一條更穩的路。", state: "remind" },
  { text: "相信累積的力量，你正在成為更好的自己。", state: "success" },
  { text: "千里之行，始於足下。先完成眼前這一步，Novi 陪你一起走。", state: "cheer" },
  { text: "學而不思則罔，思而不學則殆。今天也留一點時間動手練習吧。", state: "remind" },
];

const NOVI_MODES = [
  { key: "teacher", label: "學習教練", description: "陪你規劃學習、拆解觀念，讓今天先完成一小步。" },
  { key: "solve", label: "解題模式", description: "一步一步分析題目，不直接跳到答案。" },
  { key: "hint", label: "提示模式", description: "只給剛剛好的提示，保留你自己思考的空間。" },
  { key: "exam", label: "考試模式", description: "用考試節奏練習，先作答再看解析。" },
  { key: "note", label: "筆記模式", description: "把重點整理成清楚、可複習的筆記。" },
  { key: "wrong", label: "錯題模式", description: "找出錯題背後的觀念漏洞，安排補強。" },
  { key: "review", label: "複習模式", description: "依照記憶曲線幫你回顧最容易忘記的內容。" },
  { key: "quick", label: "快速模式", description: "用最短的回答，快速處理一個明確問題。" },
];

const SIDE_NAV: Array<{ href: string; label: string; icon: SymbolName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/study", label: "學習中心", icon: "study" },
  { href: "/ai", label: "Novi AI", icon: "nova" },
  { href: "/essay", label: "英文作文批改", icon: "pen" },
  { href: "/compress", label: "智慧壓縮", icon: "archive" },
  { href: "/export", label: "資料匯出", icon: "archive" },
  { href: "/grades", label: "成績分析", icon: "grades" },
  { href: "/weekly", label: "每週小考", icon: "weekly" },
  { href: "/challenge", label: "好友・活動", icon: "challenge" },
  { href: "/report", label: "學習報告", icon: "report" },
  { href: "/profile", label: "我的 Nova", icon: "profile" },
];
const FEATURE_BY_PATH: Record<string, string> = { "/ai": "ai", "/compress": "compress", "/export": "export", "/essay": "essay", "/study": "study", "/weekly": "weekly", "/challenge": "challenge", "/grades": "grades", "/profile": "profile", "/dashboard": "dashboard" };
const FEATURE_GUIDANCE: Record<string, { title: string; text: string }> = {
  dashboard: { title: "首頁使用提醒", text: "今日建議僅供參考，可依時間與狀態自由選擇，不需要全部完成。" },
  ai: { title: "Novi AI 使用提醒", text: "切換模式後請查看用途說明；涉及成績、錯題、計畫或寫入資料時，請先確認授權與動作預覽。" },
  compress: { title: "智慧壓縮使用提醒", text: "請確認原始檔案、目標大小與輸出格式；批次壓縮後請先預覽內容，再下載 ZIP。" },
  export: { title: "資料匯出使用提醒", text: "只會匯出你的資料。請先查看樣本預覽，正式下載前會兩次確認並扣除對應 Nova。" },
  essay: { title: "作文批改使用提醒", text: "AI 建議僅供學習參考，請自行檢查文意、引用與老師要求後再提交。" },
  study: { title: "學習中心使用提醒", text: "複習與專注紀錄可依你的節奏調整；儲存前請確認日期、範圍與內容。" },
  weekly: { title: "每週小考使用提醒", text: "提交前請確認答案；測驗結果與獎勵會依系統最後提交紀錄計算。" },
  challenge: { title: "挑戰功能使用提醒", text: "請確認挑戰對象、題目與截止時間；不要分享帳號、密碼或個人敏感資料。" },
  grades: { title: "成績分析使用提醒", text: "分析結果是學習參考，不代表正式校務成績；請確認輸入資料正確。" },
  profile: { title: "帳號與 Nova 使用提醒", text: "請妥善保管帳號與兌換碼；Nova 交易與會員變更以系統紀錄為準。" },
};

type SearchResult = { kind: string; id: string; title: string; subject?: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pagePrompt = Object.entries(PAGE_PROMPTS).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? "需要我協助你完成目前這一步嗎？";
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
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
  const [inAppBrowser] = useState(() => typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|; wv\)|WebView/i.test(navigator.userAgent || ""));
  const [androidDevice] = useState(() => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || ""));
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [quickChatId, setQuickChatId] = useState<string | null>(null);
  const [quickChatMode, setQuickChatMode] = useState("teacher");
  const [quickChatInput, setQuickChatInput] = useState("");
  const [quickChatReply, setQuickChatReply] = useState("");
  const [quickChatSending, setQuickChatSending] = useState(false);
  const [noviPosition, setNoviPosition] = useState({ x: 0, y: 0 });
  const noviDrag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  const notif = useApi<{ notifications: Array<{ id: string; title: string; body: string; link: string; readAt: string | null; createdAt: string }>; unread: number }>(
    "/notifications",
  );
  const summary = useApi<{ nova: number; novi: { level: number; xp: number; skin: string; core: string; effect: string; float: string } | null; greeting: string; dueWrong: number; tasks: Array<{ id: string; title: string; progress: number; target: number }>; announcements?: Array<{ id: string; title: string; body: string; link: string; pinned: boolean; targetFeature?: string; category?: string }> }>(
    "/dashboard",
  );
  const account = useApi<{ membership: { tier: string; expiresAt: string | null } | null }>("/account/overview");
  const proDays = account.data?.membership?.expiresAt ? Math.max(0, Math.ceil((new Date(account.data.membership.expiresAt).getTime() - now) / 86400000)) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const guideTimer = !standalone && !localStorage.getItem("sn-install-guide-seen") ? window.setTimeout(() => setInstallGuideOpen(true), 0) : !localStorage.getItem("sn-usage-guide-seen") ? window.setTimeout(() => setUsageGuideOpen(true), 0) : undefined;
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => { if (guideTimer) window.clearTimeout(guideTimer); window.removeEventListener("beforeinstallprompt", onInstall); };
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

  const touchNovi = useCallback(() => {
    setNoviMinimized(false);
    setNoviOpen(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNoviOpen(false);
      setNoviMinimized(true);
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [noviOpen, quickChatReply, advice, encouragement]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!noviDrag.current) return;
      setNoviPosition({ x: noviDrag.current.x + event.clientX - noviDrag.current.startX, y: noviDrag.current.y + event.clientY - noviDrag.current.startY });
    };
    const up = () => { noviDrag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
    const send = (name: "FCP" | "LCP" | "CLS" | "TBT" | "TTI", value: number) => { void apiPost("/performance/vitals", { name, value, route: pathname, navigationType: performance.getEntriesByType("navigation")[0]?.entryType ?? "navigation" }).catch(() => {}); };
    const observers: PerformanceObserver[] = [];
    try {
      const paint = new PerformanceObserver((list) => { const entry = list.getEntries().find((item) => item.name === "first-contentful-paint"); if (entry) send("FCP", entry.startTime); });
      paint.observe({ type: "paint", buffered: true }); observers.push(paint);
    } catch {}
    try {
      const lcp = new PerformanceObserver((list) => { const entry = list.getEntries().at(-1); if (entry) send("LCP", entry.startTime); });
      lcp.observe({ type: "largest-contentful-paint", buffered: true }); observers.push(lcp);
    } catch {}
    try {
      let cls = 0;
      const layout = new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) if (!entry.hadRecentInput) cls += entry.value ?? 0; send("CLS", cls); });
      layout.observe({ type: "layout-shift", buffered: true }); observers.push(layout);
    } catch {}
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.domInteractive) send("TTI", nav.domInteractive);
    return () => observers.forEach((observer) => observer.disconnect());
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      window.dispatchEvent(new Event("studynova:sync"));
      timer = setTimeout(sync, 10_000);
    };
    timer = setTimeout(sync, 10_000);
    return () => clearTimeout(timer);
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

  const sendQuickChat = useCallback(async () => {
    const content = quickChatInput.trim();
    if (!content || quickChatSending) return;
    setQuickChatSending(true);
    setNoviState("thinking");
    setQuickChatInput("");
    try {
      let conversationId = quickChatId;
      if (!conversationId) {
        const created = await apiPost<{ conversation: { id: string } }>("/ai/conversations", { mode: quickChatMode, allowContext: ["settings", "grades", "wrong", "plan"] });
        conversationId = created.conversation.id;
        setQuickChatId(conversationId);
      }
      const result = await apiPost<{ message: { content: string } }>(`/ai/conversations/${conversationId}/messages`, { content });
      setQuickChatReply(result.message.content);
      setNoviState("happy");
    } catch (err) {
      setNoviState("error");
      toast.push("error", errorMessage(err));
    } finally {
      setQuickChatSending(false);
    }
  }, [quickChatInput, quickChatSending, quickChatId, quickChatMode, toast]);

  const changeQuickMode = useCallback(async (mode: string) => {
    setQuickChatMode(mode);
    const selected = NOVI_MODES.find((item) => item.key === mode);
    if (selected) setQuickChatReply(`已切換至「${selected.label}」：${selected.description}`);
    if (quickChatId) await apiPatch(`/ai/conversations/${quickChatId}`, { mode });
  }, [quickChatId]);

  const logout = useCallback(async () => {
    setAccountMenuOpen(false);
    await apiPost("/auth/logout");
    router.replace("/login");
    router.refresh();
  }, [router]);

  const redeemCoupon = useCallback(async () => {
    const code = redeemCode.trim();
    if (!code) {
      toast.push("error", "請輸入兌換碼");
      return;
    }
    setRedeeming(true);
    try {
      const result = await apiPost<{ redeemed: boolean; kind: "nova" | "xp" | "pro"; value: number }>("/coupons/redeem", { code });
      const reward = result.kind === "pro" ? `Nova Pro ${result.value} 天` : `${result.value} ${result.kind.toUpperCase()}`;
      toast.push("success", `兌換成功！獲得 ${reward}`);
      setRedeemCode("");
      setRedeemOpen(false);
      window.dispatchEvent(new Event("studynova:sync"));
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setRedeeming(false);
    }
  }, [redeemCode, toast]);

  const unread = notif.data?.unread ?? 0;
  const nova = summary.data?.nova ?? 0;
  const level = summary.data?.novi?.level ?? 1;
  const featureKey = Object.entries(FEATURE_BY_PATH).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? "all";
  const featureNotices = (summary.data?.announcements ?? []).filter((item) => item.targetFeature === "all" || item.targetFeature === featureKey).slice(0, 3);

  const kindLabel = useMemo(
    () => ({ material: "教材", note: "筆記", quiz: "測驗", question: "題目", activity: "活動" }) as Record<string, string>,
    [],
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 border-r border-[var(--line)] bg-black/20 px-3 py-4 lg:flex">
        <Link href="/dashboard" className="focus-ring mb-4 rounded-xl px-2 py-1">
          <Wordmark size={42} />
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
                <SymbolIcon name={item.icon} size={19} active={active} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          {(user.role === "admin" || user.role === "owner") && (
            <Link href="/admin" className="focus-ring mt-2 flex items-center gap-3 rounded-xl border border-[#ffc857]/30 px-3 py-2.5 text-sm text-[#ffd98a] hover:bg-[#ffc857]/10">
              <SymbolIcon name="admin" size={19} /> <span>管理後台</span>
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
              <LogoMark size={62} />
              <span className="neon-text text-base font-extrabold">StudyNova</span>
            </Link>
            <div className="flex-1" />
            <button onClick={() => setSearchOpen(true)} aria-label="搜尋" className="focus-ring rounded-xl border border-[var(--line)] px-2.5 py-2 text-sm hover:bg-white/5">
              <SymbolIcon name="search" size={18} />
            </button>
            <Link href="/profile?tab=nova" className="focus-ring hidden items-center gap-1 rounded-xl border border-[#ffc857]/30 px-2.5 py-2 text-xs text-[#ffd98a] sm:flex">
              <SymbolIcon name="nova" size={15} /> {nova}
            </Link>
            <button onClick={() => setNotifOpen(true)} aria-label="通知" className="focus-ring relative rounded-xl border border-[var(--line)] px-2.5 py-2 text-sm hover:bg-white/5">
              <SymbolIcon name="bell" size={18} />
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-label="開啟帳號選單"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className={`focus-ring flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-xs transition hover:bg-white/5 ${user.isPro ? "pro-frame" : "border-[var(--line)]"}`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold text-white shadow-sm ${user.isPro ? "border-amber-200/80 bg-gradient-to-br from-[#ffc857] to-[#ff9f43] text-black" : "border-cyan-200/40 bg-gradient-to-br from-[#7c5cff] to-[#20c5e8]"}`}>
                  {user.displayName.slice(0, 1)}
                </span>
                <span className={`hidden max-w-[90px] truncate sm:inline ${user.isPro ? "pro-name font-semibold" : ""}`}>{user.displayName}</span>
                <span className="text-[10px] text-muted" aria-hidden="true">⌄</span>
              </button>
              {accountMenuOpen && (
                <div role="menu" aria-label="帳號選單" className="glass anim-pop absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                  <div className="px-3 py-2.5">
                    <p className={`truncate text-sm font-semibold ${user.isPro ? "pro-name" : ""}`}>{user.displayName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{user.novaId}</p>
                  </div>
                  <div className="border-t border-[var(--line)] pt-1.5">
                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-white/5 hover:text-[var(--text)]"
                    >
                      <span>個人設定</span><span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      href="/study?tab=my-vocabulary"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-white/5 hover:text-[var(--text)]"
                    >
                      <span>我的單字</span><span aria-hidden="true">→</span>
                    </Link>
                    {user.isPro && <>
                      <div className="px-3 py-2 text-xs text-[#ffd98a]">PRO 剩餘 {proDays === null ? "∞" : `${proDays} 天`}</div>
                      <button type="button" className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-muted transition hover:bg-white/5 hover:text-[var(--text)]" onClick={async () => { try { const estimate = await apiGet<{ kind: string; bytes: number; novaCost: number }>("/exports/my-learning/estimate?kind=vocabulary"); const ok = window.confirm(`匯出我的單字將產生約 ${(estimate.bytes / 1024).toFixed(1)} KB 檔案，需消耗 ${estimate.novaCost} Nova。確認後才會扣點並下載。`); if (ok) window.location.href = "/api/v1/exports/my-learning?kind=vocabulary"; } catch (err) { toast.push("error", errorMessage(err)); } }}>我的單字匯出<span aria-hidden="true">↓</span></button>
                    </>}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setAccountMenuOpen(false); setRedeemOpen(true); }}
                      className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-[#d9d0ff] transition hover:bg-[#7c5cff]/10"
                    >
                      <span className="flex items-center gap-2"><span aria-hidden="true">✦</span>輸入兌換碼</span><span aria-hidden="true">→</span>
                    </button>
                    <div className="my-1.5 border-t border-[var(--line)]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void logout()}
                      className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-rose-200 transition hover:bg-rose-500/10"
                    >
                      <span>登出</span><span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-main mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
          {featureNotices.length > 0 && <section aria-label="功能公告" className="mb-3 space-y-2">{featureNotices.map((notice) => <div key={notice.id} className="rounded-2xl border-2 border-[#ffc857]/70 bg-gradient-to-r from-[#ffc857]/20 via-[#7c5cff]/10 to-[#37d3ff]/10 p-4 shadow-[0_0_24px_rgba(255,200,87,0.12)]"><div className="flex items-start gap-3"><span className="mt-0.5 text-lg text-[#ffd98a]" aria-hidden="true">⚠</span><div className="min-w-0 flex-1"><p className="text-sm font-black text-[#ffe7ad]">{notice.title}</p><p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-[var(--text)]">{notice.body}</p>{notice.link && <Link href={notice.link} className="mt-2 inline-block text-xs font-bold text-[#7dd3fc] underline">查看詳細說明 →</Link>}</div></div></div>)}</section>}
          {FEATURE_GUIDANCE[featureKey] && <div className="mb-4 rounded-xl border border-[#37d3ff]/35 bg-[#37d3ff]/8 px-3 py-2.5 text-xs leading-5"><span className="font-black text-[#7dd3fc]">{FEATURE_GUIDANCE[featureKey].title}：</span><span className="text-muted"> {FEATURE_GUIDANCE[featureKey].text}</span></div>}
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
      <nav aria-label="手機主要導覽" className="bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[color:var(--bg)]/95 backdrop-blur-xl lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 py-1.5 sm:px-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={`mobile-nav-item focus-ring flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-medium leading-none sm:px-1 sm:text-[11px] ${active ? "bg-white/10 text-[#37d3ff]" : "text-muted"}`}
                >
                  <SymbolIcon name={item.icon} size={18} active={active} className="shrink-0 sm:h-5 sm:w-5" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Novi dock */}
      <div className="novi-dock fixed right-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:right-5" style={{ transform: `translate(${noviPosition.x}px, ${noviPosition.y}px)` }}>
        {!noviOpen && encouragement && (
          <button type="button" onClick={() => setNoviOpen(true)} className="glass anim-pop max-w-[min(82vw,300px)] p-3 text-left text-xs leading-relaxed text-[#e8edff] shadow-[0_0_28px_rgba(55,211,255,0.18)]">
            <span className="mb-1 block text-[10px] font-semibold tracking-wider text-[#37d3ff]">Novi 給你的話</span>
            {encouragement.text}
          </button>
        )}
        {noviOpen && (
          <div className="glass novi-mobile-panel anim-pop w-[min(92vw,340px)] p-3">
            <div className="flex items-start gap-2">
              <NoviAvatar size={54} state={noviState} level={level} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Novi 小助理</p>
                <p className="text-[11px] text-muted">Lv.{level}・你的專屬 AI 學習夥伴</p>
                {!encouragement && <p className="mt-1 text-[11px] text-[#7dd3fc]">{pagePrompt}</p>}
              </div>
              <button onClick={() => setNoviOpen(false)} aria-label="收起 Novi" className="focus-ring rounded-lg px-1.5 text-muted hover:bg-white/10">
                ✕
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-2.5">
              <div className="flex items-center gap-2">
                <label htmlFor="novi-quick-mode" className="shrink-0 text-[10px] font-semibold text-[#7dd3fc]">對話模式</label>
                <select id="novi-quick-mode" value={quickChatMode} onChange={(event) => void changeQuickMode(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-black/25 px-2 py-1.5 text-xs text-[var(--text)]">
                  {NOVI_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
                </select>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-muted">{NOVI_MODES.find((mode) => mode.key === quickChatMode)?.description}</p>
              {quickChatReply && <div className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-black/25 p-2 text-xs leading-relaxed">{quickChatReply}</div>}
              <div className="mt-2 flex gap-1.5">
                <Input value={quickChatInput} onChange={(event) => setQuickChatInput(event.target.value)} onFocus={touchNovi} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuickChat(); } }} placeholder="直接問 Novi…" disabled={quickChatSending} className="min-w-0" />
                <Button size="sm" onClick={() => void sendQuickChat()} loading={quickChatSending} disabled={!quickChatInput.trim()}>送出</Button>
              </div>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto scroll-thin rounded-xl bg-black/25 p-2.5 text-xs leading-relaxed">
              {adviceLoading ? <Skeleton lines={2} /> : encouragement?.text || advice || pagePrompt || summary.data?.greeting || "點下方按鈕，我來告訴你今天該做什麼。"}
            </div>
            <div role="menu" aria-label="Novi 快速功能" className="mt-2 grid grid-cols-2 gap-1.5">
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
              <button onPointerDown={(event) => { noviDrag.current = { startX: event.clientX, startY: event.clientY, x: noviPosition.x, y: noviPosition.y }; }} onClick={() => { touchNovi(); setQuickChatReply((current) => current || "嗨！點下面的輸入框就能直接和我聊天。你不一定要完美，我們先完成下一步。\n\n拖曳我到你習慣的位置，太久沒有互動我會自動縮小。 "); }} className="focus-ring cursor-grab rounded-full active:cursor-grabbing" aria-label="開啟 Novi 小助理">
                <NoviAvatar size={58} state={encouragement?.state ?? (noviOpen ? "happy" : "idle")} level={level} />
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

      {/* Redeem code */}
      <Modal open={redeemOpen} onClose={() => { if (!redeeming) { setRedeemOpen(false); setRedeemCode(""); } }} title="輸入兌換碼">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#7c5cff]/25 bg-[#7c5cff]/10 p-3.5">
            <p className="text-sm font-medium text-[#e9e3ff]">解鎖你的專屬獎勵</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">輸入管理員提供的兌換碼，可獲得 Nova、XP 或 Nova Pro 天數。每組兌換碼每個帳號只能使用一次。</p>
          </div>
          <Field label="兌換碼" required hint="不區分大小寫，前後空白會自動移除。">
            <Input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void redeemCoupon(); }}
              placeholder="例如：NOVA-2026"
              maxLength={40}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={redeeming}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => { setRedeemOpen(false); setRedeemCode(""); }} disabled={redeeming}>取消</Button>
            <Button onClick={() => void redeemCoupon()} loading={redeeming} disabled={!redeemCode.trim()}>確認兌換</Button>
          </div>
        </div>
      </Modal>

      {/* First-login PWA and notification guide */}
      <Modal open={installGuideOpen} onClose={() => { localStorage.setItem("sn-install-guide-seen", "1"); setInstallGuideOpen(false); window.setTimeout(() => setUsageGuideOpen(true), 120); }} title="先把 StudyNova 加到主畫面">
        <div className="space-y-3 text-sm">
          {inAppBrowser && <div className="rounded-xl border-2 border-rose-300/70 bg-rose-400/15 p-3 text-xs leading-5 text-rose-50"><p className="font-black">目前是在 App 內建瀏覽器中</p><p className="mt-1">為了避免安裝失敗或被誤判，請點右上角／右下角的「⋯」或分享按鈕，選擇「在 Chrome／Safari 開啟」，再回到這裡安裝。StudyNova 不會要求下載任何不明檔案。</p></div>}
          {androidDevice && <div className="rounded-xl border-2 border-[#ffc857]/70 bg-[#ffc857]/10 p-3 text-xs leading-5 text-[#fff1c7]"><p className="font-black">Android 安裝提醒</p><p className="mt-1">若 Chrome 顯示安全警告，請先點「了解詳細」，確認網址是你的 StudyNova 網站，再按「仍要安裝」。請勿在網址不正確或來源不明時繼續。</p></div>}
          <p className="text-muted">為了即時收到限定功能、每週小考與 Novi 提醒，請先開啟通知，再把網站安裝到手機主畫面。</p>
          <Button full onClick={async () => {
            if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
            else toast.push("info", androidDevice ? "請在 Chrome 選單點「安裝應用程式」；若出現警告，點「了解詳細」確認網址後再按「仍要安裝」。" : "請使用瀏覽器選單的「加入主畫面／安裝應用程式」");
          }}>安裝到主畫面</Button>
          <Button full variant="ghost" onClick={async () => {
            if ("Notification" in window) { const permission = await Notification.requestPermission(); toast.push(permission === "granted" ? "success" : "info", permission === "granted" ? "通知已開啟" : "請在瀏覽器設定允許通知"); }
          }}>開啟通知</Button>
          <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            <div className="glass-soft p-3"><p className="font-semibold text-white">iPhone／iPad</p><p className="mt-1">使用 Safari 開啟網站 → 點底部分享按鈕 → 選「加入主畫面」→ 按「加入」。請先在 iOS 設定 → 通知 → Safari 開啟通知。</p></div>
            <div className="glass-soft p-3"><p className="font-semibold text-white">Android</p><p className="mt-1">使用 Chrome 開啟網站 → 點右上角 ⋮ → 選「安裝應用程式」或「加到主畫面」→ 確認安裝。出現通知提示時請選「允許」。</p></div>
          </div>
          <p className="text-[11px] text-muted">你也可以稍後在個人設定重新查看教學。網站會在開啟期間每 10 秒同步公告與通知。</p>
        </div>
      </Modal>

      <Modal open={usageGuideOpen} onClose={() => { localStorage.setItem("sn-usage-guide-seen", "1"); setUsageGuideOpen(false); }} title="StudyNova 使用方法與重要注意事項">
        <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1 text-sm">
          <div className="rounded-xl border-2 border-[#ffc857]/60 bg-[#ffc857]/10 p-3"><p className="font-black text-[#ffe7ad]">先記住：StudyNova 是你的學習助手，不是壓力來源。</p><p className="mt-1 text-xs leading-5 text-muted">每日建議都可以跳過、調整或重新安排；請依自己的時間與狀態使用。</p></div>
          {[['首頁／讀書計畫','查看今日建議、學習進度、弱點與 AI 安排的讀書區塊。可勾選完成，也可以只挑一個最適合現在的項目。'],['學習中心','複習單字、錯題、專注計時與學習紀錄；日期與範圍請確認後再儲存。'],['Novi AI','可切換學習教練、解題、提示、考試、筆記、錯題與複習模式。涉及讀取或寫入資料時，請先確認授權與預覽。'],['智慧壓縮','上傳前確認檔案類型、大小與目標尺寸；批次處理前請確認 ZIP 內容與下載位置。'],['資料匯出','先選資料並查看樣本預覽，再進行兩次確認；正式匯出會依格式扣除 Nova，請確認點數餘額。'],['每週小考／挑戰','提交答案前確認題目與答案；活動獎勵、優惠碼與 Nova 交易紀錄請以系統結果為準。'],['公告與注意事項','醒目公告會固定在相關功能頂部；若公告已撤銷或超過結束時間，畫面會自動隱藏。']].map(([title, text]) => <div key={title} className="glass-soft border border-[var(--line)] p-3"><p className="font-bold text-[#7dd3fc]">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{text}</p></div>)}
          <p className="text-[11px] text-muted">你可以在個人設定重新查看本說明；遇到異常請保留畫面與錯誤代碼，再到「回報問題」提交。</p>
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
