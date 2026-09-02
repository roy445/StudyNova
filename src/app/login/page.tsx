"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark, StarField } from "@/components/brand";
import { Button, Field, Input, useToast } from "@/components/ui";
import { apiPost, errorMessage } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setError(errorMessage(err));
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

        <form onSubmit={submit} className="space-y-3">
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
        </form>

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
