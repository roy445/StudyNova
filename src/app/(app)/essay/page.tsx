"use client";

import { useRef, useState } from "react";
import { Card, Button, EmptyState, ErrorState, Skeleton, Badge, useToast } from "@/components/ui";
import { apiDelete, apiPost, errorMessage, useApi } from "@/lib/api";

type Result = {
  ocrText?: string;
  overallFeedback?: string;
  corrections?: Array<{ category: string; original: string; suggestion: string; reason: string; explanation?: string }>;
  spelling?: Array<{ original: string; suggestion: string; reason: string }>;
  scores?: Record<string, number>;
  structure?: { introduction?: string; body?: string; conclusion?: string };
  aiDisclaimer?: string;
};
type Grading = { id: string; status: string; originalText: string; ocrText: string; result: (Result & { meta?: { provider?: string; model?: string } }) | null; errorMessage: string; createdAt: string; completedAt: string | null };

const SCORE_LABELS: Record<string, string> = { grammar: "Grammar", vocabulary: "Vocabulary", spelling: "Spelling", organization: "Organization", coherence: "Coherence", taskAchievement: "Task Achievement", overall: "Overall" };

export default function EssayPage() {
  const toast = useToast();
  const history = useApi<{ gradings: Grading[] }>("/essay/gradings");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState<Grading | null>(null);
  const [busy, setBusy] = useState(false);

  async function grade() {
    if (!file && !text.trim()) {
      toast.push("error", "請上傳英文作文圖片，或先貼上作文文字");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (text.trim()) form.append("originalText", text.trim());
      form.append("idempotencyKey", `essay:${crypto.randomUUID()}`);
      const response = await apiPost<{ grading: Grading }>("/essay/gradings", form);
      setActive(response.grading);
      setFile(null);
      setText("");
      await history.reload();
      toast.push("success", "批改完成，已保存到我的作文");
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("刪除這份作文紀錄？")) return;
    try {
      await apiDelete(`/essay/gradings/${id}`);
      if (active?.id === id) setActive(null);
      await history.reload();
    } catch (error) {
      toast.push("error", errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#37d3ff]">Writing Lab</p>
          <h1 className="mt-1 text-2xl font-black">英文作文批改</h1>
          <p className="mt-1 text-sm text-muted">拍照或上傳作文，先辨識原文，再查看文法、拼字、用字、結構與連貫性建議。</p>
        </div>
        <Badge tone="gold">AI 評估，僅供學習參考</Badge>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="建立批改任務" subtitle="服務狀態、PRO 權限、每日／每月上限與 Nova 消耗都由後端驗證。">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="focus-ring rounded-2xl border border-dashed border-[#37d3ff]/50 bg-[#37d3ff]/5 p-6 text-left transition hover:bg-[#37d3ff]/10">
              <span className="block text-sm font-semibold">上傳作文圖片</span>
              <span className="mt-1 block text-xs text-muted">支援 JPG、PNG、WebP，單檔 12MB；可用手機相機拍照後選取。</span>
              <span className="mt-4 block text-xs text-[#37d3ff]">{file ? file.name : "選擇檔案"}</span>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </button>
            <label className="rounded-2xl border border-[var(--line)] bg-black/10 p-4">
              <span className="block text-sm font-semibold">或貼上作文文字</span>
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} maxLength={30000} placeholder="Paste your English essay here…" className="mt-3 w-full resize-y rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm outline-none focus:border-[#37d3ff]" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 text-xs text-muted">
            <span>成功建立批改結果後才會扣除 Nova；失敗不扣點。</span>
            <Button onClick={grade} disabled={busy}>{busy ? "OCR 與 AI 分析中…" : "開始批改"}</Button>
          </div>
        </Card>
        <Card title="我的作文" subtitle="可重新查看或刪除歷史紀錄。">
          {history.loading && <Skeleton lines={5} />}
          {history.error && <ErrorState message={history.error} onRetry={history.reload} />}
          {!history.loading && !history.data?.gradings.length && <EmptyState icon="pen" title="還沒有作文批改" hint="上傳第一篇英文作文，開始建立自己的錯誤紀錄。" />}
          <div className="space-y-2">
            {history.data?.gradings.filter((item) => item.status !== "deleted").map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${active?.id === item.id ? "border-[#37d3ff]/60 bg-[#37d3ff]/5" : "border-[var(--line)]"}`}>
                <button type="button" className="w-full text-left" onClick={() => setActive(item)}>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{new Date(item.createdAt).toLocaleString("zh-TW")}</span><Badge tone={item.status === "completed" ? "cyan" : item.status === "failed" ? "rose" : "gold"}>{item.status}</Badge></div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted">{item.ocrText || item.originalText || "等待分析"}</p>
                </button>
                <button type="button" className="mt-2 text-xs text-muted hover:text-rose-300" onClick={() => void remove(item.id)}>刪除紀錄</button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {active?.status === "completed" && active.result && <ResultPanel grading={active} />}
      {active?.status === "failed" && <Card title="批改失敗"><p className="text-sm text-rose-200">{active.errorMessage || "AI 暫時無法完成分析，請稍後再試。"}</p></Card>}
    </div>
  );
}

function ResultPanel({ grading }: { grading: Grading }) {
  const result = grading.result!;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="批改結果" subtitle={result.aiDisclaimer || "AI 評估，僅供學習參考"}>
        <section className="rounded-2xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-4">
          <h2 className="text-sm font-semibold">總評</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{result.overallFeedback || "未提供總評。"}</p>
        </section>
        <section className="mt-4">
          <h2 className="text-sm font-semibold">原文辨識</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm leading-7">{result.ocrText || grading.originalText || "未取得文字。"}</p>
        </section>
        <section className="mt-4">
          <h2 className="text-sm font-semibold">修改建議</h2>
          <div className="mt-2 space-y-2">
            {result.corrections?.map((item, index) => <div key={`${item.original}-${index}`} className="rounded-xl border border-[var(--line)] p-3 text-sm"><div className="flex flex-wrap gap-2"><Badge tone={item.category.toLowerCase().includes("spell") ? "gold" : "cyan"}>{item.category}</Badge><span className="text-rose-200 line-through">{item.original}</span><span className="text-[#9ff3c9]">{item.suggestion}</span></div><p className="mt-2 text-xs leading-5 text-muted">{item.reason}</p></div>)}
            {!result.corrections?.length && <p className="text-sm text-muted">這次沒有辨識到需要修改的句子。</p>}
          </div>
        </section>
      </Card>
      <Card title="分項評分">
        <div className="space-y-3">
          {Object.entries(result.scores ?? {}).filter(([key]) => key in SCORE_LABELS).map(([key, value]) => <div key={key}><div className="flex justify-between text-xs"><span>{SCORE_LABELS[key]}</span><span>{Math.max(0, Math.min(100, Number(value)))} / 100</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#37d3ff]" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} /></div></div>)}
        </div>
        {result.spelling?.length ? <div className="mt-6"><h2 className="text-sm font-semibold">Spelling</h2><div className="mt-2 space-y-2 text-xs">{result.spelling.map((item, index) => <div key={`${item.original}-${index}`} className="rounded-xl bg-black/20 p-3"><p className="text-rose-200">{item.original}</p><p className="text-[#9ff3c9]">{item.suggestion}</p><p className="mt-1 text-muted">{item.reason}</p></div>)}</div></div> : null}
        <p className="mt-6 text-xs leading-5 text-muted">AI 評估不等同正式考試成績。請把建議當成學習提示，重要作業與考試仍應由老師或自己確認。</p>
      </Card>
    </div>
  );
}
