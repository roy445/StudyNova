"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark, NoviAvatar, StarField, Wordmark } from "@/components/brand";
import { Badge, Button } from "@/components/ui";

const FEATURES = [
  { icon: "⌁", title: "成績管理與 AI 分析", desc: "輸入每次段考、小考成績，自動計算平均、趨勢與弱科，AI 只根據真實數據給建議。" },
  { icon: "▧", title: "拍照 OCR 轉學習內容", desc: "課本、講義、考卷、手寫筆記拍照即可辨識，一鍵變成筆記、題目、記憶卡或複習計畫。" },
  { icon: "✦", title: "Novi AI 學習助理", desc: "學習教練／解題／提示／考試／筆記／錯題／複習／快速八種模式，可讀取你授權的學習資料。" },
  { icon: "▤", title: "AI 出題與錯題本", desc: "依教材與弱點自動出題，答錯自動進錯題本，間隔複習直到完全掌握。" },
  { icon: "◌", title: "錄音分析與背誦測試", desc: "英文朗讀、國文背課文即時評分：流暢度、漏字、速度與完整度，附改善建議。" },
  { icon: "▦", title: "每週小考", desc: "管理員上傳考卷與答案，AI 辨識整理後人工確認發布，週末開放快速背誦與模擬測驗。" },
  { icon: "◇", title: "好友挑戰與讀書房", desc: "用 NOVA ID 加好友、單字 1v1、共享讀書房一起計時，排行榜即時更新。" },
  { icon: "◎", title: "Nova 點數與 Novi 養成", desc: "學習就有 Nova 與 XP，升級 Novi、購買外觀特效，Nova Pro 學習獎勵雙倍。" },
];

export default function LandingPage() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduce) {
      setPhase(3);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 380);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <StarField count={34} />

      {/* Intro overlay – never blocks for long */}
      <div
        className={`pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-[#060915] transition-opacity duration-700 ${phase >= 2 ? "opacity-0" : "opacity-100"}`}
        style={{ visibility: phase >= 3 ? "hidden" : "visible" }}
        aria-hidden
      >
        <div className={`flex flex-col items-center gap-3 transition-all duration-700 ${phase >= 1 ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}>
          <LogoMark size={92} />
          <span className="neon-text text-2xl font-extrabold tracking-tight">StudyNova AI</span>
          <span className="text-xs tracking-[0.3em] text-muted">LOADING · 星軌同步中</span>
        </div>
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Wordmark size={20} />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="focus-ring rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-white/5">
            登入
          </Link>
          <Link href="/register" className="focus-ring rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-3 py-2 text-sm font-medium text-white">
            免費註冊
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
        <section className="grid items-center gap-8 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className={`space-y-5 ${phase >= 3 ? "anim-in" : "opacity-0"}`}>
            <Badge tone="cyan">專為台灣國中・高中生打造</Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              讓學習更聰明，
              <br />
              <span className="neon-text">讓進步看得見。</span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              StudyNova AI 把成績、教材、考卷、錯題、錄音、讀書計畫、好友與 AI 助理 Novi 全部整合在同一個平台。
              不是普通的 AI 聊天網站，而是真正能陪你每天使用的學習管理系統。
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/register">
                <Button size="lg">立即免費開始 →</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  我已經有 NOVA ID
                </Button>
              </Link>
            </div>
            <ul className="grid gap-2 pt-2 text-xs text-muted sm:grid-cols-3">
              <li><span className="mr-1 text-[#37d3ff]">✓</span>註冊即得專屬 NOVA ID</li>
              <li><span className="mr-1 text-[#37d3ff]">✓</span>不需要 Email 驗證</li>
              <li><span className="mr-1 text-[#37d3ff]">✓</span>資料預設完全私人</li>
            </ul>
          </div>

          <div className={`glass relative flex flex-col items-center gap-3 p-6 ${phase >= 3 ? "anim-pop" : "opacity-0"}`}>
            <NoviAvatar size={120} state="happy" level={5} effect="effect-orbit" />
            <p className="text-center text-sm font-semibold">嗨，我是 Novi</p>
            <p className="max-w-xs text-center text-xs leading-relaxed text-muted">
              「你的數學最近進步很多，但英文文法錯題增加，我建議今天花 15 分鐘複習。」
            </p>
            <div className="grid w-full grid-cols-3 gap-2 pt-1 text-center text-[11px]">
              <div className="glass-soft py-2">
                <p className="text-base font-bold text-[#37d3ff]">8</p>
                <p className="text-muted">AI 模式</p>
              </div>
              <div className="glass-soft py-2">
                <p className="text-base font-bold text-[#a78bfa]">5</p>
                <p className="text-muted">Novi 等級</p>
              </div>
              <div className="glass-soft py-2">
                <p className="text-base font-bold text-[#ffc857]">∞</p>
                <p className="text-muted">學習紀錄</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="glass anim-in p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-2 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{f.desc}</p>
            </article>
          ))}
        </section>

        <section className="glass mt-8 flex flex-col items-center gap-3 p-8 text-center">
          <LogoMark size={56} />
          <h2 className="text-xl font-bold sm:text-2xl">今天就開始，讓每一分鐘的努力都被看見</h2>
          <p className="max-w-xl text-sm text-muted">
            註冊只需要 Email、密碼與顯示名稱，系統會立即產生你的專屬 NOVA ID，把它分享給同學就能一起挑戰。
          </p>
          <Link href="/register">
            <Button size="lg">建立我的 NOVA ID</Button>
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--line)] px-4 py-6 text-center text-xs text-muted">
        <span className="flex flex-wrap items-center justify-center gap-3">
          <span>StudyNova AI · 讓學習更聰明，讓進步看得見</span>
          <Link href="/faq" className="underline">常見問題</Link>
          <Link href="/support" className="underline">回報問題</Link>
          <Link href="/privacy" className="underline">隱私條款</Link>
          <Link href="/terms" className="underline">使用條款</Link>
          <Link href="/login" className="underline">登入</Link>
        </span>
      </footer>
    </div>
  );
}
