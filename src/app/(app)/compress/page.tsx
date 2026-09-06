"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select, Stat, useToast } from "@/components/ui";

type Job = { id: string; originalFilename: string; mimeType: string; originalSize: number; targetSize: number; status: string; stage: string; compressedSize: number | null; compressionRatio: number | null; qualityScore: string | null; errorMessage: string; resultUrl: string | null; progress: number; preview: Record<string, unknown> };
const pretty = (bytes: number | null) => bytes == null ? "—" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
const stageText: Record<string, string> = { QUEUED: "等待處理", ANALYZING: "正在分析檔案", COMPRESSING: "正在最佳化檔案", VERIFYING: "正在驗證檔案", COMPLETED: "壓縮完成", FAILED: "壓縮失敗" };

export default function CompressPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("5");
  const [unit, setUnit] = useState("MB");
  const [mode, setMode] = useState("precise");
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { try { const data = await apiGet<{ jobs: Job[] }>("/compress/jobs"); setHistory(data.jobs); } catch { /* auth shell handles session */ } };
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    if (!job || ["completed", "completed_with_warning", "failed"].includes(job.status)) return;
    const timer = window.setInterval(async () => { try { const next = await apiGet<Job>(`/compress/jobs/${job.id}`); setJob(next); if (["completed", "completed_with_warning", "failed"].includes(next.status)) { await refresh(); } } catch { /* keep polling */ } }, 1600);
    return () => window.clearInterval(timer);
  }, [job]);
  const warning = useMemo(() => file && Number(target) * (unit === "MB" ? 1024 * 1024 : 1024) < 1024 * 1024 && file.type.startsWith("image/"), [file, target, unit]);
  async function submit() {
    if (!file) { toast.push("error", "請先選擇檔案"); return; }
    setBusy(true);
    try { const form = new FormData(); form.set("file", file); form.set("targetSize", target); form.set("targetUnit", unit); form.set("mode", mode); const data = await apiPost<{ job: Job }>("/compress/jobs", form); setJob(data.job); toast.push("success", "已建立壓縮工作，正在背景處理"); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  return <main className="container space-y-5 py-6 sm:py-8">
    <div><p className="text-xs uppercase tracking-[.24em] text-[#37d3ff]">SMART COMPRESSOR</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">智慧檔案壓縮中心</h1><p className="mt-2 max-w-2xl text-sm text-muted">輸入目標檔案大小，系統會以目標大小導向策略自動調整品質、解析度與編碼；如果安全品質下無法達成，會誠實告知最佳結果。</p></div>
    <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <Card title="開始智慧壓縮" subtitle="支援 JPG、PNG、WebP、AVIF 與 PDF">
        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#37d3ff]/40 bg-[#37d3ff]/5 p-5 text-center hover:bg-[#37d3ff]/10"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><span className="text-3xl">⇧</span><strong className="mt-2 text-sm">{file ? file.name : "拖曳檔案到這裡，或點擊選擇檔案"}</strong><span className="mt-1 text-xs text-muted">{file ? `${file.type || "未知格式"} ・ ${pretty(file.size)}` : "單檔上限由管理員設定"}</span></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="目標大小"><div className="flex gap-2"><Input type="number" min="0.5" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} /><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option>MB</option><option>KB</option></Select></div></Field><Field label="壓縮模式"><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="precise">精準目標大小</option><option value="best">最佳品質</option><option value="fast">最快壓縮</option><option value="custom">自訂品質</option></Select></Field><div className="flex items-end"><Button full size="lg" onClick={submit} loading={busy}>開始智慧壓縮</Button></div></div>
        {warning && <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">此目標大小可能造成文字、公式或細線品質明顯下降，系統會優先保護學習文件可讀性。</p>}
      </Card>
      <Card title="處理狀態" subtitle="真實階段狀態，不顯示虛假的處理百分比">
        {!job ? <div className="flex min-h-40 items-center justify-center text-sm text-muted">選擇檔案後開始，這裡會顯示進度。</div> : <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{job.originalFilename}</p><p className="mt-1 text-xs text-muted">{stageText[job.stage] ?? job.stage}</p></div><Badge tone={job.status === "failed" ? "rose" : job.status.includes("completed") ? "green" : "cyan"}>{job.status === "completed_with_warning" ? "完成但未達目標" : stageText[job.stage] ?? job.status}</Badge></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] transition-all" style={{ width: `${job.progress}%` }} /></div>{job.status === "failed" && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-xs text-rose-100">{job.errorMessage}</p>}{job.compressedSize && <div className="grid grid-cols-3 gap-2"><Stat label="壓縮後" value={pretty(job.compressedSize)} tone="cyan" /><Stat label="節省" value={`${(job.compressionRatio ?? 0).toFixed(1)}%`} tone="gold" /><Stat label="品質" value={job.qualityScore ?? "—"} /></div>}{job.resultUrl && <Button full variant="gold" onClick={() => { window.open(job.resultUrl!, "_blank", "noopener,noreferrer"); }}>下載壓縮檔</Button>}</div>}
      </Card>
    </div>
    {job?.resultUrl && file?.type.startsWith("image/") && <Card title="壓縮前後比較" subtitle="右側為壓縮結果"><div className="grid gap-3 md:grid-cols-2"><div><p className="mb-2 text-xs text-muted">原圖・{pretty(file.size)}</p><Image src={URL.createObjectURL(file)} width={800} height={500} unoptimized alt="原圖預覽" className="max-h-72 w-full rounded-xl object-contain bg-black/20" /></div><div><p className="mb-2 text-xs text-muted">壓縮後・{pretty(job.compressedSize)}</p><Image src={job.resultUrl} width={800} height={500} unoptimized alt="壓縮後預覽" className="max-h-72 w-full rounded-xl object-contain bg-black/20" /></div></div></Card>}
    <Card title="壓縮紀錄" subtitle="只顯示你的歷史紀錄"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted"><tr><th className="pb-3">檔案</th><th className="pb-3">原始大小</th><th className="pb-3">壓縮後</th><th className="pb-3">節省</th><th className="pb-3">狀態</th><th className="pb-3" /></tr></thead><tbody>{history.map((item) => <tr key={item.id} className="border-t border-[var(--line)]"><td className="py-3">{item.originalFilename}</td><td>{pretty(item.originalSize)}</td><td>{pretty(item.compressedSize)}</td><td>{item.compressionRatio == null ? "—" : `${item.compressionRatio.toFixed(1)}%`}</td><td><Badge tone={item.status === "failed" ? "rose" : item.status.includes("completed") ? "green" : "cyan"}>{item.status}</Badge></td><td>{item.resultUrl && <a className="text-[#37d3ff] hover:underline" href={item.resultUrl} download>下載</a>}</td></tr>)}{!history.length && <tr><td colSpan={6} className="py-8 text-center text-muted">尚無壓縮紀錄</td></tr>}</tbody></table></div></Card>
  </main>;
}
