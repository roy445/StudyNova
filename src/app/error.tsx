"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NoviAvatar } from "@/components/brand";
import { Button } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [code, setCode] = useState("SN-UI-9001");

  useEffect(() => {
    // 前端渲染錯誤同樣有專屬代碼：以 digest 或訊息推導出穩定的 4 碼
    const seed = error.digest ?? error.message ?? "unknown";
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    setCode(`SN-UI-${hash.toString(16).slice(0, 4).toUpperCase().padStart(4, "0")}`);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="glass anim-pop w-full max-w-md p-6 text-center">
        <div className="flex justify-center">
          <NoviAvatar size={88} state="error" />
        </div>
        <h1 className="mt-3 text-lg font-bold">頁面發生錯誤</h1>
        <p className="mt-1 text-sm text-muted">別擔心，你的學習資料都安全保存著。可以重試，或把下面的代碼回報給我們。</p>
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 font-mono text-sm text-rose-100">
          錯誤代碼：{code}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>重試</Button>
          <Link href="/dashboard">
            <Button variant="ghost">回到首頁</Button>
          </Link>
          <Link href={`/support?code=${code}`}>
            <Button variant="outline">回報問題</Button>
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted">
          也可以先查看{" "}
          <Link href="/faq" className="underline">
            常見問題
          </Link>
        </p>
      </div>
    </div>
  );
}
