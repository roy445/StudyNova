"use client";

import { apiPost, useApi } from "@/lib/api";
import { Button, Card, EmptyState, ErrorState, Skeleton, useToast } from "@/components/ui";

type Job = {
  id: string;
  userId: string | null;
  kind: string;
  feature: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  provider: string;
  model: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastErrorCode: string;
  lastErrorMessage: string;
  progress: { percent: number; remainingItems: number; averageItemMs: number | null } | null;
};

export default function AdminAiJobsPage() {
  const toast = useToast();
  const jobs = useApi<{ jobs: Job[] }>("/admin/ai/background-jobs");

  async function action(id: string, command: "cancel" | "retry-failed") {
    await apiPost(`/admin/ai/background-jobs/${id}/${command}`);
    toast.push("success", command === "cancel" ? "工作已取消" : "已重新排入失敗項目");
    await jobs.reload();
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">AI Background Jobs</h1>
        <p className="text-sm text-muted">這裡顯示持久化 Job 的真實狀態，不會把排隊中的項目誤算成已完成。</p>
      </header>
      {jobs.loading && !jobs.data && <Card><Skeleton lines={5} /></Card>}
      {jobs.error && <ErrorState message={jobs.error} onRetry={jobs.reload} />}
      {jobs.data?.jobs.length === 0 && <Card><EmptyState icon="◌" title="目前沒有背景 AI 工作" /></Card>}
      <div className="space-y-3">
        {jobs.data?.jobs.map((job) => {
          const progress = job.progress;
          const active = ["queued", "processing", "paused"].includes(job.status);
          return (
            <Card key={job.id} title={`${job.feature} · ${job.kind}`} subtitle={`Job ID：${job.id}`}>
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-4">
                  <span>使用者：{job.userId ?? "已刪除帳號"}</span>
                  <span>狀態：{job.status}</span>
                  <span>Provider：{job.provider || "沿用現有分析器"}</span>
                  <span>模型：{job.model || "沿用現有設定"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress?.percent ?? 0}%` }} /></div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>{job.completedItems} / {job.totalItems} 完成 · 失敗 {job.failedItems} · 剩餘 {progress?.remainingItems ?? 0}</span>
                  <span>平均耗時：{progress?.averageItemMs ? `${progress.averageItemMs} ms / 項` : "尚無完成樣本"}</span>
                </div>
                {(job.lastErrorCode || job.lastErrorMessage) && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">{job.lastErrorCode}：{job.lastErrorMessage}</p>}
                <div className="flex flex-wrap gap-2">
                  {active && <Button size="sm" variant="ghost" onClick={() => void action(job.id, "cancel")}>取消工作</Button>}
                  {job.failedItems > 0 && <Button size="sm" onClick={() => void action(job.id, "retry-failed")}>重新執行失敗項目</Button>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
