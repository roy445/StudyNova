"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { apiPost } from "@/lib/api";

export function ShareActions({ shareId, kind, loggedIn, returnPath }: { shareId: string; kind: string; loggedIn: boolean; returnPath: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function copy(copiedKind: "reference" | "note") {
    if (!loggedIn) return toast.push("info", "登入後即可加入你的學習庫");
    setBusy(true);
    try { await apiPost(`/shares/${shareId}/copy`, { copiedKind }); toast.push("success", copiedKind === "note" ? "已加入我的筆記參考" : "已加入我的學習庫參考"); }
    catch (error) { toast.push("error", error instanceof Error ? error.message : "加入失敗"); }
    finally { setBusy(false); }
  }

  async function importVocabulary() {
    if (!loggedIn) return toast.push("info", "請先登入 StudyNova，再回到這個分享頁加入單字");
    setBusy(true);
    try {
      const result = await apiPost<{ added: number; duplicates: number }>(`/shares/${shareId}/copy`, { copiedKind: "reference" });
      if (result.added > 0) toast.push("success", `已加入 ${result.added} 個單字${result.duplicates ? `，略過 ${result.duplicates} 個重複詞條` : ""}`);
      else toast.push("info", `單字庫已有這些詞條（重複 ${result.duplicates} 個）`);
    } catch (error) { toast.push("error", error instanceof Error ? error.message : "加入單字失敗"); }
    finally { setBusy(false); }
  }

  if (kind === "vocabulary") {
    return <div className="mt-4 flex flex-wrap justify-center gap-2">{loggedIn ? <Button size="sm" loading={busy} onClick={() => void importVocabulary()}>加入我的單字庫</Button> : <Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="focus-ring inline-flex min-h-9 items-center rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[#b9f2ff]">登入後加入我的單字庫</Link>}</div>;
  }

  return <div className="mt-4 flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" loading={busy} onClick={() => void copy("reference")}>加入學習庫</Button><Button size="sm" loading={busy} onClick={() => void copy("note")}>複製成筆記參考</Button></div>;
}
