"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Textarea, useToast } from "@/components/ui";
import { apiPatch, errorMessage, useApi } from "@/lib/api";
import { formatTaipeiDateTime } from "@/lib/date-time";

type Event = { id: string; channel: string; content: string; category: string; severity: string; reason: string; warningNumber: number; action: string; reviewStatus: string; reviewNote: string; createdAt: string; user: { novaId: string | null; displayName: string | null; email: string | null; status: string | null; contentWarningCount: number } | null };

export default function ModerationAdminPage() {
  const toast = useToast();
  const events = useApi<{ events: Event[] }>("/admin/moderation/events");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function review(event: Event, action: "upheld" | "dismissed") {
    setBusy(event.id);
    try { await apiPatch(`/admin/moderation/events/${event.id}`, { reviewStatus: "reviewed", action, reviewNote: notes[event.id] ?? "" }); toast.push("success", action === "upheld" ? "已確認違規紀錄" : "已標記為誤判／不成立"); await events.reload(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(null); }
  }
  return <div className="space-y-4"><div><p className="text-xs uppercase tracking-[0.2em] text-[#fb7185]">Safety / Moderation</p><h1 className="mt-1 text-2xl font-semibold">內容審查與警告紀錄</h1><p className="text-sm text-muted">查看聊天室與 AI 對話的完整事發內容、判定原因、警告次數與處理結果；使用者申訴請到支援中心審核。</p></div>{events.loading && <Card><p className="text-sm text-muted">載入中…</p></Card>}{events.error && <ErrorState message={events.error} onRetry={events.reload} />}<div className="space-y-3">{events.data?.events.map((event) => <Card key={event.id} title={`${event.user?.displayName ?? "未知使用者"} · 第 ${event.warningNumber} 次警告`} subtitle={`${event.user?.email ?? event.user?.novaId ?? "—"} · ${event.channel} · ${formatTaipeiDateTime(event.createdAt)}`} action={<Badge tone={event.reviewStatus === "reviewed" ? "green" : event.action === "blocked" ? "rose" : "gold"}>{event.reviewStatus === "reviewed" ? "已複核" : event.action === "blocked" ? "已停權" : "待複核"}</Badge>}><div className="space-y-2 text-sm"><p>分類：{event.category}／{event.severity}　判定：{event.reason}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-xs leading-6">{event.content}</pre><p className="text-xs text-muted">帳號目前狀態：{event.user?.status ?? "—"}；累計警告：{event.user?.contentWarningCount ?? event.warningNumber}</p>{event.reviewStatus !== "reviewed" && <div className="flex flex-wrap gap-2"><Textarea className="min-w-64 flex-1 !min-h-16" placeholder="複核備註（選填）" value={notes[event.id] ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [event.id]: e.target.value }))} /><Button size="sm" loading={busy === event.id} onClick={() => void review(event, "upheld")}>確認違規</Button><Button size="sm" variant="ghost" loading={busy === event.id} onClick={() => void review(event, "dismissed")}>標記誤判</Button></div>}</div></Card>)}{!events.loading && !events.data?.events.length && <EmptyState icon="!" title="目前沒有內容審查事件" />}</div></div>;
}
