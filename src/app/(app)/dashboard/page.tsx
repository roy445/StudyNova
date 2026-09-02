"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Progress, Skeleton, Stat, useToast } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { NoviAvatar } from "@/components/brand";
import { apiPost, useApi } from "@/lib/api";

type SubjectStat = {
  subject: string;
  average: number;
  latest: number;
  first: number;
  trend: "up" | "down" | "flat" | "volatile";
  delta: number;
  series: Array<{ date: string; percentage: number; examName: string }>;
};

type Dashboard = {
  today: string;
  greeting: string;
  minutes: number;
  focusMinutes: number;
  goal: number;
  streak: number;
  tasks: Array<{ id: string; title: string; progress: number; target: number; rewardNova: number; rewardXp: number; claimedAt: string | null }>;
  plan: { totalMinutes: number; rationale: string; blocks: Array<{ subject: string; minutes: number; focus: string; done: boolean }> };
  stats: SubjectStat[];
  weakest: SubjectStat | null;
  recentGrades: Array<{ id: string; subject: string; examName: string; score: number; fullScore: number; examDate: string; percentage: number }>;
  upcomingExams: Array<{ id: string; name: string; examDate: string; daysLeft: number }>;
  dueWrong: number;
  wordsDue: number;
  nova: number;
  novi: { level: number; xp: number } | null;
  activities: Array<{ id: string; title: string; cover: string; goalValue: number; progress: number; rewardNova: number; endsAt: string }>;
  announcements: Array<{ id: string; title: string; body: string; pinned: boolean }>;
  marquee: Array<{ id: string; title: string }>;
  openWeek: { id: string; weekCode: string; title: string } | null;
  isPro: boolean;
  aiEnabled: boolean;
};

const TREND_LABEL = { up: "↗ 上升", down: "↘ 下降", flat: "→ 持平", volatile: "↕ 波動" };

export default function DashboardPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Dashboard>("/dashboard");
  const [claiming, setClaiming] = useState<string | null>(null);

  async function claim(taskId: string) {
    setClaiming(taskId);
    try {
      const res = await apiPost<{ reward: { nova: number; xp: number; doubled: boolean } }>(`/tasks/daily/${taskId}/claim`);
      toast.push("success", `獲得 ${res.reward.nova} Nova + ${res.reward.xp} XP${res.reward.doubled ? "（Nova Pro 雙倍）" : ""}`);
      await reload();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "領取失敗");
    } finally {
      setClaiming(null);
    }
  }

  async function toggleBlock(index: number, done: boolean) {
    try {
      await apiPost("/plan/block-done", { index, done });
      toast.push("success", done ? "完成一個學習區塊！" : "已取消完成");
      await reload();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "更新失敗");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card><Skeleton lines={3} /></Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><Skeleton lines={2} /></Card>
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error ?? "載入失敗"} onRetry={reload} />;

  const goalPct = Math.min(100, Math.round((data.minutes / (data.goal || 1)) * 100));

  return (
    <div className="space-y-4">
      {data.marquee.length > 0 && (
        <div className="glass overflow-hidden px-0 py-2">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap px-4 text-xs text-[#7dd3fc]">
            {[...data.marquee, ...data.marquee].map((m, i) => (
              <span key={`${m.id}-${i}`}>📣 {m.title}</span>
            ))}
          </div>
        </div>
      )}

      {/* Novi greeting */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-col gap-3 bg-gradient-to-r from-[#7c5cff]/20 via-transparent to-[#37d3ff]/10 p-4 sm:flex-row sm:items-center sm:p-5">
          <NoviAvatar size={76} state={data.dueWrong > 0 ? "remind" : "happy"} level={data.novi?.level ?? 1} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold sm:text-xl">🤖 Novi 今天建議</h1>
              {data.isPro && <Badge tone="gold">Nova Pro</Badge>}
              {!data.aiEnabled && <Badge tone="muted">AI 未設定</Badge>}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{data.greeting}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/study?tab=plan">
                <Button size="sm">開始今日任務</Button>
              </Link>
              <Link href="/ai">
                <Button size="sm" variant="ghost">
                  問 Novi
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="今日學習" value={`${data.minutes} 分`} hint={`目標 ${data.goal} 分（${goalPct}%）`} tone="cyan" />
        <Stat label="連續學習" value={`${data.streak} 天`} hint="每天完成任一學習即可累積" tone="violet" />
        <Stat label="Nova 點數" value={data.nova} hint="可用於 Novi 商店" tone="gold" />
        <Stat label="Novi 等級" value={`Lv.${data.novi?.level ?? 1}`} hint={`${data.novi?.xp ?? 0} XP`} />
      </div>

      <Card title="今日目標進度" subtitle={`專注 ${data.focusMinutes} 分鐘・待複習錯題 ${data.dueWrong} 題・今日單字 ${data.wordsDue} 個`}>
        <Progress value={data.minutes} max={data.goal} tone={goalPct >= 100 ? "green" : "violet"} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Link href="/study?tab=focus" className="glass-soft focus-ring flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5">
            <span>⏱️ 專注計時器</span> <span className="text-muted">開始</span>
          </Link>
          <Link href="/study?tab=wrong" className="glass-soft focus-ring flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5">
            <span>🎯 錯題複習</span> <span className="text-muted">{data.dueWrong} 題</span>
          </Link>
          <Link href="/study?tab=words" className="glass-soft focus-ring flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5">
            <span>🔤 今日單字</span> <span className="text-muted">{data.wordsDue} 個</span>
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🗓️ AI 今日讀書計畫" subtitle={data.plan.rationale} action={<Badge tone="cyan">{data.plan.totalMinutes} 分鐘</Badge>}>
          <div className="space-y-2">
            {data.plan.blocks.map((b, i) => (
              <div key={`${b.subject}-${i}`} className="glass-soft flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={b.done}
                  onChange={(e) => toggleBlock(i, e.target.checked)}
                  className="h-4 w-4 accent-[#7c5cff]"
                  aria-label={`完成 ${b.subject}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${b.done ? "line-through opacity-60" : ""}`}>
                    {b.subject} · {b.minutes} 分鐘
                  </p>
                  <p className="truncate text-xs text-muted">{b.focus}</p>
                </div>
              </div>
            ))}
            {!data.plan.blocks.length && <EmptyState title="還沒有計畫" hint="新增成績或錯題後，AI 會自動安排今日讀書計畫。" />}
          </div>
        </Card>

        <Card title="✅ 今日任務" subtitle="完成後可領取 Nova 與 XP">
          <div className="space-y-2">
            {data.tasks.map((t) => {
              const done = t.progress >= t.target;
              return (
                <div key={t.id} className="glass-soft px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm">{t.title}</p>
                    {t.claimedAt ? (
                      <Badge tone="green">已領取</Badge>
                    ) : done ? (
                      <Button size="sm" variant="gold" loading={claiming === t.id} onClick={() => claim(t.id)}>
                        領取 +{t.rewardNova}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {t.progress}/{t.target}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <Progress value={Math.min(t.progress, t.target)} max={t.target} tone={done ? "green" : "cyan"} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="⏰ 考試倒數" action={<Link href="/grades" className="text-xs underline text-muted">管理</Link>}>
          {data.upcomingExams.length ? (
            <div className="space-y-2">
              {data.upcomingExams.map((e) => (
                <div key={e.id} className="glass-soft flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted">{e.examDate}</p>
                  </div>
                  <span className={`shrink-0 text-lg font-bold tabular-nums ${e.daysLeft <= 7 ? "text-[#ffc857]" : "text-[#37d3ff]"}`}>{e.daysLeft} 天</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📅" title="尚未設定考試" hint="到成績頁新增段考或模擬考，AI 會自動調整讀書計畫。" action={<Link href="/grades"><Button size="sm" variant="ghost">新增考試</Button></Link>} />
          )}
        </Card>

        <Card title="📈 成績趨勢" action={<Link href="/grades" className="text-xs underline text-muted">完整分析</Link>}>
          {data.stats.length ? (
            <div className="space-y-3">
              {data.stats.slice(0, 2).map((s) => (
                <div key={s.subject}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.subject}</span>
                    <span className="text-xs text-muted">
                      平均 {s.average}・{TREND_LABEL[s.trend]}
                    </span>
                  </div>
                  <LineChart series={s.series.map((x) => ({ label: x.date.slice(5), value: x.percentage }))} height={90} suffix="%" />
                </div>
              ))}
              {data.weakest && <p className="text-xs text-muted">最需要補強：{data.weakest.subject}（平均 {data.weakest.average} 分）</p>}
            </div>
          ) : (
            <EmptyState icon="📊" title="還沒有成績資料" hint="新增第一筆成績，AI 就能開始分析趨勢與弱科。" action={<Link href="/grades"><Button size="sm" variant="ghost">新增成績</Button></Link>} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🎉 進行中的活動">
          {data.activities.length ? (
            <div className="space-y-2">
              {data.activities.map((a) => (
                <div key={a.id} className="glass-soft px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {a.cover} {a.title}
                    </p>
                    <Badge tone="gold">+{a.rewardNova} Nova</Badge>
                  </div>
                  <div className="mt-1.5">
                    <Progress value={a.progress} max={a.goalValue} tone="gold" />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    進度 {a.progress}/{a.goalValue}・結束於 {new Date(a.endsAt).toLocaleDateString("zh-TW")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🎈" title="目前沒有進行中的活動" hint="管理員發布活動後會顯示在這裡。" />
          )}
        </Card>

        <Card title="📢 公告與每週小考">
          {data.openWeek && (
            <Link href="/weekly" className="glass-soft focus-ring mb-2 flex items-center justify-between px-3 py-2.5 text-sm hover:bg-white/5">
              <span>📚 {data.openWeek.title} 開放中</span>
              <span className="text-[#37d3ff]">前往 →</span>
            </Link>
          )}
          {data.announcements.length ? (
            <div className="space-y-2">
              {data.announcements.slice(0, 4).map((a) => (
                <div key={a.id} className="glass-soft px-3 py-2.5">
                  <p className="text-sm font-medium">
                    {a.pinned && "📌 "}
                    {a.title}
                  </p>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.body}</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📭" title="目前沒有公告" />
          )}
        </Card>
      </div>

      {data.recentGrades.length > 0 && (
        <Card title="🧾 最近成績">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2">日期</th>
                  <th className="pb-2">科目</th>
                  <th className="pb-2">考試</th>
                  <th className="pb-2 text-right">分數</th>
                </tr>
              </thead>
              <tbody>
                {data.recentGrades.map((g) => (
                  <tr key={g.id} className="border-t border-[var(--line)]">
                    <td className="py-2 text-muted">{g.examDate}</td>
                    <td className="py-2">{g.subject}</td>
                    <td className="max-w-[140px] truncate py-2">{g.examName}</td>
                    <td className="py-2 text-right tabular-nums">
                      {g.score}/{g.fullScore}（{Math.round(g.percentage)}%）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
