"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark, StarField } from "@/components/brand";
import { Button, Field, Input, useToast } from "@/components/ui";
import { apiPost, errorMessage } from "@/lib/api";

export default function AdminAccessPage() {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await apiPost<{ displayName: string; role: string; redirectTo: string }>("/auth/admin-login", { identifier, password });
      toast.push("success", `管理員登入成功，歡迎 ${result.displayName}`);
      router.replace(result.redirectTo || "/admin");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8">
      <StarField count={18} />
      <main className="glass anim-pop relative z-10 w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <Wordmark size={44} />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-amber-200">Emergency Admin Access</p>
          <h1 className="mt-2 text-2xl font-black text-white">管理員維護入口</h1>
          <p className="mt-2 text-sm leading-6 text-muted">網站維護期間，管理員可從這裡使用現有帳號安全登入後關閉維護模式。</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="管理員 NOVA ID 或 Email" required>
            <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
          </Field>
          <Field label="密碼" required>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </Field>
          {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          <Button type="submit" full size="lg" loading={pending}>登入管理後台</Button>
        </form>
        <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-center text-xs leading-5 text-amber-100/80">此入口不會建立後門帳號或萬用密碼；只有現有管理員角色可以登入。一般學生帳號會被拒絕。</p>
      </main>
    </div>
  );
}
