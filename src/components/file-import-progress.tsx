"use client";

import { Progress } from "@/components/ui";

export type FileImportProgressState = {
  current: number;
  total: number;
  label: string;
  fileName?: string;
  stage?: string;
  error?: string;
};

export function FileImportProgress({ progress, tone = "cyan" }: { progress: FileImportProgressState | null; tone?: "violet" | "gold" | "cyan" | "green" }) {
  if (!progress || progress.total <= 0) return null;
  const current = Math.max(0, Math.min(progress.current, progress.total));
  const percent = Math.round((current / progress.total) * 100);
  return (
    <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-cyan-50">{progress.label}</span>
        <span className="font-mono text-cyan-100">第 {current} / {progress.total} 個</span>
      </div>
      <Progress value={current} max={progress.total} tone={tone} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{progress.stage ?? "正在處理，請不用一直重新整理"}{progress.fileName ? `・${progress.fileName}` : ""}</span>
        <span>{percent}%</span>
      </div>
      {progress.error && <p className="mt-2 rounded-lg bg-rose-300/10 px-2 py-1.5 text-xs text-rose-100">這個檔案處理失敗：{progress.error}</p>}
    </div>
  );
}

export function FileImportSummary({ current, total, failed = 0 }: { current: number; total: number; failed?: number }) {
  if (!total) return null;
  return <p className="mt-2 text-xs text-muted">已處理 {current} / {total} 個檔案{failed ? `・失敗 ${failed} 個（其他檔案仍會繼續）` : ""}</p>;
}
