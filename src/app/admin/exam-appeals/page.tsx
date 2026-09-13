"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, useToast } from "@/components/ui";
import { apiPatch, errorMessage, useApi } from "@/lib/api";

type Appeal = { id: string; examName: string; subject: string; currentExamDate: string; requestedExamDate: string; reason: string; status: string; adminNote: string; createdAt: string; userId: string };

export default function ExamAppealsAdminPage() {
  const toast = useToast();
  const appeals = useApi<{ appeals: Appeal[] }>("/admin/exam-date-appeals");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try { await apiPatch(`/admin/exam-date-appeals/${id}`, { status, adminNote: notes[id] ?? "" }); toast.push("success", status === "approved" ? "已核准並更新段考日期" : "已駁回異議申請"); await appeals.reload(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(null); }
  }
  return <div className="space-y-4"><div><p className="text-xs uppercase tracking-[0.2em] text-[#37d3ff]">Control Center / Exam Appeals</p><h1 className="mt-1 text-2xl font-semibold">段考日期異議申請</h1><p className="text-sm text-muted">審核通過後會更新學生的倒數日期，所有決定都會寫入 Audit Log。</p></div>{appeals.loading && <Card><p className="text-sm text-muted">載入中…</p></Card>}{appeals.error && <ErrorState message={appeals.error} onRetry={appeals.reload} />}<div className="space-y-3">{appeals.data?.appeals.map((appeal) => <Card key={appeal.id} title={appeal.examName} subtitle={`使用者 ${appeal.userId} · ${new Date(appeal.createdAt).toLocaleString("zh-TW")}`} action={<Badge tone={appeal.status === "pending" ? "gold" : appeal.status === "approved" ? "green" : "rose"}>{appeal.status}</Badge>}><div className="grid gap-2 text-sm sm:grid-cols-2"><p>目前日期：<strong>{appeal.currentExamDate}</strong></p><p>申請日期：<strong className="text-[#7dd3fc]">{appeal.requestedExamDate}</strong></p><p>科目：{appeal.subject || "未指定"}</p><p className="sm:col-span-2">理由：{appeal.reason}</p></div>{appeal.status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><Input className="min-w-64 flex-1" placeholder="管理員備註（選填）" value={notes[appeal.id] ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [appeal.id]: e.target.value }))} /><Button size="sm" loading={busy === appeal.id} onClick={() => void decide(appeal.id, "approved")}>核准並更新日期</Button><Button size="sm" variant="ghost" loading={busy === appeal.id} onClick={() => void decide(appeal.id, "rejected")}>駁回</Button></div>}</Card>)}{!appeals.loading && !appeals.data?.appeals.length && <EmptyState icon="⌁" title="目前沒有異議申請" />}</div></div>;
}
