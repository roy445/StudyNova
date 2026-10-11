"use client";

import Link from "next/link";
import { SymbolIcon, type SymbolName } from "@/components/Symbol";

type Feature = { href: string; icon: SymbolName; title: string; description: string; tone: string };

const FEATURES: Feature[] = [
  { href: "/ai", icon: "nova", title: "Novi AI 助教", description: "提問、解析與執行學習操作", tone: "violet" },
  { href: "/study", icon: "study", title: "學習中心", description: "教材、AI 出題、錯題與單字", tone: "cyan" },
  { href: "/ai-question-converter", icon: "weekly", title: "AI 題目互動化", description: "PDF 題目先預覽，再建立互動題組", tone: "violet" },
  { href: "/ai-quiz", icon: "question", title: "AI 測驗", description: "建立互動測驗並查看解析", tone: "violet" },
  { href: "/learning", icon: "book", title: "線上學習", description: "依章節閱讀課程與教材", tone: "blue" },
  { href: "/solve", icon: "camera", title: "拍照解題", description: "上傳題目取得步驟解析", tone: "emerald" },
  { href: "/chemistry", icon: "science", title: "數學與自然", description: "公式、化學式與科學工具", tone: "amber" },
  { href: "/weekly", icon: "weekly", title: "每週小考", description: "完成週考並查看解析", tone: "amber" },
  { href: "/challenge", icon: "challenge", title: "好友挑戰", description: "與同學進行限時練習", tone: "rose" },
  { href: "/pk", icon: "duel", title: "線上 PK", description: "真人配對即時作答競賽", tone: "rose" },
  { href: "/grades", icon: "grades", title: "成績分析", description: "查看成績、弱科與趨勢", tone: "blue" },
  { href: "/essay", icon: "pen", title: "作文批改", description: "取得文章結構與表達建議", tone: "emerald" },
  { href: "/compress", icon: "archive", title: "智慧壓縮", description: "整理與壓縮學習檔案", tone: "cyan" },
];

const toneClass: Record<string, string> = {
  violet: "border-violet-300/25 bg-violet-300/[.06] hover:border-violet-200/60",
  cyan: "border-cyan-300/25 bg-cyan-300/[.06] hover:border-cyan-200/60",
  blue: "border-blue-300/25 bg-blue-300/[.06] hover:border-blue-200/60",
  emerald: "border-emerald-300/25 bg-emerald-300/[.06] hover:border-emerald-200/60",
  amber: "border-amber-300/25 bg-amber-300/[.06] hover:border-amber-200/60",
  rose: "border-rose-300/25 bg-rose-300/[.06] hover:border-rose-200/60",
};

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl py-1 sm:py-5">
      <header className="mb-4 border-b border-white/10 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-cyan-200/80">StudyNova</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">功能總攬</h1>
        <p className="mt-1 text-sm text-muted">選擇你現在要使用的學習工具</p>
      </header>
      <section aria-label="StudyNova 功能列表" className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Link key={feature.href} href={feature.href} className={`group flex min-h-[104px] items-center gap-2 rounded-2xl border p-3 transition duration-150 hover:-translate-y-0.5 hover:bg-white/[.1] focus:outline-none focus:ring-2 focus:ring-cyan-300/60 sm:min-h-[92px] sm:gap-3 sm:p-4 ${toneClass[feature.tone]}`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20 text-cyan-100 sm:h-11 sm:w-11"><SymbolIcon name={feature.icon} size={20} /></span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-white sm:text-sm">{feature.title}</span>
              <span className="mt-1 block text-[10px] leading-4 text-muted sm:text-xs sm:leading-5">{feature.description}</span>
            </span>
            <span className="ml-auto hidden text-lg text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80 sm:block">→</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
