"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Skeleton, Stat, Textarea, useToast } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { NoviAvatar } from "@/components/brand";
import { apiPost, useApi } from "@/lib/api";
import { NovaCostNotice } from "@/components/NovaCostNotice";
import { WordsPanel } from "@/features/study/panels-c";

type SubjectStat = {
  subject: string;
  average: number;
  latest: number;
  first: number;
  trend: "up" | "down" | "flat" | "volatile";
  delta: number;
  series: Array<{ date: string; percentage: number; examName: string }>;
};

type Adaptive = {
  metrics: { reviewsDue: number; events30d: number; correctEvents30d: number; studySeconds30d: number; activeDays30d: number };
  recommendations: Array<{ kind: string; priority: number; title: string; reason: string; count?: number; mastery?: number; subject?: string }>;
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
  countdowns: Array<{ type: string; name: string; date: string; daysLeft: number; urgent: boolean }>;

  dueWrong: number;
  wordsDue: number;
  nova: number;
  novi: { level: number; xp: number } | null;
  activities: Array<{ id: string; title: string; cover: string; goalValue: number; progress: number; rewardNova: number; endsAt: string }>;
  announcements: Array<{ id: string; title: string; body: string; link: string; pinned: boolean }>;
  marquee: Array<{ id: string; title: string }>;
  openWeek: { id: string; weekCode: string; title: string; novaCost: number } | null;
  isPro: boolean;
  aiEnabled: boolean;
};

const TREND_LABEL = { up: "↗ 上升", down: "↘ 下降", flat: "→ 持平", volatile: "↕ 波動" };

export default function DashboardPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Dashboard>("/dashboard");
  const [dailySubject, setDailySubject] = useState("隨機");
  const daily = useApi<{ item: { id: string; subject: string; title: string; content: string; topic: string; source: string; sourceUrl: string } | null; availableSubjects: string[] }>(`/daily-knowledge?date=${encodeURIComponent(data?.today ?? "")}&subject=${encodeURIComponent(dailySubject)}`, [data?.today, dailySubject]);
  const adaptive = useApi<Adaptive>("/adaptive/next");
  const radar = useApi<{ metrics: Array<{ key: string; label: string; value: number; evidence: string }>; weakest: { label: string; value: number; evidence: string } | null }>("/learning/radar");
  const alerts = useApi<{ alerts: Array<{ id: string; title: string; body: string; evidence: Record<string, unknown> }>; enabled: boolean }>("/ai/alerts");
  const patterns = useApi<{ patterns: Array<{ subject: string; reason: string; count: number; questionCount: number; evidence: string }>; enoughData: boolean }>("/learning/error-patterns");
  const examPolicies = useApi<{ policies: Array<{ id: string; schoolName: string; educationLevel: string; grade: number; term: string; examName: string; examDate: string }> }>("/exam-date-policies");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [appealExam, setAppealExam] = useState<Dashboard["upcomingExams"][number] | null>(null);
  const [appealDate, setAppealDate] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [appealSending, setAppealSending] = useState(false);

  async function submitExamAppeal() {
    if (!appealExam || !appealDate || appealReason.trim().length < 5) return toast.push("error", "請填寫正確日期與至少 5 個字的申請理由");
    setAppealSending(true);
    try {
      await apiPost("/exam-date-appeals", { examId: appealExam.id, examName: appealExam.name, currentExamDate: appealExam.examDate, requestedExamDate: appealDate, reason: appealReason.trim() });
      toast.push("success", "異議申請已送出，等待管理員審核");
      setAppealExam(null); setAppealDate(""); setAppealReason("");
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "申請失敗"); } finally { setAppealSending(false); }
  }

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
          {data.countdowns?.[0] && <div className={`order-first rounded-2xl border px-4 py-2 text-center sm:order-last sm:min-w-[150px] ${data.countdowns[0].urgent ? "border-rose-300/70 bg-rose-500/15" : "border-cyan-300/40 bg-cyan-500/10"}`}><p className="text-[10px] font-semibold text-muted">{data.countdowns[0].name}</p><strong className="block text-4xl font-black tabular-nums text-white">{data.countdowns[0].daysLeft}</strong><span className="text-xs text-muted">天倒數</span></div>}
          <NoviAvatar size={76} state={data.dueWrong > 0 ? "remind" : "happy"} level={data.novi?.level ?? 1} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold sm:text-xl">🤖 Novi 今天建議</h1>
              {data.isPro && <Badge tone="gold">Nova Pro</Badge>}
              {!data.aiEnabled && <Badge tone="muted">AI 未設定</Badge>}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{data.greeting}</p>
            {data.countdowns?.some((countdown) => countdown.daysLeft < 5) && <p className="mt-2 rounded-lg bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-200">距離重要考試不到 5 天，今天請優先完成複習任務。</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/study?tab=plan">
                <Button size="sm">看看今天可以做什麼</Button>
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

      {adaptive.data && (
        <Card title="🧭 Novi 的下一步建議" subtitle="依照你的實際複習、錯題與知識點狀態動態安排，不是固定模板。">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="glass-soft rounded-xl p-2"><p className="text-muted">到期複習</p><p className="mt-1 text-lg font-bold text-[#7dd3fc]">{adaptive.data.metrics.reviewsDue}</p></div>
            <div className="glass-soft rounded-xl p-2"><p className="text-muted">近 30 天活動</p><p className="mt-1 text-lg font-bold text-violet-200">{adaptive.data.metrics.activeDays30d} 天</p></div>
            <div className="glass-soft rounded-xl p-2"><p className="text-muted">近 30 天正確</p><p className="mt-1 text-lg font-bold text-emerald-200">{adaptive.data.metrics.correctEvents30d}</p></div>
          </div>
          <div className="space-y-2">
            {adaptive.data.recommendations.slice(0, 4).map((item) => (
              <div key={`${item.kind}-${item.title}`} className="glass-soft flex items-start gap-3 rounded-xl p-3">
                <span className="text-lg">{item.kind === "review" ? "🔁" : item.kind === "wrong" ? "🧩" : "📚"}</span>
                <div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted">{item.reason}</p></div>
              </div>
            ))}
            {!adaptive.data.recommendations.length && <p className="text-sm text-muted">目前沒有急迫項目，維持今天的學習節奏就很棒了 ✨</p>}
          </div>
        </Card>
      )}

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
        <WordsPanel />
        <Card title="💡 每日知識" subtitle="每天一則真正有內容的科目知識；只有通過來源與相似度檢查的內容才會出現">
          <div className="mb-3 flex items-center gap-2"><select className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm" value={dailySubject} onChange={(e) => setDailySubject(e.target.value)}><option value="隨機">隨機</option>{(daily.data?.availableSubjects ?? []).map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></div>
          {daily.data?.item ? <article className="glass-soft min-h-[148px] max-h-[230px] overflow-hidden p-4"><div className="flex items-center justify-between gap-2"><Badge tone="cyan">{daily.data.item.subject}</Badge><span className="truncate text-[11px] text-muted">{daily.data.item.topic}</span></div><p className="mt-2 text-base font-semibold text-[#37d3ff]">{daily.data.item.title}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{daily.data.item.content}</p><div className="mt-2 flex flex-wrap gap-3 text-xs"><Link href={`/knowledge/${data.today}?subject=${encodeURIComponent(dailySubject)}`} className="text-[#37d3ff] underline">完整解析與測驗 →</Link>{daily.data.item.sourceUrl && <a href={daily.data.item.sourceUrl} target="_blank" rel="noreferrer" className="text-muted underline">來源 ↗</a>}</div></article> : <p className="text-sm text-muted">今天這個科目尚未有核准且未重複的內容。</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🧠 我的學習能力" subtitle={radar.data?.weakest ? `目前最值得補強：${radar.data.weakest.label}` : "完成更多真實學習紀錄後會開始分析"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(radar.data?.metrics ?? []).map((metric) => <div key={metric.key} className="glass-soft rounded-xl p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs">{metric.label}</span><b className="text-[#7dd3fc]">{metric.value}</b></div><Progress value={metric.value} max={100} tone={metric.value < 60 ? "violet" : "cyan"} /><p className="mt-1 line-clamp-2 text-[10px] text-muted">{metric.evidence}</p></div>)}
          </div>
          {!radar.loading && !radar.data?.metrics.length && <EmptyState title="還沒有足夠資料" hint="完成題目、單字複習或考試後，這裡會使用真實紀錄更新。" />}
        </Card>
        <Card title="🔍 Novi 發現的錯誤模式" subtitle="只顯示有資料證據的重複錯誤，不憑感覺猜測。">
          <div className="space-y-2">{patterns.data?.patterns.map((pattern) => <div key={`${pattern.subject}-${pattern.reason}`} className="glass-soft rounded-xl p-3"><p className="text-sm font-semibold">{pattern.subject}・{pattern.reason}</p><p className="mt-1 text-xs text-muted">{pattern.evidence}</p><Link href="/study?tab=wrong" className="mt-2 inline-block text-xs text-[#37d3ff] underline">針對這個問題開始訓練 →</Link></div>)}{patterns.data && !patterns.data.patterns.length && <EmptyState title="目前沒有重複錯誤模式" hint="累積至少幾次錯題分析後，Novi 才會建立證據。" />}</div>
        </Card>
      </div>

      <Card title="🤖 Novi 主動提醒" subtitle={alerts.data?.enabled === false ? "主動提醒已關閉，可在個人設定重新開啟。" : "提醒內容只會來自你的實際學習紀錄。"}>
        <div className="space-y-2">{alerts.data?.alerts.slice(0, 3).map((alert) => <div key={alert.id} className="glass-soft rounded-xl p-3"><p className="text-sm font-semibold">{alert.title}</p><p className="mt-1 text-xs leading-5 text-muted">{alert.body}</p></div>)}{alerts.data?.enabled !== false && !alerts.data?.alerts.length && <p className="text-sm text-muted">目前沒有需要打擾你的提醒，維持自己的節奏就好。</p>}</div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="✓ 今天不知道做什麼？不妨參考看看" subtitle="挑一件適合現在狀態的事就好，不必追求一次完成全部">
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

      {data.countdowns?.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2" aria-label="重要倒數">
          {data.countdowns.map((countdown) => (
            <div key={countdown.type} className={`relative overflow-hidden rounded-2xl border p-5 ${countdown.urgent ? "border-[#ff6b8a]/70 bg-gradient-to-br from-[#7f1d3b]/60 to-[#2b1635] shadow-[0_0_34px_rgba(255,107,138,0.25)]" : "border-[#37d3ff]/35 bg-gradient-to-br from-[#102e55] to-[#161b3d]"}`}>
              <p className={`text-xs font-semibold tracking-[0.24em] ${countdown.urgent ? "text-[#ff9bb0]" : "text-[#7dd3fc]"}`}>{countdown.urgent ? "⚠ 最後衝刺" : "✦ 重要倒數"}</p>
              <p className="mt-1 text-sm text-muted">{countdown.name}</p>
              <div className="mt-1 flex items-end gap-2"><strong className={`text-5xl font-black tabular-nums ${countdown.urgent ? "text-[#ffd1da]" : "text-white"}`}>{countdown.daysLeft}</strong><span className="pb-1 text-lg text-muted">天</span></div>
              <p className="mt-1 text-xs text-muted">日期：{countdown.date}</p>
              {countdown.urgent && <p className="mt-3 text-xs font-semibold text-[#ffd1da]">每天都要記得讀書，現在開始準備還來得及。</p>}
            </div>
          ))}
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="⌁ 考試倒數" subtitle="日期來自你的考試設定；若學校公告不同，可提出異議申請。" action={<Link href="/grades" className="text-xs underline text-muted">管理</Link>}>
          {data.upcomingExams.length ? (
            <div className="space-y-2">
              {data.upcomingExams.map((e) => (
                <div key={e.id} className="glass-soft flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted">{e.examDate}</p>
                    <button type="button" className="mt-1 text-[11px] text-[#7dd3fc] underline" onClick={() => { setAppealExam(e); setAppealDate(e.examDate); setAppealReason(""); }}>日期不符？提出異議</button>
                  </div>
                  <span className={`shrink-0 text-lg font-bold tabular-nums ${e.daysLeft <= 7 ? "text-[#ffc857]" : "text-[#37d3ff]"}`}>{e.daysLeft} 天</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="⌁" title="尚未設定考試" hint="到成績頁新增段考或模擬考，AI 會自動調整讀書計畫。" action={<Link href="/grades"><Button size="sm" variant="ghost">新增考試</Button></Link>} />
          )}
        </Card>

        <Card title="⌁ 個人段考倒數" subtitle="依你的學校、學制與年級匹配管理員設定的日期。" action={<Link href="/grades" className="text-xs underline text-muted">管理</Link>}>
          {examPolicies.data?.policies.length ? <div className="space-y-2">{examPolicies.data.policies.map((policy) => <div key={policy.id} className="glass-soft flex items-center justify-between px-3 py-2.5"><div><p className="text-sm font-medium">{policy.examName}</p><p className="text-xs text-muted">{policy.schoolName || "學校通用"}・{policy.term}・{policy.examDate}</p></div><span className="text-xs text-[#7dd3fc]">已匹配</span></div>)}</div> : <EmptyState icon="⌁" title="尚未匹配到段考日期" hint="請確認個人資料的學校、學制與年級，或等待管理員設定。" />}
        </Card>
        <Card title="⌁ 成績趨勢" action={<Link href="/grades" className="text-xs underline text-muted">完整分析</Link>}>
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
            <EmptyState icon="◒" title="還沒有成績資料" hint="新增第一筆成績，AI 就能開始分析趨勢與弱科。" action={<Link href="/grades"><Button size="sm" variant="ghost">新增成績</Button></Link>} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="◇ 進行中的活動">
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
            <EmptyState icon="◇" title="目前沒有進行中的活動" hint="管理員發布活動後會顯示在這裡。" />
          )}
        </Card>

        <Card title="▤ 公告與每週小考">
          {data.openWeek && (
            <Link href="/weekly" className="glass-soft focus-ring mb-2 block px-3 py-2.5 text-sm hover:bg-white/5">
              <div className="flex items-center justify-between gap-2"><span>▦ {data.openWeek.title} 開放中</span><span className="text-[#37d3ff]">前往 →</span></div>
              <NovaCostNotice cost={data.openWeek.novaCost} action="開始本週小考" className="mt-2" />
            </Link>
          )}
          {data.announcements.length ? (
            <div className="space-y-2">
              {data.announcements.slice(0, 4).map((a) => (
                <Link key={a.id} href={a.link || "/dashboard"} className="glass-soft focus-ring block px-3 py-2.5 hover:bg-white/5">
                  <p className="text-sm font-medium">
                    {a.pinned && "• "}
                    {a.title}
                  </p>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.body}</p>}
                  <span className="mt-1 inline-block text-[11px] text-[#37d3ff]">快速前往 →</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="▤" title="目前沒有公告" />
          )}
        </Card>
      </div>

      {data.recentGrades.length > 0 && (
        <Card title="▧ 最近成績">
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
      <Modal open={Boolean(appealExam)} onClose={() => setAppealExam(null)} title="段考日期異議申請">
        {appealExam && <div className="space-y-3"><p className="text-xs text-muted">目前系統日期：{appealExam.examDate}。審核通過後才會更新倒數，送出後請等待管理員確認。</p><Field label="你認為的段考日期"><Input type="date" value={appealDate} onChange={(e) => setAppealDate(e.target.value)} /></Field><Field label="申請理由"><Textarea value={appealReason} onChange={(e) => setAppealReason(e.target.value)} placeholder="例如：學校公告段考延期至……" /></Field><Button full loading={appealSending} onClick={submitExamAppeal}>送出異議申請</Button></div>}
      </Modal>
    </div>
  );
}
