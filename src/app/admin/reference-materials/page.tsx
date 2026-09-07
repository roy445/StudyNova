"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { Badge, Button, Card, EmptyState, Field, Input, Select, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage } from "@/lib/api";

type ImportItem = Record<string, unknown>;
type ImportJob = {
  id: string;
  status: string;
  progress: number;
  processedFiles: number;
  totalFiles: number;
  totalQuestions: number;
  acceptedQuestions: number;
  preview: ImportItem[];
  errorMessage: string;
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/ogg,audio/webm,text/plain";

function subjects(items: ImportItem[]) {
  return Array.from(new Set(items.map((item) => String(item.subject || "其他")).filter(Boolean))).sort();
}

export default function ReferenceMaterialsPage() {
  const toast = useToast();
  const [meta, setMeta] = useState({ category: "AI 參考題庫", source: "", subjectHint: "auto", target: "general" });
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);

  async function watch(id: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const next = await apiGet<ImportJob>(`/admin/question-imports/${id}`);
      setJob(next);
      if (["ready", "confirmed", "failed"].includes(next.status)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const created = await apiPost<{ jobId: string }>("/admin/question-imports", {
        totalFiles: files.length,
        bankCategory: meta.category.trim() || "AI 參考題庫",
        sourceLabel: meta.source.trim() || files.map((file) => file.name).join(", "),
        targetBank: meta.target,
      });
      setJob({ id: created.jobId, status: "uploading", progress: 0, processedFiles: 0, totalFiles: files.length, totalQuestions: 0, acceptedQuestions: 0, preview: [], errorMessage: "" });
      for (const file of files) {
        await upload(file.name, file, {
          access: "private",
          handleUploadUrl: "/api/blob/question-bank-upload",
          clientPayload: JSON.stringify({ jobId: created.jobId, bankCategory: `${meta.category}｜科目：${meta.subjectHint}`, sourceLabel: meta.source || file.name, subjectHint: meta.subjectHint }),
          multipart: file.size > 5 * 1024 * 1024,
        });
      }
      toast.push("success", "檔案已上傳，AI 正在整理題目與分類科目");
      await watch(created.jobId);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!job) return;
    try {
      const result = await apiPost<{ imported: number }>(`/admin/question-imports/${job.id}/confirm`, {});
      setJob({ ...job, status: "confirmed" });
      toast.push("success", `已確認 ${result.imported} 題加入題庫`);
    } catch (error) {
      toast.push("error", errorMessage(error));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[#7dd3fc]">StudyNova AI Exam Engine</p>
        <h1 className="mt-1 text-2xl font-black">AI 題庫／參考資料中心</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">把教材、參考題目與合法授權的練習檔案集中上傳。系統會保留原始來源，掃描整份檔案、判斷科目與題型、找出需要人工確認的題目，確認後才會正式加入題庫。</p>
      </div>

      <Card title="上傳參考資料與題目" subtitle="支援 PDF、圖片、文字與音檔；AI 會先分類，不會直接發布未確認題目。">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="資料分類"><Input value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} placeholder="例如：高中英文參考題" /></Field>
          <Field label="來源名稱"><Input value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} placeholder="例如：高一文法講義" /></Field>
          <Field label="科目提示"><Select value={meta.subjectHint} onChange={(e) => setMeta({ ...meta, subjectHint: e.target.value })}><option value="auto">AI 自動判斷</option><option value="國文">國文</option><option value="英文">英文</option><option value="數學">數學</option><option value="自然">自然</option><option value="社會">社會</option><option value="其他">其他</option></Select></Field>
          <Field label="目標題庫"><Select value={meta.target} onChange={(e) => setMeta({ ...meta, target: e.target.value })}><option value="general">一般題庫</option><option value="activity">活動題庫</option><option value="exclusive">專屬題庫</option><option value="weekly">每週小考題庫</option></Select></Field>
        </div>
        <label className={`mt-4 flex min-h-32 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[#37d3ff]/50 bg-[#37d3ff]/5 p-5 text-center transition hover:bg-[#37d3ff]/10 ${busy ? "cursor-wait opacity-60" : ""}`}>
          <input type="file" multiple accept={ACCEPT} disabled={busy} className="sr-only" onChange={(event) => { const files = Array.from(event.target.files ?? []); void handleFiles(files); event.target.value = ""; }} />
          <span><span className="block text-lg font-semibold">{busy ? "正在上傳與分析…" : "點擊選擇參考教材或題目檔案"}</span><span className="mt-2 block text-xs text-muted">可多選。AI 會依題目內容分類科目、章節、難度與題型。</span></span>
        </label>
      </Card>

      {job && <Card title="分析進度" subtitle={`工作 ID：${job.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{job.status === "ready" ? "分析完成，等待人工確認" : job.status === "confirmed" ? "已加入題庫" : job.status === "failed" ? "分析失敗" : "AI 正在讀取檔案…"}</span><Badge tone={job.status === "ready" ? "cyan" : job.status === "confirmed" ? "green" : job.status === "failed" ? "rose" : "gold"}>{job.processedFiles}/{job.totalFiles} 個檔案</Badge></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#37d3ff] to-[#7c5cff] transition-all" style={{ width: `${job.progress}%` }} /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="glass-soft rounded-xl p-3"><div className="text-xl font-black">{job.totalQuestions}</div><div className="text-muted">偵測題目</div></div><div className="glass-soft rounded-xl p-3"><div className="text-xl font-black">{job.acceptedQuestions}</div><div className="text-muted">可匯入</div></div><div className="glass-soft rounded-xl p-3"><div className="text-xl font-black">{subjects(job.preview).length}</div><div className="text-muted">科目</div></div></div>
        {job.errorMessage && <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100">{job.errorMessage}</p>}
        {job.status === "ready" && <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-muted">請檢查下方分類與題目；需要修改時請先回到既有題庫匯入預覽處理。</p><Button onClick={() => void confirmImport()}>確認加入題庫</Button></div>}
      </Card>}

      {job?.preview.length ? <Card title="AI 分類預覽" subtitle="正式匯入前先查看科目、題型與需要人工確認的題目。"><div className="mb-3 flex flex-wrap gap-2">{subjects(job.preview).map((subject) => <Badge key={subject} tone="cyan">{subject}</Badge>)}</div><div className="max-h-[36rem] space-y-2 overflow-y-auto">{job.preview.slice(0, 100).map((item, index) => { const status = String(item.status || "NEEDS_REVIEW"); const reasons = Array.isArray(item.reviewReasons) ? item.reviewReasons.map(String) : []; return <div key={`${String(item.stem)}-${index}`} className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><strong>{index + 1}. {String(item.stem || "未讀取題目")}</strong><Badge tone={status === "READY" ? "green" : status === "DUPLICATE" ? "rose" : "gold"}>{status}</Badge></div><p className="mt-1 text-xs text-muted">科目：{String(item.subject || "其他")}・章節：{String(item.topic || "未分類")}・題型：{String(item.type || "short")}・難度：{String(item.difficulty || "normal")}</p>{reasons.length > 0 && <p className="mt-2 rounded-lg bg-amber-300/10 p-2 text-xs text-amber-100">需要確認：{reasons.join("；")}</p>}</div>; })}</div></Card> : <EmptyState icon="▤" title="尚未有分析工作" hint="上傳參考教材後，這裡會顯示科目分類與題目預覽。" />}
    </div>
  );
}
