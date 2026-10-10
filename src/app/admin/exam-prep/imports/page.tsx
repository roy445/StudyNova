"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Field, Select, useToast } from "@/components/ui";

type Activity = { id: string; name: string; status: string; effectiveStatus: string };
type ImportJob = { id: string; activityId: string; filename: string; mimeType: string; status: string; stage: string; progress: number; pageCount: number; draftCount: number; errorMessage: string; createdAt: string; updatedAt: string };
type Analysis = { understanding?: string; verifiedAnswer?: string[]; answerReason?: string; approach?: string; detailedExplanation?: string; optionAnalysis?: Array<{ option: string; reason: string }>; coreConcept?: string; commonErrors?: string[]; memoryTip?: string };
type Quality = { passed?: boolean; score?: number; failed?: string[]; answerConflict?: boolean; checks?: Record<string, boolean> };
type Draft = { id: string; questionNumber: number | null; pageStart: number | null; pageEnd: number | null; subject: string; type: string; stem: string; options: string[]; answer: string[]; confidence: number; status: string; analysisStatus: string; analysisError: string; analysis: Analysis; quality: Quality };
type Details = { job: ImportJob; drafts: Draft[]; pages: Array<{ id: string; pageNumber: number; pageEnd: number; extractedText: string; status: string; previewUrl: string | null }>; assets: Array<{ id: string; pageNumber: number | null; objectId: string; previewUrl: string }> };

const labels: Record<string, string> = { uploaded: "等待處理", processing: "解析中", pending_review: "待人工審核", completed: "已完成", failed: "失敗", cancelled: "已取消" };
const analysisLabels: Record<string, string> = { queued: "等待 AI", analyzing: "AI 分析中", completed: "分析完成", quality_failed: "品質未通過", failed: "分析失敗" };

export default function AdminExamPrepImportsPage() {
  const toast = useToast();
  const activities = useApi<{ activities: Activity[] }>("/admin/exam-prep/activities");
  const [activityId, setActivityId] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selected, setSelected] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedActivityId = activityId || activities.data?.activities[0]?.id || "";

  async function loadJobs() {
    if (!selectedActivityId) return;
    try { setJobs((await apiGet<{ imports: ImportJob[] }>(`/admin/exam-prep/activities/${selectedActivityId}/imports`, { fresh: true })).imports); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "無法載入匯入工作"); }
  }
  async function inspect(jobId: string) {
    try { setSelected(await apiGet<Details>(`/admin/exam-prep/imports/${jobId}`, { fresh: true })); await loadJobs(); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "無法載入審核資料"); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !selectedActivityId) return;
    const form = new FormData(); Array.from(files).forEach((file) => form.append("files", file)); setBusy(true);
    try { await apiPost(`/admin/exam-prep/activities/${selectedActivityId}/imports`, form); toast.push("success", "考卷已加入背景解析"); await loadJobs(); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "上傳失敗"); }
    finally { setBusy(false); }
  }
  async function analyze() {
    if (!selected) return; setBusy(true);
    try { await apiPost(`/admin/exam-prep/imports/${selected.job.id}/analyze`); toast.push("success", "已加入 AI 分析佇列"); await inspect(selected.job.id); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "AI 分析排程失敗"); }
    finally { setBusy(false); }
  }
  async function review(draftId: string, status: "approved" | "rejected") {
    if (!selected) return;
    try { await apiPatch(`/admin/exam-prep/imports/${selected.job.id}/drafts/${draftId}`, { status }); await inspect(selected.job.id); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "審核操作失敗"); }
  }
  async function confirm() {
    if (!selected) return;
    const draftIds = selected.drafts.filter((draft) => draft.status === "approved").map((draft) => draft.id);
    if (!draftIds.length) return toast.push("error", "請先通過 AI 品質檢查並核准至少一題");
    if (!window.confirm(`確定將 ${draftIds.length} 題正式寫入段考題庫？`)) return;
    setBusy(true);
    try { await apiPost(`/admin/exam-prep/imports/${selected.job.id}/confirm`, { draftIds }); toast.push("success", `已正式入庫 ${draftIds.length} 題`); await inspect(selected.job.id); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "正式入庫失敗"); }
    finally { setBusy(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void loadJobs(), 0); return () => window.clearTimeout(timer); }, [selectedActivityId]);
  useEffect(() => { if (!jobs.some((job) => ["uploaded", "processing"].includes(job.status))) return; const timer = window.setInterval(() => void loadJobs(), 3000); return () => window.clearInterval(timer); }, [jobs, selectedActivityId]);

  return <div className="space-y-6">
    <header><Link href="/admin/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺活動管理</Link><p className="mt-4 text-xs font-black tracking-[.25em] text-cyan-200">PHASE 3 · REVIEW WORKBENCH</p><h1 className="mt-2 text-3xl font-black">AI 題目分析與雙欄審核</h1><p className="mt-2 text-sm leading-6 text-muted">左側保留原卷頁面，右側顯示 AI 題目、答案驗證、解析與品質門檻。沒有通過檢查的題目不能核准，也不能進正式題庫。</p></header>
    <Card title="上傳考卷" subtitle="支援 PDF、圖片與文字檔；掃描 PDF 會逐頁 OCR。"><Field label="選擇段考活動"><Select value={selectedActivityId} onChange={(event) => { setActivityId(event.target.value); setSelected(null); }}><option value="">請選擇活動</option>{activities.data?.activities.filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name}（{item.effectiveStatus}）</option>)}</Select></Field><label className="mt-4 flex min-h-24 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/[0.04] p-5 text-center text-sm text-muted hover:bg-cyan-300/[0.08]"><input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,application/json" disabled={!selectedActivityId || busy} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} /><span>{busy ? "處理中…" : "點擊選擇考卷檔案"}</span></label></Card>
    <Card title="匯入工作" subtitle="解析完成後點選查看，進入雙欄審核。"><div className="space-y-3">{jobs.map((job) => <div key={job.id} className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{job.filename}</p><p className="mt-1 text-xs text-muted">{job.mimeType}・頁數 {job.pageCount}・草稿 {job.draftCount}・{job.progress}%</p></div><div className="flex items-center gap-2"><Badge tone={job.status === "pending_review" ? "gold" : job.status === "failed" ? "rose" : job.status === "processing" ? "cyan" : "muted"}>{labels[job.status] ?? job.status}</Badge><Button size="sm" variant="outline" onClick={() => void inspect(job.id)}>查看</Button></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div></div>)}{!jobs.length && <EmptyState icon="⌁" title="尚無匯入工作" hint="先選擇活動並上傳考卷。" />}</div></Card>
    {selected && <Card title={`雙欄審核：${selected.job.filename}`} subtitle={`工作狀態：${labels[selected.job.status] ?? selected.job.status}；AI 分析不會自動發布。`}><div className="mb-4 flex flex-wrap gap-2"><Button loading={busy} onClick={() => void analyze()}>開始／重新 AI 分析</Button><Button variant="outline" loading={busy} onClick={() => void confirm()}>核准題目並正式入庫</Button></div><div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.035] p-3"><p className="text-xs font-black tracking-[.18em] text-cyan-100">SOURCE PAGES</p>{selected.pages.map((page) => <div key={page.id} className="overflow-hidden rounded-xl border border-[var(--line)] bg-black/20"><div className="flex items-center justify-between px-3 py-2 text-xs text-muted"><span>原卷第 {page.pageNumber} 頁</span><span>{page.status}</span></div>{page.previewUrl ? <img src={page.previewUrl} alt={`原卷第 ${page.pageNumber} 頁`} className="max-h-[620px] w-full object-contain" /> : <p className="p-4 text-xs text-muted">此頁沒有圖片預覽</p>}<pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-[var(--line)] p-3 text-xs leading-5 text-muted">{page.extractedText || "尚無 OCR 文字"}</pre></div>)}</section><section className="space-y-3 rounded-2xl border border-violet-300/20 bg-violet-300/[0.035] p-3"><p className="text-xs font-black tracking-[.18em] text-violet-100">AI DRAFTS</p>{selected.drafts.map((draft) => <article key={draft.id} className={`rounded-xl border p-4 ${draft.status === "approved" ? "border-emerald-300/40" : draft.quality?.answerConflict ? "border-rose-300/50" : "border-[var(--line)]"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">第 {draft.questionNumber ?? "?"} 題・{draft.subject}</p><div className="flex gap-2"><Badge tone={draft.quality?.passed ? "green" : draft.analysisStatus === "failed" ? "rose" : "gold"}>{analysisLabels[draft.analysisStatus] ?? draft.analysisStatus}</Badge><Badge tone={draft.status === "approved" ? "green" : draft.status === "rejected" ? "rose" : "muted"}>{draft.status}</Badge></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{draft.stem}</p><div className="mt-2 space-y-1 text-sm text-muted">{draft.options.map((option, index) => <p key={`${draft.id}-${index}`}>{String.fromCharCode(65 + index)}. {option}</p>)}</div><div className="mt-3 rounded-lg bg-black/20 p-3 text-xs leading-5 text-muted"><p>原始答案：{draft.answer.join("、") || "未提供"}　AI 驗證：{draft.analysis?.verifiedAnswer?.join("、") || "待確認"}</p><p className={draft.quality?.answerConflict ? "font-bold text-rose-200" : ""}>品質分數：{draft.quality?.score ?? 0}／100{draft.quality?.answerConflict ? "・ANSWER_CONFLICT" : ""}</p>{draft.analysis?.detailedExplanation && <p className="mt-2 text-slate-200">解析：{draft.analysis.detailedExplanation}</p>}{draft.analysis?.coreConcept && <p>核心觀念：{draft.analysis.coreConcept}</p>}{draft.quality?.failed?.length ? <p className="text-amber-100">待修正：{draft.quality.failed.join("、")}</p> : null}{draft.analysisError && <p className="text-rose-200">{draft.analysisError}</p>}</div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!draft.quality?.passed || draft.quality?.answerConflict || draft.analysisStatus !== "completed" || draft.status === "approved"} onClick={() => void review(draft.id, "approved")}>核准</Button><Button size="sm" variant="outline" disabled={draft.status === "rejected"} onClick={() => void review(draft.id, "rejected")}>退回</Button></div></article>)}{!selected.drafts.length && <p className="text-sm text-muted">尚未產生題目草稿。</p>}</section></div></Card>}
  </div>;
}
