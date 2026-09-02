"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Select, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { apiPatch, errorMessage, useApi } from "@/lib/api";

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

  const count = (s: string) => list.data?.counts.find((c) => c.status === s)?.c ?? 0;

  return (
    <div className="space-y-4">
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
    </div>
  );
}
