"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@/components/ui";
import { apiGet, apiPost, errorMessage, useApi } from "@/lib/api";

type Decision = { decision: "approved" | "rejected"; targetEmail: string; expiresAt: string; used: boolean };

function DecisionInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const toast = useToast();
  const me = useApi<{ user: { email: string; displayName: string } | null }>("/auth/me");
  const details = useApi<Decision>(token ? `/tester/decision/${encodeURIComponent(token)}` : null, [token]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const loginUrl = `/login?next=${encodeURIComponent(`/tester/decision?token=${token}`)}`;

  async function activate() {
    setBusy(true);
    try { const result = await apiPost<{ decision: string; activated: boolean }>(`/tester/decision/${encodeURIComponent(token)}/activate`, {}); setDone(true); toast.push("success", result.activated ? "測試員資格已啟用" : "已完成申請結果確認"); } catch (error) { toast.push("error", errorMessage(error)); } finally { setBusy(false); }
  }

  if (!token) return <Card className="mx-auto max-w-lg text-center"><h1 className="text-xl font-black">連結無效</h1><p className="mt-2 text-sm text-muted">請確認你使用的是客服團隊寄出的完整連結。</p></Card>;
  if (details.loading || me.loading) return <Card className="mx-auto max-w-lg text-center"><p className="text-sm text-muted">正在確認測試員資格連結…</p></Card>;
  if (details.error || !details.data) return <Card className="mx-auto max-w-lg text-center"><h1 className="text-xl font-black">連結已失效</h1><p className="mt-2 text-sm text-muted">此連結可能已過期或已使用，請聯絡 StudyNova 客服團隊。</p></Card>;
  if (done) return <Card className="mx-auto max-w-lg text-center"><div className="text-5xl">✓</div><h1 className="mt-3 text-2xl font-black">測試員資格已啟用</h1><p className="mt-2 text-sm leading-7 text-muted">恭喜你！現在可以前往測試員專屬後台體驗 Beta 功能。</p><Link className="mt-5 inline-block text-cyan-200 underline" href="/tester">前往測試員後台</Link></Card>;
  if (details.data.decision === "rejected") return <Card className="mx-auto max-w-lg text-center"><div className="text-5xl">◌</div><h1 className="mt-3 text-2xl font-black">感謝你的申請</h1><p className="mt-3 text-sm leading-7 text-muted">這次申請目前未能通過。仍然感謝你支持 StudyNova，未來有新的測試活動時，歡迎再次申請。</p><p className="mt-3 text-xs text-muted">如有疑問，請聯絡 StudyNova 客服團隊。</p></Card>;

  return <Card className="mx-auto max-w-lg text-center"><div className="text-5xl">✦</div><h1 className="mt-3 text-2xl font-black text-violet-100">恭喜你通過測試員徵選！</h1><p className="mt-3 text-sm leading-7 text-muted">為保護帳號安全，請先重新登入一次，再回到本頁取得測試員資格。</p><p className="mt-2 text-xs text-muted">申請 Email：{details.data.targetEmail}</p>{!me.data?.user ? <Link href={loginUrl}><Button className="mt-5">請重新登入</Button></Link> : me.data.user.email.toLowerCase() !== details.data.targetEmail.toLowerCase() ? <p className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">目前登入的 Email 不符合申請 Email，請登出後使用申請時的帳號登入。</p> : <Button className="mt-5" loading={busy} onClick={() => void activate()}>我已重新登入，取得測試員資格</Button>}</Card>;
}

export default function TesterDecisionPage() { return <main className="min-h-dvh px-4 py-10"><Suspense fallback={<Card className="mx-auto max-w-lg text-center">載入中…</Card>}><DecisionInner /></Suspense></main>; }
