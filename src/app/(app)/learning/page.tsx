"use client";
import Link from "next/link";
import { useState } from "react";
import { apiPost, errorMessage, useApi } from "@/lib/api";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { learningSubjects } from "@/content/learning/ch1";

type Video = { id: string; title: string; description: string; subject: string; chapter: string; proOnly: boolean; hasVideo: boolean; status: string };

export default function LearningHomePage() {
  const toast = useToast();
  const videos = useApi<{ videos: Video[]; protection: { note: string } }>("/learning/videos");
  const [selected, setSelected] = useState<Video | null>(null);
  const access = useApi<{ canWatch: boolean }>(selected ? `/learning/videos/${selected.id}/access` : null, [selected?.id]);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  async function redeem() {
    if (!selected || !code.trim()) return;
    setRedeeming(true);
    try { await apiPost(`/learning/videos/${selected.id}/redeem`, { code }); toast.push("success", "試看碼兌換成功，現在可以觀看這部影片！"); setCode(""); await access.reload(); }
    catch (error) { toast.push("error", errorMessage(error)); }
    finally { setRedeeming(false); }
  }
  return <div className="space-y-6 pb-24">
    <header className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,.22),transparent_35%),linear-gradient(135deg,rgba(15,23,42,.96),rgba(30,41,59,.88))] p-6 sm:p-8">
      <div className="relative z-10 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.25em] text-cyan-200">StudyNova Learning</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">📚 線上學習</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">選擇一個學習科目，沿著課程、互動教學、練習與回饋，一步一步真正建立理解。</p></div><div className="pointer-events-none absolute -right-10 -top-12 text-[12rem] opacity-10">✦</div>
    </header>
    <section className="relative overflow-hidden rounded-[2rem] border border-fuchsia-300/30 bg-[radial-gradient(circle_at_85%_15%,rgba(217,70,239,.32),transparent_32%),radial-gradient(circle_at_15%_90%,rgba(56,189,248,.2),transparent_40%),linear-gradient(135deg,#101b3d,#251044)] p-6 shadow-[0_0_70px_rgba(168,85,247,.18)] sm:p-8">
      <div className="pointer-events-none absolute -right-8 -top-16 text-[11rem] text-fuchsia-200/10">✦</div>
      <div className="relative z-10"><Badge tone="violet">限時段考衝刺 · Video Learning</Badge><h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">段考限時重點整理講解影片</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">英文文法、單字片語、閱讀技巧、段考重點與考前複習，跟著 Novi 把最後的關鍵觀念一次整理好。</p><div className="mt-5 flex flex-wrap gap-3"><span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100">✦ Nova Pro 可直接觀看</span><span className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-2 text-xs font-bold text-cyan-100">🔐 輸入試看碼解鎖一部</span></div></div>
      <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{videos.data?.videos.slice(0, 3).map((video) => <button key={video.id} type="button" onClick={() => setSelected(video)} className="group rounded-2xl border border-white/15 bg-black/20 p-4 text-left transition hover:-translate-y-1 hover:border-fuchsia-200/60 hover:bg-white/10"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-cyan-300 text-xl text-slate-950 shadow-lg transition group-hover:scale-110">▶</span><span className="min-w-0"><b className="block truncate text-sm text-white">{video.title}</b><small className="text-slate-300">{video.subject}・{video.chapter || "段考重點"}</small></span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-300">{video.description || "本部影片將整理段考前最需要掌握的重點。"}</p></button>)}{!videos.data?.videos.length && <div className="rounded-2xl border border-dashed border-white/20 bg-black/15 p-5 text-sm text-slate-300">影片即將上架，管理員完成發布後會在這裡顯示。準備好迎接第一支重點整理！</div>}</div>
      <p className="relative z-10 mt-4 text-[11px] leading-5 text-slate-400">{videos.data?.protection.note ?? "影片需要登入並通過觀看權限驗證；平台不提供下載按鈕或永久公開影片網址。"}</p>
    </section>
    {selected && <Card title={selected.title} subtitle="觀看權限保護中"><div className="space-y-4"><div className="rounded-2xl border border-cyan-300/20 bg-black/20 p-4 text-sm leading-6 text-slate-200"><p>Nova Pro 可直接觀看；一般會員請輸入管理員提供的試看碼，試看碼只會解鎖指定影片。</p><ul className="mt-2 list-disc pl-5 text-xs text-slate-400"><li>不提供下載按鈕或公開固定網址</li><li>影片失效或停用後會立即停止播放</li><li>瀏覽器播放無法完全阻止外部螢幕錄影，請勿分享內容</li></ul></div><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="輸入試看碼，例如 SN-XXXXXXXXXX" autoComplete="off" /><div className="flex flex-wrap gap-2"><Button loading={redeeming} disabled={!code.trim()} onClick={() => void redeem()}>兌換並觀看</Button><Button variant="ghost" onClick={() => setSelected(null)}>稍後再看</Button></div>{access.loading && <p className="text-xs text-muted">正在確認觀看權限…</p>}{access.data?.canWatch && <video controls controlsList="nodownload noplaybackrate" disablePictureInPicture onContextMenu={(event) => event.preventDefault()} className="w-full rounded-2xl bg-black" src={`/api/v1/learning/videos/${selected.id}/stream`} />}</div></Card>}
    <section className="grid gap-3 sm:grid-cols-2">
      <Link href="/study?tab=ai-generate" className="group rounded-2xl border-2 border-violet-300/30 bg-gradient-to-br from-violet-500/15 to-cyan-400/5 p-5 transition hover:-translate-y-0.5 hover:border-violet-200/60"><div className="flex items-start justify-between gap-3"><div><Badge tone="violet">AI 學習工具</Badge><h2 className="mt-2 text-xl font-black">AI幫你出</h2><p className="mt-2 text-sm leading-6 text-muted">上傳檔案或選教材，讓 AI 依科目、難度與題數產生專屬測驗。</p></div><span className="text-4xl">✦</span></div><p className="mt-4 text-sm font-semibold text-violet-200">開始 AI 出題 →</p></Link>
      <Link href="/ai" className="group rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-cyan-200/60"><div className="flex items-start justify-between gap-3"><div><Badge tone="cyan">Novi AI</Badge><h2 className="mt-2 text-xl font-black">問 Novi</h2><p className="mt-2 text-sm leading-6 text-muted">解題、整理筆記、規劃複習，或請 Novi 根據你的學習紀錄給建議。</p></div><span className="text-4xl">◈</span></div><p className="mt-4 text-sm font-semibold text-cyan-200">開啟 Novi AI →</p></Link>
    </section>
    <section><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">選擇學習科目</h2><p className="mt-1 text-xs text-muted">已完成的科目會顯示可進入的課程；其他科目會明確標示開發狀態。</p></div><Badge tone="cyan">多科目架構</Badge></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{learningSubjects.map((subject) => subject.status === "PUBLISHED" ? <Link key={subject.slug} href={`/learning/${subject.slug}`} className="group"><Card className="h-full transition duration-200 group-hover:-translate-y-1 group-hover:border-cyan-300/40"><div className="flex items-start justify-between gap-3"><span className="text-4xl">{subject.icon}</span><Badge tone="cyan">{subject.statusLabel}</Badge></div><h3 className="mt-5 text-lg font-bold">{subject.title}</h3><p className="mt-2 text-sm leading-6 text-muted">{subject.subtitle}</p><div className="mt-5 text-sm font-semibold text-cyan-200">開始學習 <span className="transition group-hover:ml-1">→</span></div></Card></Link> : <Card key={subject.slug} className="h-full opacity-80"><div className="flex items-start justify-between gap-3"><span className="text-4xl grayscale">{subject.icon}</span><Badge tone="gold">{subject.statusLabel}</Badge></div><h3 className="mt-5 text-lg font-bold">{subject.title}</h3><p className="mt-2 text-sm leading-6 text-muted">{subject.subtitle}</p><div className="mt-5 rounded-xl border border-amber-200/15 bg-amber-200/5 p-3 text-xs leading-5 text-amber-100">🚧 這個科目正在開發中<br />StudyNova 正在準備完整的互動式課程。</div></Card>)}</div>
    </section>
  </div>;
}
