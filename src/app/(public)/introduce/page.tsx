import Link from "next/link";
import { NoviAvatar, StarField, Wordmark } from "@/components/brand";

const FEATURES = [
  { icon: "Aa", title: "英文單字與智慧複習", body: "單字、詞性、例句、朗讀與錯題紀錄集中管理，讓每一次複習都有下一步。", tone: "cyan" },
  { icon: "▤", title: "英文閱讀分析", body: "從文章理解、重點整理到閱讀紀錄，建立屬於你的英文閱讀節奏。", tone: "violet" },
  { icon: "✎", title: "學測英文作文批改", body: "取得結構、文法、用字與表達建議，把每一次修改變成看得見的進步。", tone: "gold" },
  { icon: "✦", title: "Novi AI 學習助理", body: "不只是回答問題，Novi 會陪你拆解題目、整理筆記與規劃複習。", tone: "green" },
  { icon: "◒", title: "個人化學習分析", body: "從學習時間、正確率、弱點與複習效率，看懂自己的學習狀態。", tone: "cyan" },
  { icon: "◇", title: "挑戰、獎勵與分享", body: "用 Nova、XP、成就與好友挑戰，把穩定學習變成一場有回饋的旅程。", tone: "violet" },
];

const STEPS = [
  ["01", "建立你的學習節奏", "選擇目標、科目與目前進度，StudyNova 會從你的狀態開始。"],
  ["02", "每天完成一小步", "單字、閱讀、作文、錯題與 Novi 對話都會留下可追蹤的學習足跡。"],
  ["03", "讓數據告訴你下一步", "把學習紀錄變成清楚的建議，不再只靠意志力猜自己有沒有進步。"],
];

export default function IntroducePage() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative isolate -mx-4 overflow-hidden rounded-b-[2.5rem] border-b border-cyan-300/15 bg-[#060915] px-5 pb-14 pt-8 sm:px-10 sm:pt-12">
        <StarField count={34} />
        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="回到 StudyNova 首頁"><Wordmark size={38} /></Link>
            <Link href="/login" className="rounded-full border border-cyan-300/30 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/10">開始使用</Link>
          </div>
          <div className="grid items-center gap-10 pt-14 lg:grid-cols-[1.08fr_.92fr] lg:pt-20">
            <div>
              <p className="mb-4 text-xs font-black tracking-[.28em] text-cyan-200">STUDYNOVA · LEARN WITH CLARITY</p>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.12] tracking-tight sm:text-6xl">讓學習更聰明，<span className="neon-text">讓進步看得見。</span></h1>
              <p className="mt-6 max-w-2xl text-sm leading-8 text-[#b4c1e2] sm:text-base">StudyNova 是為國中、高中生打造的 AI 學習平台。把英文單字、閱讀、作文、錯題與學習分析放在同一個地方，讓你每天都知道自己正在變強。</p>
              <div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(55,211,255,.2)] transition hover:-translate-y-0.5">免費開始學習 →</Link><Link href="/faq" className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-[#dbe7ff] transition hover:border-cyan-300/50">了解更多</Link></div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#91a3ca]"><span>✓ 手機優先設計</span><span>✓ 學習資料屬於你</span><span>✓ Novi 隨時陪伴</span></div>
            </div>
            <div className="relative mx-auto w-full max-w-sm">
              <div className="absolute inset-8 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative rounded-[2rem] border border-cyan-300/25 bg-white/[.06] p-7 text-center shadow-[0_0_70px_rgba(55,211,255,.12)] backdrop-blur-xl">
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300/10"><NoviAvatar size={90} state="cheer" float="float-hover" /></div>
                <div className="mx-auto mt-5 max-w-[250px] rounded-2xl rounded-tl-md border border-violet-300/25 bg-violet-400/10 p-4 text-left text-sm leading-6 text-violet-50">嗨！我是 Novi ✦<br />今天也一起把複雜的內容，變成你真正懂的東西吧！</div>
                <p className="mt-5 text-xs font-bold tracking-[.18em] text-cyan-200">YOUR AI STUDY COMPANION</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-1 py-16 sm:py-20"><div className="max-w-2xl"><p className="text-xs font-black tracking-[.24em] text-violet-200">ONE PLACE FOR YOUR PROGRESS</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">不是把功能堆在一起，<br /><span className="text-cyan-200">而是把學習串起來。</span></h2><p className="mt-4 text-sm leading-7 text-muted">StudyNova 會把你每天留下的學習痕跡，連成一條可以回頭看、也知道下一步往哪裡走的路。</p></div><div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((feature) => <article key={feature.title} className="group rounded-3xl border border-white/10 bg-white/[.035] p-5 transition duration-200 hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-white/[.06]"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black ${feature.tone === "gold" ? "bg-[#ffc857]/15 text-[#ffd98a]" : feature.tone === "violet" ? "bg-[#7c5cff]/15 text-[#b9adff]" : feature.tone === "green" ? "bg-emerald-300/15 text-emerald-200" : "bg-[#37d3ff]/15 text-[#9deaff]"}`}>{feature.icon}</div><h3 className="mt-4 font-bold text-[#eff4ff]">{feature.title}</h3><p className="mt-2 text-xs leading-6 text-muted">{feature.body}</p></article>)}</div></section>

      <section className="rounded-[2rem] border border-violet-300/15 bg-gradient-to-br from-violet-400/[.08] via-white/[.02] to-cyan-300/[.06] px-5 py-14 sm:px-10 sm:py-18"><div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-black tracking-[.24em] text-gold-200">HOW IT WORKS</p><h2 className="mt-3 text-3xl font-black">每一次使用，<br />都在幫你更了解自己。</h2></div><div className="space-y-3">{STEPS.map(([number, title, body]) => <div key={number} className="flex gap-4 rounded-2xl border border-white/10 bg-black/15 p-4"><span className="text-sm font-black text-cyan-200">{number}</span><div><h3 className="font-bold">{title}</h3><p className="mt-1 text-xs leading-6 text-muted">{body}</p></div></div>)}</div></div></section>

      <section className="mx-auto max-w-5xl px-1 py-16 text-center sm:py-20"><NoviAvatar size={82} state="happy" variant="stellar" /><h2 className="mx-auto mt-5 max-w-2xl text-3xl font-black sm:text-4xl">準備好讓 Novi 陪你<br /><span className="neon-text">學得更穩、更懂了嗎？</span></h2><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted">從今天的一個單字、一篇閱讀或一段作文開始。你的下一個進步，現在就可以發生。</p><Link href="/register" className="mt-7 inline-flex rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-6 py-3 text-sm font-black text-white shadow-[0_0_28px_rgba(124,92,255,.25)]">和 Novi 一起開始 →</Link></section>
    </div>
  );
}
