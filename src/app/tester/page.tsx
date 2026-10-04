"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { apiSend, errorMessage, useApi } from "@/lib/api";
import { FeedbackBoard } from "@/components/tester/FeedbackBoard";

type Overview = {
  groupName: string;
  features: Array<{ feature: string; label: string; category: string; testerDescription: string }>;
  reports: Array<{ ticketNo: string; title: string; severity: string; status: string; adminNote: string; createdAt: string }>;
};

const statusLabel: Record<string, string> = { open: "待處理", in_progress: "處理中", resolved: "已解決", rejected: "不受理", duplicate: "重複回報" };

export default function TesterPage() {
  const toast = useToast();
  const state = useApi<Overview>("/tester/overview");
  const [form, setForm] = useState({ feature: "", severity: "normal", title: "", description: "" });
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const feature = form.feature || "一般測試";
      const data = new FormData();
      data.append("category", "tester");
      data.append("severity", form.severity);
      data.append("title", `[${feature}] ${form.title}`);
      data.append("description", `測試功能：${feature}\n\n${form.description}`);
      data.append("pageUrl", window.location.href);
      const result = await apiSend<{ ticketNo: string }>("/support/issues", "POST", data);
      toast.push("success", `已直接送到管理員回報中心：${result.ticketNo}`);
      setForm({ feature: "", severity: "normal", title: "", description: "" });
      await state.reload();
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <div className="mx-auto max-w-4xl p-5 text-sm text-muted">正在載入測試員控制台…</div>;
  if (state.error || !state.data) return <div className="mx-auto max-w-4xl p-5"><EmptyState icon="✦" title="測試員資格尚未啟用" hint={state.error ?? "請聯絡管理員加入測試員身分組。"} /></div>;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#21163f_0%,#080b18_45%,#060711_100%)] px-3 py-5 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-violet-300/35 bg-white/[.055] p-5 shadow-[0_0_55px_rgba(167,139,250,.14)] backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.28em] text-violet-200">StudyNova Beta Lab</p><h1 className="mt-2 text-3xl font-black tracking-tight"><span className="tester-name">測試員控制台</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">提前體驗指定功能、留下可追蹤的測試回報，直接送到管理員的回報中心。</p></div>
            <div className="flex items-center gap-2"><Badge tone="cyan">{state.data.groupName}</Badge><Link href="/dashboard" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold transition hover:border-violet-300/50 hover:bg-violet-300/10">回學生端</Link></div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <Card title="目前可測試功能" subtitle="管理員開啟後會立即出現在這裡。">
            <div className="space-y-2">{state.data.features.map((item) => <div key={item.feature} className="rounded-2xl border border-violet-300/25 bg-violet-300/[.06] p-3 transition hover:-translate-y-0.5 hover:border-violet-200/60 hover:bg-violet-300/[.12]"><div className="flex items-center justify-between gap-2"><div><p className="font-bold text-violet-100">{item.label}</p><p className="mt-1 text-[11px] text-slate-400">{item.category} · <code>{item.feature}</code></p></div><Badge tone="gold">BETA</Badge></div>{item.testerDescription && <p className="mt-2 text-xs leading-5 text-slate-300">{item.testerDescription}</p>}</div>)}{!state.data.features.length && <EmptyState icon="◇" title="目前沒有開放中的測試功能" hint="請等待管理員開啟 Beta 功能。" />}</div>
          </Card>

          <Card title="直接回報給管理員" subtitle="回報會自動附上測試員分類與目前頁面。">
            <form className="space-y-3" onSubmit={submit}><Field label="測試功能"><Select value={form.feature} onChange={(e) => setForm({ ...form, feature: e.target.value })}><option value="">一般測試</option>{state.data.features.map((item) => <option key={item.feature} value={item.label}>{item.label}</option>)}</Select></Field><Field label="嚴重程度"><Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">輕微</option><option value="normal">一般</option><option value="high">嚴重</option><option value="blocker">完全無法使用</option></Select></Field><Field label="標題" required><Input required minLength={4} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：AI 相機第二次分析卡住" /></Field><Field label="重現步驟與期待結果" required><Textarea required minLength={10} rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="請描述：怎麼操作、實際看到什麼、原本期待什麼。" /></Field><Button full loading={busy} className="tester-button" type="submit">送出測試回報</Button></form>
          </Card>
        </section>

        <FeedbackBoard />

        <Card title="我的測試回報" subtitle="管理員更新狀態後會在這裡顯示。"><div className="space-y-2">{state.data.reports.map((report) => <div key={report.ticketNo} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3"><div><p className="font-semibold">{report.title}</p><p className="mt-1 text-xs text-slate-400">{report.ticketNo} · {new Date(report.createdAt).toLocaleString("zh-TW")}</p>{report.adminNote && <p className="mt-1 text-xs text-violet-200">管理員：{report.adminNote}</p>}</div><Badge tone={report.status === "resolved" ? "green" : report.status === "rejected" ? "rose" : "cyan"}>{statusLabel[report.status] ?? report.status}</Badge></div>)}{!state.data.reports.length && <p className="text-sm text-muted">你還沒有送出測試回報。</p>}</div></Card>
      </div>
    </main>
  );
}
