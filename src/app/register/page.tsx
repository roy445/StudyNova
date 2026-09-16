"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Wordmark, StarField, NoviAvatar } from "@/components/brand";
import { Button, Field, Input, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, shareContent } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ novaId: string; displayName: string } | null>(null);
  const [qr, setQr] = useState<{ svg: string; link: string } | null>(null);
  const [terms, setTerms] = useState<{ version: string; title: string; body: string } | null>(null);
  const [termsReadComplete, setTermsReadComplete] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiGet<{ document: { version: string; title: string; body: string } }>("/support/legal/registration_terms")
      .then((result) => setTerms(result.document))
      .catch(() => setError("目前無法載入註冊條款，請稍後再試。"));
  }, []);

  function onTermsScroll() {
    const element = termsRef.current;
    if (element && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) setTermsReadComplete(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    if (!terms || !termsReadComplete || !termsAccepted) {
      setError("請先閱讀條款至底部，並勾選同意後再建立帳號。");
      return;
    }
    setPending(true);
    try {
      const res = await apiPost<{ novaId: string; displayName: string }>("/auth/register", { email, password, displayName, termsVersion: terms.version, termsReadComplete, termsAccepted });
      setCreated(res);
      toast.push("success", "已建立 StudyNova 帳號");
      try {
        setQr(await apiGet<{ svg: string; link: string }>("/account/nova-id-qr"));
      } catch {
        /* QR is optional */
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8">
        <StarField count={26} />
        <div className="glass anim-pop relative z-10 w-full max-w-md p-6 text-center">
          <div className="flex justify-center">
            <NoviAvatar size={92} state="cheer" />
          </div>
          <h1 className="mt-3 text-xl font-bold">歡迎加入 StudyNova</h1>
          <p className="mt-1 text-sm text-muted">{created.displayName}，你的專屬身分已建立</p>

          <div className="mt-4 rounded-2xl border border-[#37d3ff]/40 bg-[#37d3ff]/10 px-4 py-3">
            <p className="text-[11px] tracking-widest text-muted">你的 NOVA ID</p>
            <p className="text-2xl font-extrabold tracking-[0.14em] text-[#7dd3fc]">{created.novaId}</p>
          </div>

          {qr && (
            <div
              className="mx-auto mt-3 w-32 overflow-hidden rounded-xl bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qr.svg }}
            />
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(created.novaId);
                toast.push("success", "已複製 NOVA ID");
              }}
            >
              複製 ID
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const res = await shareContent({
                  title: "加我 StudyNova 好友",
                  text: `我的 NOVA ID 是 ${created.novaId}，一起用 StudyNova AI 讀書吧！`,
                  url: qr?.link ?? window.location.origin,
                });
                toast.push("success", res === "copied" ? "已複製分享內容" : "已開啟分享");
              }}
            >
              分享
            </Button>
          </div>

          <Button full size="lg" className="mt-3" onClick={() => router.replace("/onboarding")}>
            下一步：設定學習目標 →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8">
      <StarField count={22} />
      <div className="glass anim-pop relative z-10 w-full max-w-md p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Wordmark size={44} />
          <p className="text-xs text-muted">建立帳號後系統會自動產生你的 NOVA ID（不需要 Email 驗證）</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <section className="rounded-2xl border border-[#37d3ff]/25 bg-black/15 p-3 text-left">
            <h2 className="text-sm font-semibold">{terms?.title ?? "註冊條款與使用規範"}</h2>
            <p className="mt-1 text-[11px] text-muted">請完整閱讀條款內容（版本 {terms?.version ?? "載入中"}）。</p>
            <div ref={termsRef} onScroll={onTermsScroll} className="mt-2 max-h-64 whitespace-pre-wrap overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-muted sm:max-h-72">
              {terms?.body ?? "條款載入中…"}
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs">
              <input type="checkbox" disabled={!termsReadComplete} checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 accent-[#7c5cff]" />
              <span className={!termsReadComplete ? "text-muted" : "text-white"}>{termsReadComplete ? "我已閱讀並同意註冊條款與使用規範" : "請先滑動條款閱讀區至底部"}</span>
            </label>
          </section>
          <Field label="顯示名稱" required>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：小星" maxLength={40} required />
          </Field>
          <Field label="Email" required hint="用於忘記密碼時驗證身分">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          </Field>
          <Field label="密碼" required hint="至少 8 個字元">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Field>
          <Field label="確認密碼" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Field>

          {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>}

          <Button type="submit" full size="lg" loading={pending} disabled={!termsReadComplete || !termsAccepted}>
            建立我的 NOVA ID
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          已經有帳號？{" "}
          <Link href="/login" className="focus-ring rounded underline">
            前往登入
          </Link>
        </p>
      </div>
    </div>
  );
}
