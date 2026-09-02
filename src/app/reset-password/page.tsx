"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { StarField, Wordmark } from "@/components/brand";
import { Button, Field, Input, useToast } from "@/components/ui";
import { apiPost, errorMessage } from "@/lib/api";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiPost<{ message: string; devResetLink?: string }>("/auth/password/forgot", { email });
      setSent(res.message);
      if (res.devResetLink) setDevLink(res.devResetLink);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setPending(true);
    try {
      await apiPost("/auth/password/reset", { token, password });
      toast.push("success", "密碼已更新，請重新登入");
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8">
      <StarField count={20} />
      <div className="glass anim-pop relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Wordmark size={20} />
          <p className="text-xs text-muted">{token ? "設定新密碼" : "輸入 Email 取得重設連結（連結 30 分鐘內有效，只能使用一次）"}</p>
        </div>

        {token ? (
          <form onSubmit={doReset} className="space-y-3">
            <Field label="新密碼" required hint="至少 8 個字元">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </Field>
            <Field label="確認新密碼" required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
            </Field>
            {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
            <Button type="submit" full size="lg" loading={pending}>
              更新密碼
            </Button>
          </form>
        ) : (
          <form onSubmit={requestReset} className="space-y-3">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </Field>
            {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
            {sent && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                <p>{sent}</p>
                {devLink && (
                  <p className="mt-1">
                    尚未設定 SMTP，重設連結：
                    <Link href={devLink} className="ml-1 underline">
                      立即重設密碼
                    </Link>
                  </p>
                )}
              </div>
            )}
            <Button type="submit" full size="lg" loading={pending}>
              寄送重設連結
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="focus-ring rounded underline">
            回到登入
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-muted">載入中…</div>}>
      <ResetInner />
    </Suspense>
  );
}
