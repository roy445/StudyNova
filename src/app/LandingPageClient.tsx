"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark, Wordmark } from "@/components/brand";
import { SymbolIcon, type SymbolName } from "@/components/Symbol";

const FEATURES: Array<{ icon: SymbolName; eyebrow: string; title: string; desc: string; href: string; tone: string }> = [
  { icon: "grades", eyebrow: "整理與回顧", title: "成績與學習紀錄", desc: "集中管理段考、小考與學習紀錄，回頭看見自己需要補強的地方。", href: "/login?next=%2Fgrades", tone: "cyan" },
  { icon: "camera", eyebrow: "從教材開始", title: "教材與 OCR", desc: "上傳課本、講義或考卷，整理成可複習的學習內容。", href: "/login?next=%2Ftextbooks", tone: "violet" },
  { icon: "nova", eyebrow: "遇到問題時", title: "Novi AI 助理", desc: "針對題目、教材與學習方法提問，從目前的內容開始理解。", href: "/login?next=%2Fai", tone: "blue" },
  { icon: "question", eyebrow: "練習與複習", title: "AI 出題與錯題本", desc: "從教材建立練習，留下錯題，讓下一次複習更有方向。", href: "/login?next=%2Fstudy", tone: "gold" },
  { icon: "weekly", eyebrow: "段考準備", title: "段考與每週小考", desc: "依照目前開放的考試內容，使用單字、題目與測驗功能準備。", href: "/login?next=%2Fexam-prep", tone: "cyan" },
  { icon: "audio", eyebrow: "語音學習", title: "朗讀與背誦練習", desc: "使用現有的語音工具練習文章、單字與口說內容。", href: "/login?next=%2Fstudy", tone: "violet" },
];

const STEPS = [
  ["01", "先選一個科目", "從學習中心、段考專區或教材開始，不必一次設定所有內容。"],
  ["02", "選擇合適的工具", "依照今天的目的，使用閱讀、練習、單字或 AI 助理。"],
  ["03", "留下你的學習紀錄", "登入後，學習內容與紀錄會保留在自己的 StudyNova 空間。"],
] as const;

export default function LandingPageClient() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`landing-page ${ready ? "landing-ready" : ""}`}>
      <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
      <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
      <header className="landing-nav">
        <Link href="/" className="landing-brand focus-ring" aria-label="StudyNova 首頁"><Wordmark size={38} /></Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="首頁導覽">
          <a href="#features" className="landing-nav-link focus-ring">學習功能</a>
          <a href="#start" className="landing-nav-link focus-ring">使用方式</a>
          <Link href="/login?next=%2Flearning" className="landing-nav-link focus-ring">學習資源</Link>
          <Link href="/faq" className="landing-nav-link focus-ring">常見問題</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="landing-login focus-ring">登入</Link>
          <Link href="/register" className="landing-signup focus-ring">免費註冊 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker"><span className="landing-kicker-dot" /> YOUR STUDY SPACE</p>
            <h1>讓學習更有方向，<br /><span>從今天開始進步。</span></h1>
            <p className="landing-lead">StudyNova 把科目、教材、練習、成績與 AI 助理放在同一個學習空間。先找到現在需要的工具，再一步一步開始。</p>
            <div className="landing-actions">
              <Link href="/register" className="landing-primary focus-ring">開始使用 <span aria-hidden="true">→</span></Link>
              <a href="#features" className="landing-secondary focus-ring">先了解功能</a>
            </div>
            <p className="landing-note"><span aria-hidden="true">✓</span> 註冊後建立自己的 NOVA ID　·　登入即可保留學習內容</p>
          </div>
          <div className="landing-preview" aria-label="StudyNova 學習空間示意">
            <div className="landing-preview-top"><div><span className="landing-preview-label">MY STUDY SPACE</span><h2>今天，從一小步開始</h2></div><LogoMark size={38} glow={false} /></div>
            <div className="landing-preview-rule" />
            <div className="landing-preview-focus"><div className="landing-preview-check">✓</div><div><p>今日學習入口</p><span>先選擇一個想處理的科目</span></div><span className="landing-preview-arrow">→</span></div>
            <div className="landing-preview-grid"><div><SymbolIcon name="grades" size={20} /><span>成績分析</span></div><div><SymbolIcon name="camera" size={20} /><span>教材 OCR</span></div><div><SymbolIcon name="nova" size={20} /><span>Novi AI</span></div></div>
            <div className="landing-preview-footer"><span className="landing-pulse" />StudyNova learning space <span>可從這裡開始</span></div>
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="landing-section-heading"><div><p className="landing-kicker">WHAT YOU CAN DO</p><h2>把需要的學習工具，放在同一個地方</h2></div><p>目前已開放的功能會依照登入身分、後台設定與資料內容顯示。</p></div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature, index) => <Link key={feature.title} href={feature.href} className={`landing-feature landing-feature-${feature.tone} focus-ring`} style={{ "--delay": `${index * 55}ms` } as React.CSSProperties}>
              <div className="landing-feature-icon"><SymbolIcon name={feature.icon} size={21} /></div><div className="landing-feature-content"><p>{feature.eyebrow}</p><h3>{feature.title}</h3><span>{feature.desc}</span><b>登入後使用 <i aria-hidden="true">↗</i></b></div>
            </Link>)}
          </div>
        </section>

        <section id="start" className="landing-section landing-start-section">
          <div className="landing-section-heading"><div><p className="landing-kicker">A SIMPLE START</p><h2>第一次使用，從這裡開始</h2></div><p>不需要先熟悉所有功能，照著自己的需要選擇下一步即可。</p></div>
          <div className="landing-steps">{STEPS.map(([number, title, desc]) => <div key={number} className="landing-step"><span>{number}</span><div><h3>{title}</h3><p>{desc}</p></div></div>)}</div>
        </section>

        <section className="landing-cta"><div><p className="landing-kicker">READY WHEN YOU ARE</p><h2>準備好開始了嗎？</h2><p>建立帳號，從一個科目或一份教材開始。</p></div><div className="landing-cta-actions"><Link href="/register" className="landing-primary focus-ring">免費註冊 <span aria-hidden="true">→</span></Link><Link href="/login" className="landing-cta-login focus-ring">登入帳號</Link></div></section>
      </main>

      <footer className="landing-footer"><span>© StudyNova · 你的學習空間</span><span className="landing-footer-links"><Link href="/privacy">隱私條款</Link><Link href="/terms">使用條款</Link><Link href="/support">回報問題</Link></span></footer>
    </div>
  );
}
