"use client";

import Link from "next/link";
import { FeedbackBoard } from "@/components/tester/FeedbackBoard";

export default function TesterFeedbackAdminPage() {
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.25em] text-violet-200">Beta Operations</p><h1 className="mt-1 text-2xl font-black">測試心得回饋看板</h1><p className="mt-1 text-sm text-muted">管理員可即時查看測試員討論並直接留言回覆。</p></div><Link href="/admin/testers" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold transition hover:border-violet-300/50 hover:bg-violet-300/10">返回測試員控制台</Link></div><FeedbackBoard admin /></div>;
}
