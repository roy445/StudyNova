"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Tabs, useToast } from "@/components/ui";
import { apiGet, apiPost, useApi } from "@/lib/api";

type Faq = { id: string; slug: string; category: string; question: string; answer: string; relatedCodes: string[]; helpfulCount: number };
type CodeDef = { code: string; status: number; category: string; message: string; hint: string };

function FaqInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("code") ? "codes" : "faq");
  const [q, setQ] = useState("");
  const [codeQuery, setCodeQuery] = useState(params.get("code") ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ code: string; definition: CodeDef | null; documented: boolean } | null>(null);
  const [searching, setSearching] = useState(false);

  const faq = useApi<{ faq: Faq[]; categories: string[] }>("/support/faq");
  const codes = useApi<{ total: number; categories: string[]; codes: CodeDef[] }>("/support/error-codes");

  const filtered = useMemo(() => {
    const list = faq.data?.faq ?? [];
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter(
      (f) => f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle) || f.relatedCodes.some((c) => c.toLowerCase().includes(needle)),
    );
  }, [faq.data, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Faq[]>();
    filtered.forEach((f) => map.set(f.category, [...(map.get(f.category) ?? []), f]));
    return [...map.entries()];
  }, [filtered]);

  const filteredCodes = useMemo(() => {
    const list = codes.data?.codes ?? [];
    if (!codeQuery.trim()) return list;
    const needle = codeQuery.trim().toLowerCase();
    return list.filter((c) => c.code.toLowerCase().includes(needle) || c.message.includes(codeQuery) || c.hint.includes(codeQuery) || c.category.toLowerCase().includes(needle));
  }, [codes.data, codeQuery]);

  async function doLookup() {
    if (!codeQuery.trim()) return;
    setSearching(true);
    try {
      setLookup(await apiGet(`/support/error-codes?code=${encodeURIComponent(codeQuery.trim())}`));
    } catch {
      toast.push("error", "查詢失敗，請稍後再試");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">常見問題 & 錯誤代碼</h1>
        <p className="text-sm text-muted">找不到答案嗎？每個錯誤都有專屬代碼，輸入代碼就能查到原因與解法。</p>
      </header>

      <Tabs
        tabs={[
          { key: "faq", label: "常見問題", icon: "❓" },
          { key: "codes", label: "錯誤代碼查詢", icon: "🔎" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "faq" && (
        <>
          <Card>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋問題關鍵字，例如：Nova、OCR、小考、SN-AI-6001" />
          </Card>

          {faq.loading && <Card><Skeleton lines={6} /></Card>}
          {faq.error && <ErrorState message={faq.error} onRetry={faq.reload} />}
          {!faq.loading && !filtered.length && <EmptyState icon="🔍" title="找不到相關問題" hint="試試其他關鍵字，或直接回報問題讓我們協助你。" action={<Link href="/support"><Button size="sm">回報問題</Button></Link>} />}

          {grouped.map(([category, items]) => (
            <Card key={category} title={category} subtitle={`${items.length} 個問題`}>
              <div className="space-y-2">
                {items.map((f) => {
                  const isOpen = open === f.slug;
                  return (
                    <div key={f.id} className="glass-soft overflow-hidden">
                      <button
                        onClick={() => setOpen(isOpen ? null : f.slug)}
                        className="focus-ring flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium hover:bg-white/5"
                        aria-expanded={isOpen}
                      >
                        <span className="min-w-0">{f.question}</span>
                        <span className="shrink-0 text-muted">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen && (
                        <div className="anim-in border-t border-[var(--line)] px-3 py-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{f.answer}</p>
                          {f.relatedCodes.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted">相關錯誤代碼：</span>
                              {f.relatedCodes.map((c) => (
                                <button
                                  key={c}
                                  onClick={() => {
                                    setTab("codes");
                                    setCodeQuery(c);
                                    setLookup(null);
                                  }}
                                  className="focus-ring rounded-full border border-[#37d3ff]/40 bg-[#37d3ff]/10 px-2 py-0.5 font-mono text-[11px] text-[#7dd3fc]"
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await apiPost(`/support/faq/${f.slug}/helpful`);
                                  toast.push("success", "感謝你的回饋！");
                                  await faq.reload();
                                } catch {
                                  toast.push("error", "送出失敗");
                                }
                              }}
                            >
                              👍 有幫助（{f.helpfulCount}）
                            </Button>
                            <Link href={`/support?topic=${encodeURIComponent(f.question)}`}>
                              <Button size="sm" variant="ghost">
                                還是沒解決，回報問題
                              </Button>
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === "codes" && (
        <>
          <Card title="🔎 錯誤代碼查詢" subtitle={`目前已文件化 ${codes.data?.total ?? 0} 組代碼。未列出的動態代碼（例如 SN-REQ-A1B2）同樣唯一，可直接附在回報中。`}>
            <div className="flex flex-wrap gap-2">
              <Input
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && doLookup()}
                placeholder="輸入錯誤代碼，例如 SN-AI-6001"
                className="min-w-[220px] flex-1 font-mono"
              />
              <Button loading={searching} onClick={doLookup}>
                查詢
              </Button>
            </div>

            {lookup && (
              <div className="mt-3">
                {lookup.definition ? (
                  <div className="rounded-2xl border border-[#37d3ff]/40 bg-[#37d3ff]/5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold text-[#7dd3fc]">{lookup.definition.code}</span>
                      <Badge tone="muted">HTTP {lookup.definition.status}</Badge>
                      <Badge tone="violet">{lookup.definition.category}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{lookup.definition.message}</p>
                    <p className="mt-1 text-sm text-muted">💡 {lookup.definition.hint}</p>
                    <Link href={`/support?code=${lookup.definition.code}`}>
                      <Button size="sm" variant="ghost" className="mt-3">
                        用這個代碼回報問題
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
                    <p className="font-medium">
                      <span className="font-mono">{lookup.code}</span> 是動態產生的錯誤代碼
                    </p>
                    <p className="mt-1 text-muted">
                      這組代碼仍然唯一且可追蹤，但尚未收錄於說明文件。請直接使用「回報問題」附上這組代碼與追蹤編號，管理員即可在系統日誌中找到該次請求。
                    </p>
                    <Link href={`/support?code=${lookup.code}`}>
                      <Button size="sm" className="mt-3">
                        回報這個問題
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </Card>

          {codes.loading && <Card><Skeleton lines={6} /></Card>}
          <Card title="完整代碼表" subtitle="依類別排序，可直接搜尋">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[620px] text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2">代碼</th>
                    <th className="pb-2">類別</th>
                    <th className="pb-2">HTTP</th>
                    <th className="pb-2">說明</th>
                    <th className="pb-2">處理建議</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((c) => (
                    <tr key={c.code} className="border-t border-[var(--line)] align-top">
                      <td className="py-2 font-mono text-[#7dd3fc]">{c.code}</td>
                      <td className="py-2">{c.category}</td>
                      <td className="py-2 tabular-nums">{c.status}</td>
                      <td className="py-2">{c.message}</td>
                      <td className="py-2 text-muted">{c.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredCodes.length && !codes.loading && <EmptyState icon="🔎" title="沒有符合的代碼" />}
          </Card>
        </>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <FaqInner />
    </Suspense>
  );
}
