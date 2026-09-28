"use client";

import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { apiPost } from "@/lib/api";

export function ShareActions({ shareId, loggedIn }: { shareId: string; loggedIn: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function copy(copiedKind: "reference" | "note") {
    if (!loggedIn) return toast.push("info", "登入後即可加入你的學習庫");
    setBusy(true);
    try { await apiPost(`/shares/${shareId}/copy`, { copiedKind }); toast.push("success", copiedKind === "note" ? "已加入我的筆記參考" : "已加入我的學習庫參考"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "加入失敗"); } finally { setBusy(false); }
  }
  return <div className="mt-4 flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" loading={busy} onClick={() => void copy("reference")}>加入學習庫</Button><Button size="sm" loading={busy} onClick={() => void copy("note")}>複製成筆記參考</Button></div>;
}
