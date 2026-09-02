"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NoviAvatar } from "@/components/brand";
import { Button, Card, Field, Input, Select, useToast } from "@/components/ui";
import { apiPatch, errorMessage } from "@/lib/api";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民"];

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    schoolLevel: "junior" as "junior" | "senior",
    grade: 1,
    dailyGoalMinutes: 45,
    favoriteSubjects: ["英文", "數學"] as string[],
    englishLevel: "A2" as "A1" | "A2" | "B1" | "B2" | "C1",
    dailyWordCount: 10,
    reminderTime: "20:00",
    aiReminderFrequency: "normal" as "low" | "normal" | "high",
  });

  async function save() {
    setPending(true);
    setError(null);
    try {
      await apiPatch("/account/settings", form);
      toast.push("success", "學習設定已儲存，Novi 會依此安排你的計畫");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const toggleSubject = (s: string) =>
    setForm((f) => ({
      ...f,
      favoriteSubjects: f.favoriteSubjects.includes(s) ? f.favoriteSubjects.filter((x) => x !== s) : [...f.favoriteSubjects, s].slice(0, 6),
    }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="text-center">
        <div className="flex justify-center">
          <NoviAvatar size={86} state={step === 2 ? "cheer" : "analyze"} />
        </div>
        <h1 className="mt-2 text-xl font-bold">先讓我認識你 ✨</h1>
        <p className="mt-1 text-sm text-muted">這些設定會直接影響每日單字量、AI 建議、模擬考難度與讀書計畫。</p>
        <div className="mt-3 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 w-10 rounded-full ${i <= step ? "bg-gradient-to-r from-[#7c5cff] to-[#37d3ff]" : "bg-white/10"}`} />
          ))}
        </div>
      </Card>

      {step === 0 && (
        <Card title="1／3 學制與年級">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="學制">
              <Select value={form.schoolLevel} onChange={(e) => setForm({ ...form, schoolLevel: e.target.value as "junior" | "senior" })}>
                <option value="junior">國中</option>
                <option value="senior">高中</option>
              </Select>
            </Field>
            <Field label="年級">
              <Select value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>
                <option value={1}>一年級</option>
                <option value={2}>二年級</option>
                <option value={3}>三年級</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setStep(1)}>下一步 →</Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="2／3 學習目標">
          <div className="space-y-3">
            <Field label={`每日學習目標：${form.dailyGoalMinutes} 分鐘`}>
              <input
                type="range"
                min={15}
                max={240}
                step={5}
                value={form.dailyGoalMinutes}
                onChange={(e) => setForm({ ...form, dailyGoalMinutes: Number(e.target.value) })}
                className="w-full accent-[#7c5cff]"
              />
            </Field>
            <Field label="偏好／想加強的科目（最多 6 個）">
              <div className="flex flex-wrap gap-1.5">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={`focus-ring rounded-xl border px-3 py-1.5 text-xs ${
                      form.favoriteSubjects.includes(s) ? "border-[#37d3ff] bg-[#37d3ff]/15 text-[#7dd3fc]" : "border-[var(--line)] text-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              ← 上一步
            </Button>
            <Button onClick={() => setStep(2)}>下一步 →</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="3／3 英文與提醒">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="英文程度">
              <Select value={form.englishLevel} onChange={(e) => setForm({ ...form, englishLevel: e.target.value as typeof form.englishLevel })}>
                <option value="A1">A1 入門</option>
                <option value="A2">A2 基礎（國中）</option>
                <option value="B1">B1 進階（會考／高中）</option>
                <option value="B2">B2 高階（學測）</option>
                <option value="C1">C1 精熟</option>
              </Select>
            </Field>
            <Field label="每日單字量">
              <Input type="number" min={3} max={60} value={form.dailyWordCount} onChange={(e) => setForm({ ...form, dailyWordCount: Number(e.target.value) })} />
            </Field>
            <Field label="提醒時間">
              <Input type="time" value={form.reminderTime} onChange={(e) => setForm({ ...form, reminderTime: e.target.value })} />
            </Field>
            <Field label="AI 主動提醒頻率">
              <Select value={form.aiReminderFrequency} onChange={(e) => setForm({ ...form, aiReminderFrequency: e.target.value as typeof form.aiReminderFrequency })}>
                <option value="low">低（只在重要時）</option>
                <option value="normal">正常</option>
                <option value="high">高（積極提醒）</option>
              </Select>
            </Field>
          </div>
          {error && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← 上一步
            </Button>
            <Button loading={pending} onClick={save}>
              完成設定，開始學習 🚀
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
