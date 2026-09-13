"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Policy = { id: string; schoolName: string; educationLevel: string; grade: number; term: string; examName: string; examDate: string; enabled: boolean };
const EMPTY = { schoolName: "", educationLevel: "junior", grade: "1", term: "第一次段考", examName: "第一次段考", examDate: "", enabled: true };

export default function ExamCountdownsAdminPage() {
  const toast = useToast();
  const policies = useApi<{ policies: Policy[] }>("/admin/exam-date-policies");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!form.examDate || !form.term || !form.examName) return toast.push("error", "請填寫學期、考試名稱與日期");
    setBusy(true);
    try { await apiPost("/admin/exam-date-policies", { ...form, grade: Number(form.grade) }); toast.push("success", "段考倒數規則已儲存"); setForm(EMPTY); await policies.reload(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  return <div className="space-y-4"><div><p className="text-xs uppercase tracking-[0.2em] text-[#37d3ff]">Control Center / Exam Countdown</p><h1 className="mt-1 text-2xl font-semibold">段考倒數</h1><p className="text-sm text-muted">可設定全部學校或指定學校，並分別套用國中／高中與一年級至三年級的段考日期。</p></div><Card title="新增／更新段考日期規則"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="學校（留空＝全部學校）"><Input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="例如：○○高中" /></Field><Field label="學制"><Select value={form.educationLevel} onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}><option value="junior">國中</option><option value="senior">高中</option></Select></Field><Field label="年級"><Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}><option value="1">一年級</option><option value="2">二年級</option><option value="3">三年級</option></Select></Field><Field label="學期／場次"><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="第一次段考" /></Field><Field label="考試名稱"><Input value={form.examName} onChange={(e) => setForm({ ...form, examName: e.target.value })} /></Field><Field label="段考日期"><Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} /></Field></div><Button className="mt-3" loading={busy} onClick={save}>儲存規則</Button></Card><Card title="目前段考倒數規則"><div className="space-y-2">{policies.loading && <p className="text-sm text-muted">載入中…</p>}{policies.error && <ErrorState message={policies.error} onRetry={policies.reload} />}{policies.data?.policies.map((policy) => <div key={policy.id} className="glass-soft flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><p className="font-medium">{policy.examName}・{policy.term}</p><p className="text-xs text-muted">{policy.schoolName || "全部學校"}・{policy.educationLevel === "junior" ? "國中" : "高中"}{policy.grade} 年級・{policy.examDate}</p></div><Badge tone={policy.enabled ? "green" : "muted"}>{policy.enabled ? "啟用" : "停用"}</Badge></div>)}{!policies.loading && !policies.data?.policies.length && <EmptyState icon="⌁" title="尚未設定段考日期" />}</div></Card></div>;
}
