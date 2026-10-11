"use client";

import Link from "next/link";
import { uploadPresigned as uploadBlob } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";
import { apiGet, apiPatch, apiPost, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Field, Select, useToast } from "@/components/ui";

type Activity = { id: string; name: string; status: string; effectiveStatus: string };
type ImportJob = { id: string; activityId: string; filename: string; mimeType: string; status: string; stage: string; progress: number; pageCount: number; draftCount: number; errorMessage: string; createdAt: string; updatedAt: string };
type Analysis = { understanding?: string; verifiedAnswer?: string[]; answerReason?: string; approach?: string; detailedExplanation?: string; optionAnalysis?: Array<{ option: string; reason: string }>; coreConcept?: string; commonErrors?: string[]; memoryTip?: string };
type Quality = { passed?: boolean; score?: number; failed?: string[]; answerConflict?: boolean; checks?: Record<string, boolean>; imageCount?: number };
type Draft = { id: string; questionNumber: number | null; pageStart: number | null; pageEnd: number | null; subject: string; type: string; stem: string; options: string[]; answer: string[]; explanation: string; confidence: number; status: string; analysisStatus: string; analysisError: string; analysis: Analysis; quality: Quality };
type Details = { job: ImportJob; drafts: Draft[]; pages: Array<{ id: string; pageNumber: number; pageEnd: number; extractedText: string; status: string; previewUrl: string | null }>; assets: Array<{ id: string; pageNumber: number | null; objectId: string; previewUrl: string }> };

const labels: Record<string, string> = { uploaded: "等待處理", processing: "處理中", pending_review: "待人工審核", completed: "已完成", failed: "失敗", cancelled: "已取消" };
const analysisLabels: Record<string, string> = { queued: "等待 AI", analyzing: "AI 分析中", completed: "分析完成", quality_failed: "品質未通過", failed: "分析失敗" };
function contentTypeOf(file: File) { if (file.type) return file.type; if (/\.pdf$/i.test(file.name)) return "application/pdf"; if (/\.png$/i.test(file.name)) return "image/png"; if (/\.jpe?g$/i.test(file.name)) return "image/jpeg"; if (/\.webp$/i.test(file.name)) return "image/webp"; if (/\.md$/i.test(file.name)) return "text/markdown"; if (/\.json$/i.test(file.name)) return "application/json"; return "text/plain"; }

export default function AdminExamPrepImportsPage() {
  const toast = useToast();
  const activities = useApi<{ activities: Activity[] }>("/admin/exam-prep/activities");
  const [activityId, setActivityId] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selected, setSelected] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState("");
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
    const selectedFiles = Array.from(files); setBusy(true);
    try {
      const uploaded = await Promise.all(selectedFiles.map((file) => { const extension = file.name.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() ?? ""; const pathname = `exam-prep/${selectedActivityId}/${crypto.randomUUID()}${extension}`; return uploadBlob(pathname, file, { access: "private", contentType: contentTypeOf(file), handleUploadUrl: `/api/v1/admin/exam-prep/activities/${selectedActivityId}/imports/blob-upload`, clientPayload: JSON.stringify({ activityId: selectedActivityId }), multipart: file.size > 50 * 1024 * 1024, headers: { "x-studynova-version": APP_VERSION } }); }));
      await apiPost(`/admin/exam-prep/activities/${selectedActivityId}/imports/blob-complete`, { files: uploaded.map((blob, index) => ({ filename: selectedFiles[index].name, pathname: blob.pathname, size: selectedFiles[index].size, contentType: contentTypeOf(selectedFiles[index]) })) });
      toast.push("success", `已直傳 ${selectedFiles.length} 份考卷，加入背景解析`); await loadJobs();
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "上傳失敗"); } finally { setBusy(false); }
  }
  async function analyze() {
    if (!selected) return; setBusy(true);
    try { await apiPost(`/admin/exam-prep/imports/${selected.job.id}/analyze`); toast.push("success", `已開始分析 ${selected.drafts.length} 題；這次會讀取原卷圖片中的公式與圖表`); await inspect(selected.job.id); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "AI 分析排程失敗"); } finally { setBusy(false); }
  }
  async function saveDraft(draft: Draft, answerText: string, explanation: string) {
    setSavingId(draft.id);
    try { await apiPatch(`/admin/exam-prep/imports/${selected?.job.id}/drafts/${draft.id}`, { answer: answerText.split(/[\s,，、]+/).map((item) => item.trim()).filter(Boolean), explanation }); toast.push("success", `第 ${draft.questionNumber ?? "?"} 題已保存答案與詳解`); if (selected) await inspect(selected.job.id); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "保存題目失敗"); } finally { setSavingId(""); }
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
    setBusy(true); try { await apiPost(`/admin/exam-prep/imports/${selected.job.id}/confirm`, { draftIds }); toast.push("success", `已正式入庫 ${draftIds.length} 題`); await inspect(selected.job.id); } catch (error) { toast.push("error", error instanceof Error ? error.message : "正式入庫失敗"); } finally { setBusy(false); }
  }

  const analysisSummary = useMemo(() => { const drafts = selected?.drafts ?? []; const current = drafts.find((draft) => draft.analysisStatus === "analyzing"); const next = drafts.find((draft) => draft.analysisStatus === "queued"); const problems = drafts.filter((draft) => ["quality_failed", "failed"].includes(draft.analysisStatus)).map((draft) => `第${draft.questionNumber ?? "?"}題：${draft.analysisError || draft.quality?.failed?.join("、") || "品質檢查未通過"}`); return { total: drafts.length, done: drafts.filter((draft) => ["completed", "quality_failed", "failed"].includes(draft.analysisStatus)).length, ok: drafts.filter((draft) => draft.analysisStatus === "completed" && draft.quality?.passed).length, failed: drafts.filter((draft) => ["quality_failed", "failed"].includes(draft.analysisStatus)).length, current: current?.questionNumber ?? null, next: next?.questionNumber ?? null, problems }; }, [selected]);
  useEffect(() => { const timer = window.setTimeout(() => void loadJobs(), 0); return () => window.clearTimeout(timer); }, [selectedActivityId]);
  useEffect(() => { if (!jobs.some((job) => ["uploaded", "processing"].includes(job.status))) return; const timer = window.setInterval(() => void loadJobs(), 3000); return () => window.clearInterval(timer); }, [jobs, selectedActivityId]);
  useEffect(() => { if (!selected || !selected.drafts.some((draft) => ["queued", "analyzing"].includes(draft.analysisStatus))) return; const timer = window.setInterval(() => void inspect(selected.job.id), 3000); return () => window.clearInterval(timer); }, [selected]);

  return <div className="space-y-6">
    <header><Link href="/admin/exam-prep" className="text-xs text-cyan-200 hover:underline">← 段考衝刺活動管理</Link><p className="mt-4 text-xs font-black tracking-[.25em] text-cyan-200">PHASE 3 · REVIEW WORKBENCH</p><h1 className="mt-2 text-3xl font-black">AI 題目分析與雙欄審核</h1><p className="mt-2 text-sm leading-6 text-muted">AI 會同時讀取 OCR 文字與原卷圖片；公式、圖表、方向不以純文字猜測。無答案題會嘗試推導，仍不確定時會明確標記，讓你可以補答案與詳解。</p></header>
    <Card title="上傳考卷" subtitle="支援 PDF、圖片與文字檔；掃描 PDF 會逐頁 OCR，圖片方向會交給影像處理校正。"><Field label="選擇段考活動"><Select value={selectedActivityId} onChange={(event) => { setActivityId(event.target.value); setSelected(null); }}><option value="">請選擇活動</option>{activities.data?.activities.filter((item) => item.status !== "archived").map((item) => <option key={item.id} value={item.id}>{item.name}（{item.effectiveStatus}）</option>)}</Select></Field><label className="mt-4 flex min-h-24 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/[.04] p-5 text-center text-sm text-muted hover:bg-cyan-300/[.08]"><input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,application/json" disabled={!selectedActivityId || busy} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} /><span>{busy ? "處理中…" : "點擊選擇考卷檔案"}</span></label></Card>
    <Card title="匯入工作" subtitle="解析與 AI 分析都會即時更新，不需要猜目前跑到哪裡。"><div className="space-y-3">{jobs.map((job) => <div key={job.id} className="rounded-2xl border border-[var(--line)] bg-white/[.025] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{job.filename}</p><p className="mt-1 text-xs text-muted">{job.mimeType}・頁數 {job.pageCount}・草稿 {job.draftCount}・{job.stage}・{job.progress}%</p></div><div className="flex items-center gap-2"><Badge tone={job.status === "pending_review" ? "gold" : job.status === "failed" ? "rose" : job.status === "processing" ? "cyan" : "muted"}>{labels[job.status] ?? job.status}</Badge><Button size="sm" variant="outline" onClick={() => void inspect(job.id)}>查看進度／結果</Button></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>{job.errorMessage && <p className="mt-2 text-xs text-rose-200">{job.errorMessage}</p>}</div>)}{!jobs.length && <EmptyState icon="⌁" title="尚無匯入工作" hint="先選擇活動並上傳考卷。" />}</div></Card>
    {selected && <Card title={`雙欄審核：${selected.job.filename}`} subtitle={`工作狀態：${labels[selected.job.status] ?? selected.job.status}・階段：${selected.job.stage}`}><div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[.05] p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>AI 分析進度：{analysisSummary.done} / {analysisSummary.total} 題</span><span>已通過 {analysisSummary.ok} 題・待修正／失敗 {analysisSummary.failed} 題</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${analysisSummary.total ? (analysisSummary.done / analysisSummary.total) * 100 : 0}%` }} /></div><div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2"><p>{analysisSummary.current !== null ? <><span className="font-bold text-cyan-100">目前正在分析第 {analysisSummary.current} 題</span>・請稍候</> : analysisSummary.next !== null ? <>下一題：第 {analysisSummary.next} 題，等待分析</> : analysisSummary.done === analysisSummary.total ? "所有題目分析工作已結束" : "正在準備分析工作"}</p><p>伺服器階段：{selected.job.stage}</p></div>{analysisSummary.problems.length > 0 && <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.06] p-3 text-xs leading-5 text-rose-100"><p className="font-bold">目前遇到的問題</p>{analysisSummary.problems.map((problem) => <p key={problem}>・{problem}</p>)}</div>}<p className="mt-2 text-xs text-muted">頁面每 3 秒自動更新；每題狀態會顯示待分析、分析中、分析完成、品質未通過或分析失敗。</p></div><div className="mb-4 flex flex-wrap gap-2"><Button loading={busy} onClick={() => void analyze()}>開始／重新 AI 分析</Button><Button variant="outline" loading={busy} onClick={() => void confirm()}>核准題目並正式入庫</Button></div><div className="grid gap-4 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]"><section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.035] p-3"><p className="text-xs font-black tracking-[.18em] text-cyan-100">SOURCE PAGES</p><p className="rounded-lg bg-amber-300/[.08] p-3 text-xs leading-5 text-amber-100">公式、圖表、幾何圖形與旋轉頁面請以左側原卷圖片為準；AI 分析時也會把對應原卷頁面送入視覺模型。</p>{selected.pages.map((page) => <div key={page.id} className="overflow-hidden rounded-xl border border-[var(--line)] bg-black/20"><div className="flex items-center justify-between px-3 py-2 text-xs text-muted"><span>原卷第 {page.pageNumber} 頁</span><span>{page.status}</span></div>{page.previewUrl ? <img src={page.previewUrl} alt={`原卷第 ${page.pageNumber} 頁`} className="max-h-[620px] w-full object-contain" /> : <p className="p-4 text-xs text-muted">此頁沒有圖片預覽</p>}<pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-[var(--line)] p-3 text-xs leading-5 text-muted">{page.extractedText || "尚無 OCR 文字；請以原卷圖片審核"}</pre></div>)}</section><section className="space-y-3 rounded-2xl border border-violet-300/20 bg-violet-300/[.035] p-3"><p className="text-xs font-black tracking-[.18em] text-violet-100">AI DRAFTS · 即時結果</p>{selected.drafts.map((draft) => <DraftCard key={`${draft.id}-${draft.analysisStatus}-${draft.answer.join("|")}-${draft.explanation.length}`} draft={draft} saving={savingId === draft.id} onSave={saveDraft} onReview={review} />)}{!selected.drafts.length && <p className="text-sm text-muted">尚未產生題目草稿。</p>}</section></div></Card>}
  </div>;
}

function DraftCard({ draft, saving, onSave, onReview }: { draft: Draft; saving: boolean; onSave: (draft: Draft, answer: string, explanation: string) => Promise<void>; onReview: (id: string, status: "approved" | "rejected") => Promise<void> }) {
  const [answer, setAnswer] = useState(draft.answer.join("、"));
  const [explanation, setExplanation] = useState(draft.explanation || draft.analysis?.detailedExplanation || "");
  return <article className={`rounded-xl border p-4 ${draft.status === "approved" ? "border-emerald-300/40" : draft.quality?.answerConflict ? "border-rose-300/50" : "border-[var(--line)]"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">第 {draft.questionNumber ?? "?"} 題・{draft.subject}・原卷第 {draft.pageStart ?? "?"} 頁</p><div className="flex gap-2"><Badge tone={draft.quality?.passed ? "green" : draft.analysisStatus === "failed" ? "rose" : "gold"}>{analysisLabels[draft.analysisStatus] ?? draft.analysisStatus}</Badge><Badge tone={draft.status === "approved" ? "green" : draft.status === "rejected" ? "rose" : "muted"}>{draft.status}</Badge></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{draft.stem}</p><div className="mt-2 space-y-1 text-sm text-muted">{draft.options.map((option, index) => <p key={`${draft.id}-${index}`}>{String.fromCharCode(65 + index)}. {option}</p>)}</div>{draft.analysisStatus === "analyzing" && <p className="mt-3 rounded-lg bg-cyan-300/[.08] p-3 text-sm text-cyan-100">AI 正在讀取這題的原卷圖片與公式，請稍候…</p>}{draft.analysisStatus === "completed" || draft.analysisStatus === "quality_failed" ? <div className="mt-3 space-y-2 rounded-lg bg-black/20 p-3 text-xs leading-5"><p>AI 驗證答案：{draft.analysis?.verifiedAnswer?.join("、") || "未能確認"}・圖片讀取：{draft.quality?.imageCount ?? 0} 頁</p><p>答案理由：{draft.analysis?.answerReason || "尚無"}</p><p>理解：{draft.analysis?.understanding || "尚無"}</p><p>解題方法：{draft.analysis?.approach || "尚無"}</p><p className="text-slate-200">AI 詳解：{draft.analysis?.detailedExplanation || "尚無"}</p><p>核心觀念：{draft.analysis?.coreConcept || "尚無"}</p><p className={draft.quality?.answerConflict ? "font-bold text-rose-200" : ""}>品質分數：{draft.quality?.score ?? 0}／100{draft.quality?.answerConflict ? "・答案衝突，請人工確認" : ""}</p>{draft.quality?.failed?.length ? <p className="text-amber-100">待修正：{draft.quality.failed.join("、")}</p> : null}</div> : null}<div className="mt-3 grid gap-3"><label className="text-xs text-muted">正式答案（可輸入 A、B 或多選 AB）<input value={answer} onChange={(event) => setAnswer(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 text-sm" /></label><label className="text-xs text-muted">正式詳解（AI 已產生時會先帶入，可人工修改）<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/20 px-3 py-2 text-sm leading-5" /></label></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" loading={saving} onClick={() => void onSave(draft, answer, explanation)}>保存答案／詳解</Button><Button size="sm" disabled={!draft.quality?.passed || draft.quality?.answerConflict || draft.analysisStatus !== "completed" || draft.status === "approved"} onClick={() => void onReview(draft.id, "approved")}>核准</Button><Button size="sm" variant="outline" disabled={draft.status === "rejected"} onClick={() => void onReview(draft.id, "rejected")}>退回</Button></div>{draft.analysisError && <p className="mt-2 text-xs text-rose-200">分析錯誤：{draft.analysisError}</p>}</article>;
}
