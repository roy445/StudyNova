"use client";

import { useEffect } from "react";
import { apiPost, useApi } from "@/lib/api";
import { Button, Card, EmptyState, ErrorState, Skeleton, useToast } from "@/components/ui";

type Progress = {
  id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  percent: number;
  remainingItems: number;
  averageItemMs: number | null;
};

type Job = {
  id: string;
  kind: string;
  feature: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  progress: Progress | null;
};

const statusLabel: Record<string, string> = {
  queued: "排隊中",
  processing: "AI 正在分析",
  paused: "已暫停",
  completed: "已完成",
  partial: "部分完成",
  failed: "分析失敗",
  cancelled: "已取消",
};

export default function AiJobsPage() {
  const toast = useToast();
  const jobs = useApi<{ jobs: Job[] }>("/ai/background-jobs");
  const { reload } = jobs;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  async function command(id: string, action: "pause" | "resume" | "cancel" | "retry-failed") {
    await apiPost(`/ai/background-jobs/${id}/${action}`);
    const label = action === "pause" ? "已暫停 AI 背景工作" : action === "resume" ? "已恢復 AI 背景工作" : action === "cancel" ? "AI 背景工作已取消" : "已重新排入失敗項目";
    toast.push("success", label);
    await jobs.reload();
  }

  async function cancel(id: string) {
    await command(id, "cancel");
  }

  async function retry(id: string) {
    await command(id, "retry-failed");
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">AI 分析工作</h1>
        <p className="text-sm text-muted">離開頁面後工作仍會在伺服器背景執行，進度來自實際完成的項目。</p>
      </header>
      {jobs.loading && !jobs.data && <Card><Skeleton lines={4} /></Card>}
      {jobs.error && <ErrorState message={jobs.error} onRetry={jobs.reload} />}
      {jobs.data?.jobs.length === 0 && <Card><EmptyState icon="◌" title="目前沒有 AI 背景工作" /></Card>}
      <div className="space-y-3">
        {jobs.data?.jobs.map((job) => {
          const progress = job.progress;
          const percent = progress?.percent ?? 0;
          const active = ["queued", "processing", "paused"].includes(job.status);
          return (
            <Card key={job.id} title={statusLabel[job.status] ?? job.status}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{job.feature} · {job.kind}</span>
                  <span className="font-semibold">{progress?.completedItems ?? 0} / {progress?.totalItems ?? 0}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-label={`完成度 ${percent}%`}>
                  <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>{percent}% · 剩餘 {progress?.remainingItems ?? 0} 項</span>
                  {progress?.failedItems ? <span className="text-amber-300">失敗 {progress.failedItems} 項，可單獨重跑</span> : <span>沒有失敗項目</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.status === "paused" && <Button size="sm" onClick={() => void command(job.id, "resume")}>繼續工作</Button>}
                  {active && <Button size="sm" variant="ghost" onClick={() => void command(job.id, "pause")}>暫停工作</Button>}
                  {active && <Button size="sm" variant="ghost" onClick={() => void cancel(job.id)}>取消工作</Button>}
                  {progress?.failedItems ? <Button size="sm" onClick={() => void retry(job.id)}>重新分析失敗項目</Button> : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
