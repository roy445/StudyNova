"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { apiPost, errorMessage } from "@/lib/api";

export default function TesterApplyPage() {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", ageRange: "高中／大學生", device: "手機與電腦", motivation: "", experience: "", availability: "每週 1–2 小時" });
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiPost<{ ticketNo: string }>("/tester/applications", form);
      setSent(result.ticketNo);
      toast.push("success", "測試員申請已送出");
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <main className="min-h-dvh px-4 py-10"><Card className="mx-auto max-w-xl text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-4xl text-emerald-200">✓</div><h1 className="mt-5 text-2xl font-black">感謝你申請成為 StudyNova 測試員！</h1><p className="mt-3 text-sm leading-7 text-muted">我們已收到你的資料，申請單號為 <strong className="text-cyan-200">{sent}</strong>。團隊會在 7 天內回覆申請結果，請留意你填寫的 Email 信箱，也請檢查垃圾郵件匣。</p><p className="mt-3 text-xs leading-6 text-muted">測試員名額與資格會依測試活動需求審核；通過後，你會收到測試員資格連結。</p><Link href="/" className="mt-5 inline-block text-sm text-cyan-200 underline">回到 StudyNova</Link></Card></main>;

  return <main className="min-h-dvh px-4 py-8"><div className="mx-auto max-w-2xl"><Link href="/" className="text-sm text-cyan-200 hover:underline">← 回到首頁</Link><header className="mt-5 rounded-3xl border border-violet-300/25 bg-violet-300/[.06] p-6"><p className="text-xs font-black uppercase tracking-[.25em] text-violet-200">StudyNova Beta Lab</p><h1 className="mt-2 text-3xl font-black">測試員志願者徵選</h1><p className="mt-3 text-sm leading-7 text-muted">提前體驗新功能、找出問題，並把真實心得直接交給 StudyNova 團隊。不需要技術背景，只要願意嘗試與提供具體回饋即可。</p></header><Card className="mt-5" title="測試員申請表" subtitle="請誠實填寫，團隊會在 7 天內透過 Email 回覆。"><form className="space-y-4" onSubmit={submit}><div className="grid gap-3 sm:grid-cols-2"><Field label="姓名／暱稱" required><Input required minLength={2} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例如：小安" /></Field><Field label="Email 信箱" required><Input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" /></Field><Field label="目前身分"><Select value={form.ageRange} onChange={(e) => update("ageRange", e.target.value)}><option>國中生</option><option>高中生</option><option>大學生</option><option>教師／教育工作者</option><option>其他</option></Select></Field><Field label="主要測試裝置"><Select value={form.device} onChange={(e) => update("device", e.target.value)}><option>手機</option><option>電腦</option><option>手機與電腦</option><option>平板</option></Select></Field><Field label="每週可投入時間"><Select value={form.availability} onChange={(e) => update("availability", e.target.value)}><option>少於 1 小時</option><option>每週 1–2 小時</option><option>每週 3–5 小時</option><option>5 小時以上</option></Select></Field></div><Field label="為什麼想成為測試員？" required><Textarea required minLength={10} rows={4} value={form.motivation} onChange={(e) => update("motivation", e.target.value)} placeholder="請分享你的動機，以及希望幫助 StudyNova 改善什麼。" /></Field><Field label="過去使用學習工具或測試產品的經驗" required><Textarea required minLength={10} rows={4} value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="可以寫你使用過的學習 App、AI 工具或參與測試的經驗。" /></Field><div className="rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-6 text-muted">送出後請留意 Email。若通過審核，客服團隊會寄送「測試員通過」連結；點擊後請重新登入一次，才能取得測試員資格。</div><Button full loading={busy} type="submit">送出測試員申請</Button></form></Card></div></main>;
}
