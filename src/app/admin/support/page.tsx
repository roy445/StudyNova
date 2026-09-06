"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Issue = {
  id: string;
  ticketNo: string;
  category: string;
  categoryLabel: string;
  severity: string;
  title: string;
  description: string;
  errorCode: string;
  requestId: string;
  pageUrl: string;
  userAgent: string;
  status: string;
  statusLabel: string;
  adminNote: string;
  contactEmail: string;
  attachmentUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: string | null;
  reporterNovaId: string | null;
};

type Appeal = { id: string; ticketNo: string; contactEmail: string; blockedReason: string; knowsMistake: string; whyChance: string; correctivePlan: string; additionalEvidence: string; status: string; adminNote: string; createdAt: string; user: { novaId: string | null; displayName: string | null; status: string | null; blockedAt: string | null } | null };

const STATUS = [
  ["all", "全部"],
  ["open", "待處理"],
  ["in_progress", "處理中"],
  ["resolved", "已解決"],
  ["rejected", "不受理"],
  ["duplicate", "重複"],
];

const SEV_TONE: Record<string, "muted" | "cyan" | "gold" | "rose"> = { low: "muted", normal: "cyan", high: "gold", blocker: "rose" };

export default function AdminSupportPage() {
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const list = useApi<{ issues: Issue[]; counts: Array<{ status: string; c: number }>; topCodes: Array<{ errorCode: string; c: number }> }>(
    `/admin/support/issues?status=${status}`,
    [status],
  );
  const [active, setActive] = useState<Issue | null>(null);
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("in_progress");
  const [nextSeverity, setNextSeverity] = useState("normal");
  const [resetForm, setResetForm] = useState({ email: "", reason: "使用者申請重設密碼", expiresMinutes: "60" });
  const [resetResult, setResetResult] = useState<{ link: string; expiresAt: string; customerMessage: string } | null>(null);
  const appeals = useApi<{ appeals: Appeal[] }>("/admin/account-appeals");
  const [activeAppeal, setActiveAppeal] = useState<Appeal | null>(null);
  const [appealNote, setAppealNote] = useState("");
  const [sendAppealEmail, setSendAppealEmail] = useState(true);
  const [emailForm, setEmailForm] = useState({ to: "", displayName: "", kind: "reactivate", link: "", note: "", expiresText: "" });
  const [emailResult, setEmailResult] = useState<string | null>(null);

  const count = (s: string) => list.data?.counts.find((c) => c.status === s)?.c ?? 0;

  return (
    <div className="space-y-4">
      <Card title="🔐 產生密碼重設連結" subtitle="輸入使用者提出的 Email 與原因，產生一次性限時連結，再由你自行寄出。">
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_120px_auto] sm:items-end">
          <Field label="使用者 Email"><Input type="email" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} placeholder="student@example.com" /></Field>
          <Field label="申請原因"><Input value={resetForm.reason} onChange={(e) => setResetForm({ ...resetForm, reason: e.target.value })} /></Field>
          <Field label="期限（分鐘）"><Input type="number" min={10} max={10080} value={resetForm.expiresMinutes} onChange={(e) => setResetForm({ ...resetForm, expiresMinutes: e.target.value })} /></Field>
          <Button onClick={async () => {
            try {
              const result = await apiPost<{ link: string; expiresAt: string; customerMessage: string }>("/admin/password-reset-links", { email: resetForm.email, reason: resetForm.reason, expiresMinutes: Number(resetForm.expiresMinutes) });
              setResetResult(result);
              toast.push("success", "已產生密碼重設連結");
            } catch (err) { toast.push("error", errorMessage(err)); }
          }}>產生連結</Button>
        </div>
        {resetResult && <div className="mt-3 space-y-2 rounded-xl border border-[#ffc857]/30 bg-[#ffc857]/5 p-3 text-xs">
          <p className="text-[#ffd98a]">有效期限：{new Date(resetResult.expiresAt).toLocaleString("zh-TW")}</p>
          <Input readOnly value={resetResult.link} />
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(resetResult.link)}>複製連結</Button><Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(resetResult.customerMessage)}>複製客服文字</Button></div>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-2 leading-relaxed text-muted">{resetResult.customerMessage}</pre>
        </div>}
      </Card>

      <Card title="✉ StudyNova 帳號通知信" subtitle="使用統一品牌排版寄送重啟、密碼重設、Pro 或獎勵連結。需先設定 RESEND_API_KEY 才會實際寄出。">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="收件 Email"><Input type="email" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} /></Field>
          <Field label="使用者名稱"><Input value={emailForm.displayName} onChange={(e) => setEmailForm({ ...emailForm, displayName: e.target.value })} /></Field>
          <Field label="信件類型"><Select value={emailForm.kind} onChange={(e) => setEmailForm({ ...emailForm, kind: e.target.value })}><option value="reactivate">帳號重新啟動</option><option value="password_reset">密碼重設</option><option value="pro_reward">Pro／獎勵資格</option></Select></Field>
          <Field label="連結"><Input type="url" value={emailForm.link} onChange={(e) => setEmailForm({ ...emailForm, link: e.target.value })} placeholder="https://study-nova-psi.vercel.app/..." /></Field>
        </div>
        <Field label="補充內容（選填）"><Textarea value={emailForm.note} onChange={(e) => setEmailForm({ ...emailForm, note: e.target.value })} className="!min-h-[80px]" /></Field>
        <Button className="mt-3" onClick={async () => { try { const result = await apiPost<{ sent: boolean; reason?: string; subject: string; customerMessage: string }>("/admin/account-emails", emailForm); setEmailResult(result.customerMessage); toast.push("success", result.sent ? "已寄出品牌通知信" : `模板已建立；${result.reason ?? "尚未寄出"}`); } catch (err) { toast.push("error", errorMessage(err)); } }}>產生並寄送信件</Button>
        {emailResult && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-xs leading-6 text-muted">{emailResult}</pre>}
      </Card>

      <Card title="⚖ 封鎖申訴案件" subtitle="查看完整回答、審核解封，並以 StudyNova 正式版型寄送通知信。">
        {appeals.loading && <Skeleton lines={3} />}
        {!appeals.loading && !appeals.data?.appeals.length && <EmptyState icon="⚖" title="目前沒有申訴案件" />}
        <div className="space-y-2">
          {appeals.data?.appeals.map((a) => <div key={a.id} className="glass-soft flex flex-wrap items-center justify-between gap-2 p-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-[#7dd3fc]">{a.ticketNo}</span><Badge tone={a.status === "approved" ? "green" : a.status === "rejected" ? "rose" : "gold"}>{a.status}</Badge></div><p className="mt-1 text-sm">{a.user?.displayName ?? "未知帳號"}・{a.contactEmail}</p><p className="text-[11px] text-muted">{new Date(a.createdAt).toLocaleString("zh-TW")}・原因：{a.blockedReason}</p></div><Button size="sm" variant="ghost" onClick={() => { setActiveAppeal(a); setAppealNote(a.adminNote); }}>查看與審核</Button></div>)}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="待處理" value={count("open")} tone="gold" />
        <Stat label="處理中" value={count("in_progress")} tone="cyan" />
        <Stat label="已解決" value={count("resolved")} />
        <Stat label="不受理" value={count("rejected")} />
        <Stat label="重複回報" value={count("duplicate")} />
      </div>

      {list.data?.topCodes.length ? (
        <Card title="▤ 最常被回報的錯誤代碼" subtitle="可依此優先修復">
          <div className="flex flex-wrap gap-2">
            {list.data.topCodes.map((c) => (
              <span key={c.errorCode} className="rounded-full border border-[#ffc857]/40 bg-[#ffc857]/10 px-3 py-1 font-mono text-xs text-[#ffd98a]">
                {c.errorCode} × {c.c}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Tabs tabs={STATUS.map(([k, l]) => ({ key: k, label: l }))} active={status} onChange={setStatus} />

      <Card title="◇ 問題回報" subtitle="每筆回報都附帶錯誤代碼、追蹤編號與環境資訊">
        {list.loading && <Skeleton lines={5} />}
        {list.error && <ErrorState message={list.error} code={list.errorCode} onRetry={list.reload} />}
        {!list.loading && !list.data?.issues.length && <EmptyState icon="◇" title="這個狀態下沒有回報" />}
        <div className="space-y-2">
          {list.data?.issues.map((i) => (
            <div key={i.id} className="glass-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[#7dd3fc]">{i.ticketNo}</span>
                  <Badge tone={SEV_TONE[i.severity] ?? "muted"}>{i.severity}</Badge>
                  <Badge tone="muted">{i.categoryLabel}</Badge>
                  {i.errorCode && <span className="font-mono text-[11px] text-[#ffd98a]">{i.errorCode}</span>}
                </div>
                <Badge tone={i.status === "resolved" ? "green" : i.status === "open" ? "gold" : "cyan"}>{i.statusLabel}</Badge>
              </div>
              <p className="mt-1 text-sm font-medium">{i.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{i.description}</p>
              <p className="mt-1 text-[11px] text-muted">
                {i.reporter ? `${i.reporter}（${i.reporterNovaId}）` : i.contactEmail || "匿名"}・{new Date(i.createdAt).toLocaleString("zh-TW")}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setActive(i);
                  setNote(i.adminNote);
                  setNextStatus(i.status === "open" ? "in_progress" : i.status);
                  setNextSeverity(i.severity);
                }}
              >
                處理
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active ? `處理 ${active.ticketNo}` : ""} wide>
        {active && (
          <div className="space-y-3">
            <div className="glass-soft space-y-1 p-3 text-xs">
              <p className="text-sm font-medium">{active.title}</p>
              <p className="whitespace-pre-wrap text-muted">{active.description}</p>
              <div className="mt-2 grid gap-1 text-[11px] text-muted sm:grid-cols-2">
                <p>錯誤代碼：{active.errorCode || "—"}</p>
                <p>追蹤編號：{active.requestId || "—"}</p>
                <p className="truncate">頁面：{active.pageUrl || "—"}</p>
                <p className="truncate">UA：{active.userAgent || "—"}</p>
                <p>聯絡：{active.contactEmail || active.reporterNovaId || "—"}</p>
                <p>建立：{new Date(active.createdAt).toLocaleString("zh-TW")}</p>
              </div>
              {active.attachmentUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.attachmentUrl} alt="回報附件" className="mt-2 max-h-72 w-full rounded-lg object-contain" />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="狀態">
                <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                  {STATUS.filter(([k]) => k !== "all").map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="嚴重程度">
                <Select value={nextSeverity} onChange={(e) => setNextSeverity(e.target.value)}>
                  {["low", "normal", "high", "blocker"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="回覆給回報者" hint="狀態變更時會以通知與推播送達">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="!min-h-[110px]" />
            </Field>
            <Button
              full
              onClick={async () => {
                try {
                  await apiPatch(`/admin/support/issues/${active.id}`, { status: nextStatus, severity: nextSeverity, adminNote: note });
                  toast.push("success", "已更新並通知回報者");
                  setActive(null);
                  await list.reload();
                } catch (err) {
                  toast.push("error", errorMessage(err));
                }
              }}
            >
              儲存並通知
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(activeAppeal)} onClose={() => setActiveAppeal(null)} title={activeAppeal ? `審核 ${activeAppeal.ticketNo}` : ""} wide>
        {activeAppeal && <div className="space-y-3">
          <div className="glass-soft space-y-2 p-3 text-sm leading-7"><p>封鎖原因：{activeAppeal.blockedReason}</p><p>知道錯在哪裡嗎：{activeAppeal.knowsMistake}</p><p>為什麼應再給一次機會：{activeAppeal.whyChance}</p><p>修正計畫：{activeAppeal.correctivePlan}</p><p>補充：{activeAppeal.additionalEvidence || "—"}</p></div>
          <Field label="管理員備註"><Textarea value={appealNote} onChange={(e) => setAppealNote(e.target.value)} className="!min-h-[110px]" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendAppealEmail} onChange={(e) => setSendAppealEmail(e.target.checked)} />核准解封後寄送正式通知 Email</label>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await apiPatch(`/admin/account-appeals/${activeAppeal.id}`, { status: "rejected", adminNote: appealNote }); toast.push("success", "已標記不受理"); setActiveAppeal(null); await appeals.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>不受理</Button><Button onClick={async () => { try { const result = await apiPatch<{ subject: string; customerMessage: string; email: { sent: boolean; configured: boolean; reason?: string } }>(`/admin/account-appeals/${activeAppeal.id}`, { status: "approved", adminNote: appealNote, sendEmail: sendAppealEmail, baseUrl: window.location.origin }); toast.push("success", result.email.sent ? "已解封並寄出通知信" : `已解封；${result.email.reason ?? "尚未寄信"}`); setActiveAppeal(null); await appeals.reload(); } catch (err) { toast.push("error", errorMessage(err)); } }}>核准解封</Button></div>
        </div>}
      </Modal>
    </div>
  );
}
