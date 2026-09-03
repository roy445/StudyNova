"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, Tabs, Textarea, useToast } from "@/components/ui";
import { NoviAvatar } from "@/components/brand";
import { apiGet, apiSend, errorMessage, useApi } from "@/lib/api";

type Issue = {
  id: string;
  ticketNo: string;
  category: string;
  categoryLabel: string;
  severity: string;
  title: string;
  description: string;
  errorCode: string;
  status: string;
  statusLabel: string;
  adminNote: string;
  createdAt: string;
  resolvedAt: string | null;
};

const CATEGORIES = [
  ["bug", "功能異常 / Bug"],
  ["ai", "AI 回應問題"],
  ["account", "帳號與登入"],
  ["weekly", "每週小考"],
  ["content", "教材／題目內容錯誤"],
  ["membership", "Nova / 會員 / 點數"],
  ["suggestion", "功能建議"],
  ["other", "其他"],
];

const SEVERITIES = [
  ["low", "輕微（不影響使用）"],
  ["normal", "一般"],
  ["high", "嚴重（功能無法使用）"],
  ["blocker", "完全無法使用"],
];

const STATUS_TONE: Record<string, "muted" | "cyan" | "green" | "rose"> = {
  open: "muted",
  in_progress: "cyan",
  resolved: "green",
  rejected: "rose",
  duplicate: "muted",
};

function SupportInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "new");
  const me = useApi<{ user: { displayName: string; novaId: string; email: string } | null }>("/auth/me");
  const mine = useApi<{ issues: Issue[] }>(tab === "mine" && me.data?.user ? "/support/issues" : null, [tab, me.data?.user]);

  const [form, setForm] = useState({
    category: "bug",
    severity: "normal",
    title: params.get("topic") ?? "",
    description: "",
    errorCode: params.get("code") ?? "",
    requestId: "",
    contactEmail: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ ticketNo: string } | null>(null);
  const [track, setTrack] = useState("");
  const [tracked, setTracked] = useState<Issue | null>(null);
  const [codeInfo, setCodeInfo] = useState<{ message: string; hint: string } | null>(null);

  useEffect(() => {
    const code = form.errorCode.trim().toUpperCase();
    if (code.length < 6) {
      setCodeInfo(null);
      return;
    }
    let alive = true;
    apiGet<{ definition: { message: string; hint: string } | null }>(`/support/error-codes?code=${encodeURIComponent(code)}`)
      .then((r) => alive && setCodeInfo(r.definition))
      .catch(() => alive && setCodeInfo(null));
    return () => {
      alive = false;
    };
  }, [form.errorCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("pageUrl", typeof window !== "undefined" ? window.location.href : "");
      if (file) fd.append("attachment", file);
      const res = await apiSend<{ ticketNo: string }>("/support/issues", "POST", fd);
      setCreated(res);
      toast.push("success", `已送出，單號 ${res.ticketNo}`);
      setForm({ category: "bug", severity: "normal", title: "", description: "", errorCode: "", requestId: "", contactEmail: "" });
      setFile(null);
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <div className="flex justify-center">
          <NoviAvatar size={90} state="success" />
        </div>
        <h1 className="mt-3 text-xl font-bold">✅ 我們已收到你的回報</h1>
        <p className="mt-1 text-sm text-muted">管理員會盡快處理，狀態更新時會通知你。</p>
        <div className="mt-4 rounded-2xl border border-[#37d3ff]/40 bg-[#37d3ff]/10 px-4 py-3">
          <p className="text-[11px] tracking-widest text-muted">你的回報單號</p>
          <p className="font-mono text-xl font-bold text-[#7dd3fc]">{created.ticketNo}</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(created.ticketNo);
              toast.push("success", "已複製單號");
            }}
          >
            複製單號
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setTrack(created.ticketNo);
              setCreated(null);
              setTab("track");
            }}
          >
            追蹤進度
          </Button>
          <Button onClick={() => setCreated(null)}>再回報一個問題</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">回報問題</h1>
        <p className="text-sm text-muted">
          遇到 Bug、AI 回答怪怪的、題目內容錯誤或想許願新功能，都可以在這裡告訴我們。先看看{" "}
          <Link href="/faq" className="underline">
            常見問題
          </Link>{" "}
          說不定更快。
        </p>
      </header>

      <Tabs
        tabs={[
          { key: "new", label: "我要回報", icon: "📮" },
          { key: "mine", label: "我的回報", icon: "📋" },
          { key: "track", label: "用單號查詢", icon: "🔎" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "new" && (
        <Card>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="問題分類" required>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="嚴重程度" required>
                <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="標題" required hint="用一句話描述問題，例如「上傳 PDF 教材後一直顯示處理中」">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required minLength={4} />
            </Field>

            <Field label="詳細描述與重現步驟" required hint="請說明：1) 你做了什麼 2) 預期結果 3) 實際結果 4) 使用的裝置／瀏覽器">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="!min-h-[150px]" required minLength={10} maxLength={4000} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="錯誤代碼（選填）" hint="畫面上顯示的 SN-XXX-#### 代碼">
                <Input value={form.errorCode} onChange={(e) => setForm({ ...form, errorCode: e.target.value.toUpperCase() })} placeholder="SN-AI-6001" className="font-mono" />
              </Field>
              <Field label="追蹤編號（選填）" hint="錯誤訊息中的 REQ-XXXXXXXXXX">
                <Input value={form.requestId} onChange={(e) => setForm({ ...form, requestId: e.target.value.toUpperCase() })} placeholder="REQ-XXXXXXXXXX" className="font-mono" />
              </Field>
            </div>

            {codeInfo && (
              <div className="rounded-xl border border-[#37d3ff]/40 bg-[#37d3ff]/10 px-3 py-2 text-xs">
                <p className="font-medium">{codeInfo.message}</p>
                <p className="mt-0.5 text-muted">💡 {codeInfo.hint}</p>
              </div>
            )}

            {!me.data?.user && (
              <Field label="聯絡 Email" required hint="未登入時必填，我們才能回覆你">
                <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="you@example.com" />
              </Field>
            )}

            <Field label="截圖（選填，最大 15MB）">
              <input
                type="file"
                accept="image/*,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-xs"
              />
            </Field>

            <p className="rounded-xl bg-black/25 p-2.5 text-[11px] text-muted">
              送出時會一併記錄你的瀏覽器資訊與目前頁面網址，用於重現問題。我們不會蒐集你的密碼或任何金鑰。詳見{" "}
              <Link href="/privacy" className="underline">
                隱私權政策
              </Link>
              。
            </p>

            <Button type="submit" full size="lg" loading={pending}>
              送出回報
            </Button>
          </form>
        </Card>
      )}

      {tab === "mine" && (
        <Card title="📋 我的回報紀錄">
          {!me.data?.user && (
            <EmptyState
              icon="🔐"
              title="請先登入才能查看回報紀錄"
              hint="未登入送出的回報，可以改用「用單號查詢」。"
              action={
                <Link href="/login">
                  <Button size="sm">前往登入</Button>
                </Link>
              }
            />
          )}
          {mine.loading && <Skeleton lines={4} />}
          <div className="space-y-2">
            {mine.data?.issues.map((i) => (
              <div key={i.id} className="glass-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[#7dd3fc]">{i.ticketNo}</span>
                  <Badge tone={STATUS_TONE[i.status] ?? "muted"}>{i.statusLabel}</Badge>
                </div>
                <p className="mt-1 text-sm font-medium">{i.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{i.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>{i.categoryLabel}</span>
                  {i.errorCode && <span className="font-mono">{i.errorCode}</span>}
                  <span>{new Date(i.createdAt).toLocaleString("zh-TW")}</span>
                </div>
                {i.adminNote && <p className="mt-2 rounded-lg bg-[#7c5cff]/10 p-2 text-xs">管理員回覆：{i.adminNote}</p>}
              </div>
            ))}
            {me.data?.user && !mine.loading && !mine.data?.issues.length && <EmptyState icon="📭" title="你還沒有回報過問題" />}
          </div>
        </Card>
      )}

      {tab === "track" && (
        <Card title="🔎 用單號查詢進度">
          <div className="flex flex-wrap gap-2">
            <Input value={track} onChange={(e) => setTrack(e.target.value.toUpperCase())} placeholder="SN-T-20260902-AB12" className="min-w-[220px] flex-1 font-mono" />
            <Button
              onClick={async () => {
                try {
                  const res = await apiGet<{ issue: Issue }>(`/support/issues/${encodeURIComponent(track.trim())}`);
                  setTracked(res.issue);
                } catch (err) {
                  setTracked(null);
                  toast.push("error", errorMessage(err));
                }
              }}
            >
              查詢
            </Button>
          </div>
          {tracked && (
            <div className="glass-soft mt-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-[#7dd3fc]">{tracked.ticketNo}</span>
                <Badge tone={STATUS_TONE[tracked.status] ?? "muted"}>{tracked.statusLabel}</Badge>
              </div>
              <p className="mt-1 text-sm font-medium">{tracked.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{tracked.description}</p>
              {tracked.adminNote && <p className="mt-2 rounded-lg bg-[#7c5cff]/10 p-2 text-xs">管理員回覆：{tracked.adminNote}</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <SupportInner />
    </Suspense>
  );
}
