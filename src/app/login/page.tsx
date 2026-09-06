"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark, StarField } from "@/components/brand";
import { Button, Field, Input, useToast } from "@/components/ui";
import { ApiRequestError, apiPost, errorMessage } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<{ userId: string; email: string; reason: string; blockedAt: string | null } | null>(null);
  const [appeal, setAppeal] = useState({ contactEmail: "", knowsMistake: "", whyChance: "", correctivePlan: "", additionalEvidence: "" });
  const [appealSent, setAppealSent] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiPost<{ onboarded: boolean; displayName: string }>("/auth/login", { identifier, password });
      toast.push("success", `歡迎回來，${res.displayName}！`);
      router.replace(res.onboarded ? "/dashboard" : "/onboarding");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "AUTH_ACCOUNT_BLOCKED" && err.details && typeof err.details === "object") {
        const details = err.details as { userId?: string; email?: string; reason?: string; blockedAt?: string | null };
        setBlocked({ userId: details.userId ?? "", email: details.email ?? identifier, reason: details.reason ?? "未提供具體原因", blockedAt: details.blockedAt ?? null });
        setAppeal((current) => ({ ...current, contactEmail: details.email ?? current.contactEmail }));
      } else setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8">
      <StarField count={22} />
      <div className="glass anim-pop relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Wordmark size={22} />
          <p className="text-xs text-muted">用 NOVA ID 或 Email 登入你的學習宇宙</p>
        </div>

        {blocked ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4">
              <h1 className="text-lg font-bold text-rose-100">很抱歉，此帳號已被封鎖</h1>
              <p className="mt-2 text-sm leading-7 text-rose-50/80">封鎖原因：{blocked.reason}</p>
              <p className="mt-1 text-xs text-rose-100/60">封鎖日期：{blocked.blockedAt ? new Date(blocked.blockedAt).toLocaleString("zh-TW") : "未記錄"}</p>
            </div>
            {appealSent ? <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm leading-7 text-emerald-100">感謝您的耐心填寫，我們將在 10 日之內給您答覆，敬請留意您的聯絡信箱。<br />申訴編號：{appealSent}</div> : <>
              <p className="text-sm text-muted">如果你認為封鎖有誤或已了解問題，可以提交正式申訴。</p>
              <Field label="聯絡信箱" required><Input type="email" value={appeal.contactEmail} onChange={(e) => setAppeal({ ...appeal, contactEmail: e.target.value })} required /></Field>
              <Field label="你知道自己可能違反了什麼嗎？" required><textarea className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm" value={appeal.knowsMistake} onChange={(e) => setAppeal({ ...appeal, knowsMistake: e.target.value })} required /></Field>
              <Field label="為什麼你覺得應該再給你一次機會？" required><textarea className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm" value={appeal.whyChance} onChange={(e) => setAppeal({ ...appeal, whyChance: e.target.value })} required /></Field>
              <Field label="你會如何修正或避免再次發生？" required><textarea className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm" value={appeal.correctivePlan} onChange={(e) => setAppeal({ ...appeal, correctivePlan: e.target.value })} required /></Field>
              <Field label="補充說明或證明（選填）"><textarea className="min-h-20 w-full rounded-xl border border-[var(--line)] bg-black/20 p-3 text-sm" value={appeal.additionalEvidence} onChange={(e) => setAppeal({ ...appeal, additionalEvidence: e.target.value })} /></Field>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => { setBlocked(null); setError(null); }}>我了解了</Button><Button type="button" loading={pending} onClick={async () => { setPending(true); setError(null); try { const result = await apiPost<{ ticketNo: string }>("/auth/block-appeals", { userId: blocked.userId, identifier, blockedReason: blocked.reason, ...appeal }); setAppealSent(result.ticketNo); } catch (err) { setError(errorMessage(err)); } finally { setPending(false); } }}>我要申訴</Button></div>
            </>}
            {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          </div>
        ) : <form onSubmit={submit} className="space-y-3">
          <Field label="NOVA ID 或 Email" required>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="NV-XXXX-XXXX 或 you@example.com" autoComplete="username" required />
          </Field>
          <Field label="密碼" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </Field>

          {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}

          <Button type="submit" full size="lg" loading={pending}>
            登入
          </Button>
        </form>}

        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <Link href="/reset-password" className="focus-ring rounded underline">
            忘記密碼？
          </Link>
          <Link href="/register" className="focus-ring rounded underline">
            還沒有帳號？免費註冊
          </Link>
        </div>
      </div>
    </div>
  );
}
