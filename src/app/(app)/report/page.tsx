"use client";

import { useState } from "react";
import { Button, Card, EmptyState, ErrorState, Skeleton, Stat, Tabs, useToast } from "@/components/ui";
import { BarChart, DonutChart, LineChart } from "@/components/charts";
import { apiPost, shareContent, useApi } from "@/lib/api";

type Report = {
  range: string;
  from: string;
  to: string;
  totalMinutes: number;
  dailySeries: Array<{ date: string; minutes: number }>;
  subjectSplit: Array<{ subject: string; minutes: number }>;
  attempts: Array<{ id: string; score: number; total: number; correctCount: number; submittedAt: string | null }>;
  wrongResolved: number;
  wrongOpen: number;
  tasksClaimed: number;
  streak: number;
  xp: number;
  level: number;
  nova: number;
  stats: Array<{ subject: string; average: number; trend: string; series: Array<{ date: string; percentage: number }> }>;
};

export default function ReportPage() {
  const toast = useToast();
  const [range, setRange] = useState("week");
  const { data, loading, error, reload } = useApi<Report>(`/report?range=${range}`, [range]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">◒ 學習報告</h1>
          <p className="text-xs text-muted sm:text-sm">
            {data ? `${data.from} ~ ${data.to}` : "統計你的專注時間、科目分布、錯題改善與任務完成"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!data) return;
            const res = await apiPost<{ url: string }>("/shares", {
              kind: "plan",
              title: `我這${range === "month" ? "個月" : "週"}學了 ${data.totalMinutes} 分鐘`,
              payload: { minutes: data.totalMinutes, streak: data.streak, xp: data.xp, level: data.level },
            });
            const out = await shareContent({ title: "StudyNova 學習報告", text: `我累積學習 ${data.totalMinutes} 分鐘，連續 ${data.streak} 天！`, url: `${window.location.origin}${res.url}` });
            toast.push("success", out === "copied" ? "已複製分享連結" : "已開啟分享");
          }}
        >
          分享報告卡
        </Button>
      </header>

      <Tabs
        tabs={[
          { key: "week", label: "本週" },
          { key: "last_week", label: "上週" },
          { key: "month", label: "本月" },
        ]}
        active={range}
        onChange={setRange}
      />

      {loading && <Card><Skeleton lines={5} /></Card>}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="學習時間" value={`${data.totalMinutes} 分`} tone="cyan" />
            <Stat label="連續學習" value={`${data.streak} 天`} tone="violet" />
            <Stat label="任務完成" value={data.tasksClaimed} />
            <Stat label="Nova / XP" value={`${data.nova} / ${data.xp}`} tone="gold" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="每日專注分鐘">
              <BarChart series={data.dailySeries.map((d) => ({ label: d.date.slice(5), value: d.minutes }))} suffix="" />
            </Card>
            <Card title="科目時間分布">
              {data.subjectSplit.length ? <DonutChart data={data.subjectSplit.map((s) => ({ label: s.subject, value: s.minutes }))} /> : <EmptyState icon="◒" title="這段期間沒有學習紀錄" />}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="錯題改善">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="已完全掌握" value={data.wrongResolved} tone="cyan" />
                <Stat label="仍待複習" value={data.wrongOpen} />
              </div>
              <p className="mt-2 text-xs text-muted">
                掌握率{" "}
                {data.wrongOpen + data.wrongResolved > 0 ? Math.round((data.wrongResolved / (data.wrongOpen + data.wrongResolved)) * 100) : 0}%
              </p>
            </Card>

            <Card title="測驗成績走勢">
              {data.attempts.length ? (
                <LineChart
                  series={[...data.attempts].reverse().map((a) => ({ label: a.submittedAt?.slice(5, 10) ?? "", value: a.score }))}
                  suffix="分"
                  color="#ffc857"
                />
              ) : (
                <EmptyState icon="▤" title="這段期間沒有測驗紀錄" />
              )}
            </Card>
          </div>

          {data.stats.length > 0 && (
            <Card title="各科成績趨勢">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.stats.map((s) => (
                  <div key={s.subject} className="glass-soft p-3">
                    <p className="text-sm font-medium">
                      {s.subject}・平均 {s.average}
                    </p>
                    <LineChart series={s.series.map((x) => ({ label: x.date.slice(5), value: x.percentage }))} height={90} suffix="%" />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
