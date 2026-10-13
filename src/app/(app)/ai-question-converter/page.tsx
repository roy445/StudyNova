"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { uploadAiSolutionFiles } from "@/lib/ai-solution-upload";

type Job = { id: string; title: string; status: string; stage: string; sourceContextId: string; sourceFileName: string; totalCount: number; interactiveCount: number; skippedCount: number; summary: Record<string, number>; expiresAt: string | null; quizId: string | null; errorMessage: string };
type Item = { id: string; ordinal: number; pageNumber: number; type: string; status: string; stem: string; options: string[]; answer: string[]; originalExplanation: string; aiExplanation: string; skipReason: string; metadata?: { assetObjectIds?: string[]; sourcePages?: number[]; passage?: string; passageGroupId?: string; sharedOptions?: string[]; blankNumber?: number } };
const STAGES: Record<string, string> = { queued: "排入分析佇列", reading: "正在讀取 PDF", recognizing: "正在辨識題目", matching: "正在配對答案", quality_check: "正在檢查題目", completed: "完成", failed: "分析失敗" };

export default function AiQuestionConverterPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void apiGet<{ job: Job; items: Item[] }>(`/ai/question-converter/jobs/${job.id}`, { fresh: true }).then((data) => { setJob(data.job); setItems(data.items); }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job]);

  async function analyze() {
    if (!file) return setError("請先選擇 PDF。");
    if (!agreed) return setError("請勾選「我已了解以上限制」後才能開始分析。");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setError("目前只接受 PDF 檔案。");
    if (file.size > 20 * 1024 * 1024) return setError("PDF 不得超過 20MB；實際限制以後台設定為準。");
    setBusy(true); setError(""); setJob(null); setItems([]);
    try {
      const uploaded = await uploadAiSolutionFiles([file], { subject: "其他", scope: { includeQuestion: true, includeNote: true, includeHandwriting: true } });
      const contextId = uploaded.results[0]?.context?.id;
      if (!contextId) throw new Error(uploaded.results[0]?.error || "PDF 上傳或登記失敗，沒有產生可分析的檔案。");
      const data = await apiPost<{ job: Job }>("/ai/question-converter/jobs", { contextId, title: title.trim() || file.name.replace(/\.pdf$/i, "") });
      setJob(data.job);
      toast.push("success", "PDF 已送入背景分析；完成後會出現預覽，不會直接建立題目。");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!job) return;
    setBusy(true); setError("");
    try {
      const data = await apiPost<{ result: { quiz: { id: string }; createdCount: number; skippedCount: number } }>(`/ai/question-converter/jobs/${job.id}/confirm`, {});
      setJob({ ...job, status: "completed", stage: "completed", quizId: data.result.quiz.id });
      toast.push("success", `已建立 ${data.result.createdCount} 題；略過 ${data.result.skippedCount} 題。`);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const skipped = items.filter((item) => item.status === "skipped");
  const accepted = items.filter((item) => item.status === "interactive");
  return <div className="space-y-5">
    <div><Badge tone="violet">Novi AI 學習工具</Badge><h1 className="mt-2 text-3xl font-black">AI 題目互動化</h1><p className="mt-2 text-sm text-muted">把包含題目與答案／解答的 PDF，轉成可以直接作答、判分與複習的互動題組。</p></div>
    <Card title="使用前須知" subtitle="請先完整閱讀；不確定就略過，不會硬猜答案。">
      <div className="grid gap-2 text-sm leading-6 text-muted sm:grid-cols-2"><p>✓ 必須同時包含題目與答案／解答</p><p>✓ 圖片題可能會被略過</p><p>✓ 簡答、申論、作文會被略過</p><p>✓ 手寫或模糊內容可能無法辨識</p><p>✓ AI 可能發生辨識錯誤，請自行核對來源</p><p>✓ 一般會員預設保存 15 天，Nova Pro 依後台設定</p></div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-white/5 p-3 text-sm"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 h-4 w-4" />我已閱讀並了解 AI 題目互動化的使用限制</label>
    </Card>
    <Card title="上傳題目 PDF" subtitle="PDF → 文字／版面分析 → 題目辨識 → 答案配對 → 品質檢查 → 預覽。">
      <div className="rounded-2xl border-2 border-dashed border-[#37d3ff]/35 bg-[#37d3ff]/5 p-7 text-center"><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><p className="text-4xl">📄</p><p className="mt-2 font-bold">{file?.name || "拖曳 PDF 到這裡，或選擇檔案"}</p><p className="mt-1 text-xs text-muted">目前單檔上限 20MB；圖片必要題會清楚列在略過清單。</p><Button className="mt-4" variant="ghost" onClick={() => inputRef.current?.click()}>選擇 PDF</Button></div><Input className="mt-3" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="題組名稱（選填）" /><Button className="mt-4 w-full sm:w-auto" onClick={() => void analyze()} loading={busy} disabled={!file || !agreed}>開始分析</Button>{error && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}</Card>
    {job && <Card title={job.status === "preview" ? "分析完成，請確認預覽" : job.status === "completed" ? "建立完成" : "PDF 分析進度"} subtitle={STAGES[job.stage] || job.stage}>
      {job.status === "queued" || job.status === "processing" ? <div className="rounded-xl bg-white/5 p-4 text-sm">{STAGES[job.stage] || "處理中"}… 請不要關閉頁面；大型 PDF 會由背景佇列處理。</div> : null}
      {job.status === "failed" ? <p className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200">此次 PDF 分析失敗，請確認檔案是否可以正常閱讀。{job.errorMessage ? ` ${job.errorMessage}` : ""}</p> : null}
      {(job.status === "preview" || job.status === "completed") && <><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-white/5 p-3"><span className="text-xs text-muted">總題數</span><strong className="mt-1 block text-2xl">{job.totalCount}</strong></div><div className="rounded-xl bg-emerald-400/10 p-3"><span className="text-xs text-muted">可互動化</span><strong className="mt-1 block text-2xl text-emerald-200">{job.interactiveCount}</strong></div><div className="rounded-xl bg-amber-400/10 p-3"><span className="text-xs text-muted">略過</span><strong className="mt-1 block text-2xl text-amber-200">{job.skippedCount}</strong></div><div className="rounded-xl bg-white/5 p-3"><span className="text-xs text-muted">保存期限</span><strong className="mt-1 block text-sm">{job.expiresAt ? new Date(job.expiresAt).toLocaleDateString("zh-TW") : "依方案設定"}</strong></div></div><div className="mt-4 space-y-3">{accepted.slice(0, 5).map((item) => <div key={item.id} className="rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-4"><p className="text-xs text-emerald-200">第 {item.ordinal} 題・{item.type}</p><p className="mt-1 font-semibold">{item.stem}</p>{item.metadata?.passage && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-violet-300/10 p-2 text-xs leading-5">閱讀文章：{item.metadata.passage}</p>}{item.metadata?.assetObjectIds?.length ? <p className="mt-2 text-xs text-cyan-100">已擷取 {item.metadata.assetObjectIds.length} 張原題圖片，確認匯入後會隨題目顯示。</p> : null}{(item.metadata?.sharedOptions?.length ? item.metadata.sharedOptions : item.options).length > 0 && <p className="mt-2 text-xs text-muted">選項：{(item.metadata?.sharedOptions?.length ? item.metadata.sharedOptions : item.options).join(" ／ ")}</p>}</div>)}</div>{skipped.length > 0 && <details className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/5 p-4"><summary className="cursor-pointer font-bold text-amber-100">查看略過題目（{skipped.length} 題）</summary><div className="mt-3 space-y-2 text-sm">{skipped.map((item) => <p key={item.id}><b>第 {item.ordinal} 題：</b>{item.skipReason || "無法可靠解析"}</p>)}</div></details>}{job.status === "preview" && <Button className="mt-4" onClick={() => void confirm()} loading={busy} disabled={!accepted.length}>確認建立互動題目（{accepted.length} 題）</Button>}{job.status === "completed" && job.quizId && <Link href="/study?tab=quiz"><Button className="mt-4">開始練習 →</Button></Link>}</>}
    </Card>}
  </div>;
}
