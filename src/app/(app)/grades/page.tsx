"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Textarea, useToast } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { apiDelete, apiPost, apiPut, errorMessage, useApi } from "@/lib/api";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];
const TYPES = [
  { key: "midterm", label: "段考" },
  { key: "quiz", label: "小考" },
  { key: "mock", label: "模擬考" },
  { key: "homework", label: "作業" },
  { key: "daily", label: "平時成績" },
];

type Stats = { subject: string; count: number; average: number; best: number; worst: number; latest: number; first: number; trend: string; delta: number; series: Array<{ date: string; percentage: number; examName: string }> };
type Record_ = { id: string; subject: string; examName: string; examType: string; examDate: string; score: number; fullScore: number; percentage: number; classAverage: number | null; scope: string; note: string };
type Goal = { id: string; subject: string; targetScore: number | null; baselineScore: number | null; achievedAt: string | null };

export default function GradesPage() {
  const toast = useToast();
  const grades = useApi<{ records: Record_[]; goals: Goal[]; stats: Stats[] }>("/grades");
  const exams = useApi<{ exams: Array<{ id: string; name: string; examDate: string; daysLeft: number; note: string; subjects: Array<{ subject: string; scope: string; targetScore: number | null }> }> }>("/exams");
  const [open, setOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [analysis, setAnalysis] = useState<{ facts: string[]; summary: string; priority: string[]; suggestions: string[]; aiUsed: boolean } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({ subject: "英文", examName: "", examType: "midterm", examDate: new Date().toISOString().slice(0, 10), fullScore: 100, score: 0, scope: "", classAverage: "", note: "" });
  const [examForm, setExamForm] = useState({ name: "", examDate: "", note: "", subject: "英文", scope: "" });
  const [goalForm, setGoalForm] = useState({ subject: "數學", targetScore: 85, baselineScore: 72 });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">成績管理與 AI 分析</h1>
          <p className="text-xs text-muted sm:text-sm">所有數據都來自你實際輸入的成績，AI 只會依真實資料分析。</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setOpen(true)}>＋ 新增成績</Button>
          <Button size="sm" variant="ghost" onClick={() => setExamOpen(true)}>＋ 考試倒數</Button>
          <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>◇ 目標分數</Button>
        </div>
      </header>

      {grades.loading && <Card><Skeleton lines={4} /></Card>}
      {grades.error && <ErrorState message={grades.error} onRetry={grades.reload} />}

      {grades.data && grades.data.stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="紀錄筆數" value={grades.data.records.length} tone="cyan" />
          <Stat label="平均百分比" value={`${Math.round((grades.data.stats.reduce((a, b) => a + b.average, 0) / grades.data.stats.length) * 10) / 10}%`} tone="violet" />
          <Stat label="最強科目" value={[...grades.data.stats].sort((a, b) => b.average - a.average)[0]?.subject ?? "-"} tone="gold" />
          <Stat label="最弱科目" value={[...grades.data.stats].sort((a, b) => a.average - b.average)[0]?.subject ?? "-"} />
        </div>
      )}

      <Card
        title="⌁ 科目趨勢"
        action={
          <Button
            size="sm"
            loading={analyzing}
            onClick={async () => {
              setAnalyzing(true);
              try {
                setAnalysis(await apiPost("/grades/analyze"));
              } catch (err) {
                toast.push("error", errorMessage(err));
              } finally {
                setAnalyzing(false);
              }
            }}
          >
            AI 分析
          </Button>
        }
      >
        {!grades.data?.stats.length && <EmptyState icon="◒" title="還沒有成績" hint="新增第一筆成績即可看到趨勢圖與 AI 分析。" />}
        <div className="grid gap-4 sm:grid-cols-2">
          {grades.data?.stats.map((s) => {
            const goal = grades.data?.goals.find((g) => g.subject === s.subject);
            return (
              <div key={s.subject} className="glass-soft p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{s.subject}</p>
                  <Badge tone={s.trend === "up" ? "green" : s.trend === "down" ? "rose" : "muted"}>
                    {s.trend === "up" ? "↗ 上升" : s.trend === "down" ? "↘ 下降" : s.trend === "volatile" ? "↕ 波動" : "→ 持平"} {s.delta > 0 ? `+${s.delta}` : s.delta}
                  </Badge>
                </div>
                <LineChart series={s.series.map((x) => ({ label: x.date.slice(5), value: x.percentage }))} height={120} suffix="%" />
                <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px] text-muted">
                  <span>平均 {s.average}</span>
                  <span>最高 {s.best}</span>
                  <span>最低 {s.worst}</span>
                  <span>最新 {s.latest}</span>
                </div>
                {goal?.targetScore && (
                  <p className="mt-1 text-[11px] text-[#ffd98a]">
                    ◇ 目標 {goal.targetScore} 分（目前 {s.latest}）{goal.achievedAt ? "・已達成！" : `・還差 ${Math.max(0, Math.round((goal.targetScore - s.latest) * 10) / 10)} 分`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {analysis && (
          <div className="glass-soft mt-3 space-y-2 p-3 text-xs">
            <p className="font-medium">{analysis.aiUsed ? "✦ AI 分析" : "⌁ 系統統計分析"}</p>
            {analysis.facts.map((f, i) => (
              <p key={i} className="text-muted">
                • {f}
              </p>
            ))}
            {analysis.summary && <p className="rounded-lg bg-black/25 p-2">{analysis.summary}</p>}
            {analysis.priority.length > 0 && (
              <p>
                優先順序：
                {analysis.priority.map((p) => (
                  <Badge key={p} tone="gold">
                    {p}
                  </Badge>
                ))}
              </p>
            )}
            {analysis.suggestions?.map((s, i) => (
              <p key={i}><span className="mr-1 text-[#ffc857]">•</span>{s}</p>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="⌁ 考試倒數">
          {!exams.data?.exams.length && <EmptyState icon="⌁" title="尚未建立考試" />}
          <div className="space-y-2">
            {exams.data?.exams.map((e) => (
              <div key={e.id} className="glass-soft p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{e.name}</p>
                  <span className={`text-lg font-bold ${e.daysLeft <= 7 ? "text-[#ffc857]" : "text-[#37d3ff]"}`}>{e.daysLeft} 天</span>
                </div>
                <p className="text-[11px] text-muted">
                  {e.examDate}
                  {e.subjects.length > 0 && `・${e.subjects.map((s) => s.subject).join("、")}`}
                </p>
                {e.subjects.map((s) => s.scope && <p key={s.subject} className="text-[11px] text-muted">範圍：{s.scope}</p>)}
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1.5"
                  onClick={async () => {
                    await apiDelete(`/exams/${e.id}`);
                    toast.push("success", "已刪除");
                    await exams.reload();
                  }}
                >
                  刪除
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="▧ 成績紀錄">
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto scroll-thin">
            {grades.data?.records.map((r) => (
              <div key={r.id} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {r.subject}・{r.examName}
                  </p>
                  <p className="text-[11px] text-muted">
                    {r.examDate}・{TYPES.find((t) => t.key === r.examType)?.label}
                    {r.classAverage ? `・班平均 ${r.classAverage}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {r.score}/{r.fullScore}
                  </span>
                  <button
                    onClick={async () => {
                      if (!confirm("刪除這筆成績？")) return;
                      await apiDelete(`/grades/${r.id}`);
                      await grades.reload();
                    }}
                    className="text-xs text-muted hover:text-rose-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {!grades.data?.records.length && <EmptyState icon="▧" title="還沒有成績紀錄" />}
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="新增成績">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="科目" required>
            <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="考試類型" required>
            <Select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="考試名稱" required>
            <Input value={form.examName} onChange={(e) => setForm({ ...form, examName: e.target.value })} placeholder="第一次段考" />
          </Field>
          <Field label="日期" required>
            <Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
          </Field>
          <Field label="滿分" required>
            <Input type="number" value={form.fullScore} onChange={(e) => setForm({ ...form, fullScore: Number(e.target.value) })} />
          </Field>
          <Field label="實得分數" required>
            <Input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} />
          </Field>
          <Field label="班平均（選填）">
            <Input type="number" value={form.classAverage} onChange={(e) => setForm({ ...form, classAverage: e.target.value })} />
          </Field>
          <Field label="考試範圍">
            <Input value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="L1-L3" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="備註">
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="!min-h-[60px]" />
            </Field>
          </div>
        </div>
        <Button
          full
          className="mt-3"
          onClick={async () => {
            try {
              const res = await apiPost<{ goalAchieved: boolean }>("/grades", {
                ...form,
                classAverage: form.classAverage ? Number(form.classAverage) : null,
              });
              toast.push("success", res.goalAchieved ? "🎉 恭喜達成目標分數！獲得獎勵" : "成績已新增");
              setOpen(false);
              await grades.reload();
            } catch (err) {
              toast.push("error", errorMessage(err));
            }
          }}
        >
          儲存成績
        </Button>
      </Modal>

      <Modal open={examOpen} onClose={() => setExamOpen(false)} title="新增考試倒數">
        <div className="space-y-3">
          <Field label="考試名稱" required>
            <Input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder="第二次段考" />
          </Field>
          <Field label="考試日期" required>
            <Input type="date" value={examForm.examDate} onChange={(e) => setExamForm({ ...examForm, examDate: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="主要科目">
              <Select value={examForm.subject} onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })}>
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="範圍">
              <Input value={examForm.scope} onChange={(e) => setExamForm({ ...examForm, scope: e.target.value })} />
            </Field>
          </div>
          <Button
            full
            onClick={async () => {
              try {
                await apiPost("/exams", { name: examForm.name, examDate: examForm.examDate, note: examForm.note, subjects: [{ subject: examForm.subject, scope: examForm.scope }] });
                toast.push("success", "已新增考試，AI 會自動調整讀書計畫");
                setExamOpen(false);
                await exams.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            新增
          </Button>
        </div>
      </Modal>

      <Modal open={goalOpen} onClose={() => setGoalOpen(false)} title="設定目標分數">
        <div className="space-y-3">
          <Field label="科目">
            <Select value={goalForm.subject} onChange={(e) => setGoalForm({ ...goalForm, subject: e.target.value })}>
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="目前分數">
              <Input type="number" value={goalForm.baselineScore} onChange={(e) => setGoalForm({ ...goalForm, baselineScore: Number(e.target.value) })} />
            </Field>
            <Field label="目標分數">
              <Input type="number" value={goalForm.targetScore} onChange={(e) => setGoalForm({ ...goalForm, targetScore: Number(e.target.value) })} />
            </Field>
          </div>
          <Button
            full
            onClick={async () => {
              try {
                await apiPut("/grades/goals", goalForm);
                toast.push("success", "目標已設定，達成時會自動發放獎勵");
                setGoalOpen(false);
                await grades.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            設定目標
          </Button>
        </div>
      </Modal>
    </div>
  );
}
