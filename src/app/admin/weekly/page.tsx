"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Week = {
  id: string;
  weekCode: string;
  title: string;
  note: string;
  status: string;
  openMode: string;
  openDays: number[];
  openTime: string;
  closeTime: string;
  novaCost: number;
  proOnly: boolean;
  highlightMap: Record<string, string>;
  open: boolean;
  counts: { questions: number; words: number; sentences: number; files: number; results: number };
};

type Detail = {
  week: Week;
  files: Array<{ id: string; fileKind: string; orderIndex: number; ocrStatus: string; ocrText: string; url: string | null }>;
  drafts: Array<{ id: string; payload: Record<string, unknown>; confidence: number; status: string; createdAt: string }>;
  questions: Array<{ id: string; orderIndex: number; stem: string; options: string[]; answer: string[]; explanation: string; aiConfidence: number; needsReview: boolean; published: boolean }>;
  words: Array<{ id: string; word: string; meaning: string; published: boolean }>;
  sentences: Array<{ id: string; en: string; zh: string; published: boolean }>;
  answers: Array<{ id: string; questionNumber: number; answerText: string; confidence: number }>;
};

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function AdminWeeklyPage() {
  const toast = useToast();
  const list = useApi<{ weeks: Week[]; currentWeekCode: string }>("/admin/weekly");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("files");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ weekCode: "", title: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [highlightJson, setHighlightJson] = useState("{}");
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const [draftJson, setDraftJson] = useState("");
  const [analysisScope, setAnalysisScope] = useState<"all" | "vocabulary" | "sentences" | "questions">("all");
  const [detailItem, setDetailItem] = useState<Record<string, unknown> | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<Detail["questions"][number] | null>(null);
  const stats = useApi<{ participants: number; completionRate: number; average: number; highest: number; lowest: number; reciteRate: number; results: Array<{ novaId: string; displayName: string; score: number; correct: number; total: number; recite: boolean }>; commonWrong: Array<{ id: string; order: number; stem: string; wrongCount: number }> }>(
    activeId && tab === "stats" ? `/admin/weekly/${activeId}/stats` : null,
    [activeId, tab],
  );

  async function loadDetail(id: string) {
    setLoading(true);
    try {
      const next = await apiGet<Detail>(`/admin/weekly/${id}`);
      setDetail(next);
      setHighlightJson(JSON.stringify(next.week.highlightMap ?? {}, null, 2));
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeId) void loadDetail(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function uploadFiles(kind: string, files: FileList | null) {
    if (!files?.length || !activeId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("fileKind", kind);
      Array.from(files).forEach((f) => fd.append("files", f));
      await apiPost(`/admin/weekly/${activeId}/files`, fd);
      toast.push("success", `已上傳 ${files.length} 個檔案`);
      await loadDetail(activeId);
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function patchWeek(patch: Record<string, unknown>) {
    if (!activeId) return;
    try {
      await apiPatch(`/admin/weekly/${activeId}`, patch);
      toast.push("success", "已更新週次設定");
      await Promise.all([list.reload(), loadDetail(activeId)]);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="▦ 每週小考管理"
        subtitle={`目前週次代碼：${list.data?.currentWeekCode ?? "-"}・開放時間可自由設定，不寫死星期六`}
        action={
          <Button size="sm" onClick={() => { setCreateOpen(true); setForm({ weekCode: list.data?.currentWeekCode ?? "", title: "", note: "" }); }}>
            ＋ 建立週次
          </Button>
        }
      >
        {list.loading && <Skeleton lines={3} />}
        {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.data?.weeks.map((w) => (
            <button key={w.id} onClick={() => setActiveId(w.id)} className={`glass-soft focus-ring p-3 text-left hover:bg-white/5 ${activeId === w.id ? "border border-[#37d3ff]/60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{w.title}</p>
                <Badge tone={w.status === "published" ? (w.open ? "green" : "cyan") : "muted"}>{w.status === "published" ? (w.open ? "開放中" : "已發布") : w.status}</Badge>
              </div>
              <p className="text-[11px] text-muted">{w.weekCode}</p>
              <p className="mt-1 text-[11px] text-muted">
                題 {w.counts.questions}・單字 {w.counts.words}・句 {w.counts.sentences}・檔 {w.counts.files}・作答 {w.counts.results}
              </p>
            </button>
          ))}
          {!list.loading && !list.data?.weeks.length && <EmptyState icon="▤" title="尚未建立任何週次" />}
        </div>
      </Card>

      {loading && <Card><Skeleton lines={5} /></Card>}

      {detail && !loading && (
        <Card title={`${detail.week.title}（${detail.week.weekCode}）`} subtitle={`${detail.week.note}・封存只會下架，作答與歷史紀錄會保留，可再重新開放。`}>
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!confirm("確定要封存這個每週小考嗎？歷史作答會保留，之後仍可重新開放。")) return;
              try { await apiDelete(`/admin/weekly/${detail.week.id}`); toast.push("success", "已封存每週小考，歷史紀錄保留"); setActiveId(null); setDetail(null); await list.reload(); }
              catch (err) { toast.push("error", errorMessage(err)); }
            }}>封存這個週次</Button>
          </div>
          <Tabs
            tabs={[
              { key: "files", label: "考卷／答案", icon: "▧" },
              { key: "ai", label: "AI 辨識草稿", icon: "✦" },
              { key: "content", label: "題目・單字・句子", icon: "▤" },
              { key: "settings", label: "開放設定", icon: "⌁" },
              { key: "stats", label: "統計", icon: "◒" },
            ]}
            active={tab}
            onChange={setTab}
          />

          <div className="mt-3 space-y-3">
            {tab === "files" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["paper", "上傳本週考卷"],
                    ["answer", "上傳本週答案"],
                    ["word_source", "上傳單字來源"],
                    ["sentence_source", "上傳句子來源"],
                    ["magazine", "上傳雜誌／教材（可同時分析）"],
                    ["extra", "補充檔案"],
                  ].map(([kind, label]) => (
                    <label key={kind} className="focus-ring cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">
                      ↥ {label}
                      <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={(e) => uploadFiles(kind, e.target.files)} />
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {detail.files.map((f) => (
                    <div key={f.id} className="glass-soft p-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <Badge tone={f.fileKind === "answer" ? "gold" : "cyan"}>
                          {f.fileKind} #{f.orderIndex + 1}
                        </Badge>
                        <div className="flex gap-1">
                          <button onClick={async () => { await apiPatch(`/admin/weekly/files/${f.id}`, { orderIndex: Math.max(0, f.orderIndex - 1) }); await loadDetail(detail.week.id); }}>↑</button>
                          <button onClick={async () => { await apiPatch(`/admin/weekly/files/${f.id}`, { orderIndex: f.orderIndex + 1 }); await loadDetail(detail.week.id); }}>↓</button>
                          <button
                            className="text-rose-300"
                            onClick={async () => {
                              if (!confirm("刪除這個檔案？")) return;
                              await apiDelete(`/admin/weekly/files/${f.id}`);
                              await loadDetail(detail.week.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {f.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt={f.fileKind} className="mt-1 w-full rounded-lg" />
                      )}
                      <p className="mt-1 text-[10px] text-muted">OCR：{f.ocrStatus}</p>
                      {f.ocrText && <p className="mt-1 max-h-20 overflow-y-auto scroll-thin text-[10px] text-muted">{f.ocrText.slice(0, 400)}</p>}
                    </div>
                  ))}
                  {!detail.files.length && <EmptyState icon="▧" title="尚未上傳檔案" hint="考卷與答案請分開上傳。" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                  <Select value={analysisScope} onChange={(e) => setAnalysisScope(e.target.value as typeof analysisScope)} className="!w-auto text-xs">
                    <option value="all">分析全部</option><option value="questions">只分析題目</option><option value="vocabulary">只分析單字／片語</option><option value="sentences">只分析句子／句型</option>
                  </Select>
                  <Button
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await apiPost(`/admin/weekly/${detail.week.id}/analyze`, { scope: analysisScope });
                        toast.push("success", `${analysisScope === "vocabulary" ? "單字" : analysisScope === "sentences" ? "句子" : analysisScope === "questions" ? "題目" : "全部內容"}分析完成，已建立草稿（尚未發布）`);
                        await loadDetail(detail.week.id);
                        setTab("ai");
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    ✦ 執行分區 AI OCR + 整理
                  </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                    螢光筆語意：
                    {Object.entries(detail.week.highlightMap).map(([k, v]) => (
                      <Badge key={k} tone="muted">
                        {k}={v}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "ai" && (
              <>
                {!detail.drafts.length && <EmptyState icon="✦" title="尚未有 AI 草稿" hint="上傳考卷後執行 AI OCR。" />}
                {detail.drafts.map((d) => (
                  <div key={d.id} className="glass-soft p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={d.status === "confirmed" ? "green" : d.status === "discarded" ? "muted" : "cyan"}>{d.status}</Badge>
                        <span className="text-xs text-muted">信心 {(d.confidence * 100).toFixed(0)}%</span>
                        {d.confidence < 0.6 && <Badge tone="rose">! AI 不確定，請人工確認</Badge>}
                      </div>
                      <span className="text-[11px] text-muted">{new Date(d.createdAt).toLocaleString("zh-TW")}</span>
                    </div>
                    <pre className="mt-2 max-h-64 overflow-auto scroll-thin whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10px]">{JSON.stringify(d.payload, null, 2)}</pre>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {(["words", "sentences", "questions"] as const).map((kind) => {
                        const values = Array.isArray(d.payload[kind]) ? d.payload[kind] as unknown[] : [];
                        return <div key={kind} className="rounded-xl border border-[var(--line)] p-2"><p className="text-xs font-semibold">{kind === "words" ? "單字／片語" : kind === "sentences" ? "句子／句型" : "題目"}（{values.length}）</p><div className="mt-1 space-y-1">{values.slice(0, 5).map((value, i) => <button key={i} type="button" onClick={() => setDetailItem({ category: kind, index: i, ...(typeof value === "object" && value ? value as Record<string, unknown> : { value }) })} className="block w-full truncate rounded-lg bg-white/5 px-2 py-1 text-left text-[11px] hover:bg-white/10">{typeof value === "object" && value ? String((value as Record<string, unknown>).word ?? (value as Record<string, unknown>).en ?? (value as Record<string, unknown>).stem ?? "詳細項目") : String(value)}</button>)}</div>{values.length > 5 && <p className="mt-1 text-[10px] text-muted">其餘內容可用上方 JSON 查看</p>}</div>;
                      })}
                    </div>
                    {d.status === "draft" && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            const p = d.payload as { questions?: unknown[]; words?: unknown[]; sentences?: unknown[] };
                            setDraftEdit(d.id);
                            setDraftJson(
                              JSON.stringify(
                                {
                                  questions: (p.questions ?? []).map((q, i) => {
                                    const item = q as { stem?: string; options?: string[]; answer?: string[]; explanation?: string; confidence?: number };
                                    return {
                                      orderIndex: i,
                                      stem: item.stem ?? "",
                                      options: item.options ?? [],
                                      answer: item.answer ?? [],
                                      explanation: item.explanation ?? "",
                                      confidence: item.confidence ?? 0.5,
                                    };
                                  }),
                                  words: (p.words ?? []).map((w) => {
                                    const item = w as { word?: string; meaning?: string; example?: string; color?: string };
                                    return { word: item.word ?? "", meaning: item.meaning ?? "", example: item.example ?? "", highlightColor: item.color ?? "pink" };
                                  }),
                                  sentences: (p.sentences ?? []).map((s) => {
                                    const item = s as { en?: string; zh?: string; color?: string };
                                    return { en: item.en ?? "", zh: item.zh ?? "", highlightColor: item.color ?? "blue" };
                                  }),
                                  publish: true,
                                },
                                null,
                                2,
                              ),
                            );
                          }}
                        >
                          檢視並確認發布
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await apiPost(`/admin/weekly/drafts/${d.id}/discard`);
                            toast.push("info", "已捨棄草稿");
                            await loadDetail(detail.week.id);
                          }}
                        >
                          捨棄
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {tab === "content" && (
              <div className="grid gap-3 lg:grid-cols-3">
                <div>
                  <p className="mb-1 text-xs font-medium">題目（{detail.questions.length}）</p>
                  <div className="max-h-80 space-y-1.5 overflow-y-auto scroll-thin">
                    {detail.questions.map((q) => (
                      <div key={q.id} className="glass-soft p-3 text-xs">
                        <p className="font-medium">
                          {q.orderIndex + 1}. {q.stem.slice(0, 80)}
                        </p>
                        <div className="mt-2 space-y-1">{q.options.map((option, i) => <div key={`${q.id}-${i}`} className={`rounded-lg border px-2 py-1 ${q.answer.includes(option) ? "border-emerald-400/50 bg-emerald-400/10" : "border-[var(--line)]"}`}>{String.fromCharCode(65 + i)}. {option}</div>)}</div>
                        <p className="mt-2 text-muted">答案：{q.answer.join("、") || "（未設定）"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {q.needsReview && <Badge tone="rose">⚠️ 待確認</Badge>}
                          <Badge tone={q.published ? "green" : "muted"}>{q.published ? "已發布" : "未發布"}</Badge>
                          <button className="underline" onClick={() => setSelectedQuestion(q)}>詳細</button>
                          <button
                            className="underline"
                            onClick={async () => {
                              const stem = prompt("修改題目", q.stem);
                              if (stem === null) return;
                              const answer = prompt("修改答案（逗號分隔）", q.answer.join(","));
                              await apiPatch(`/admin/weekly/questions/${q.id}`, { stem, answer: (answer ?? "").split(",").map((x) => x.trim()).filter(Boolean), needsReview: false });
                              await loadDetail(detail.week.id);
                            }}
                          >
                            編輯
                          </button>
                          <button
                            className="underline"
                            onClick={async () => {
                              await apiPatch(`/admin/weekly/questions/${q.id}`, { published: !q.published });
                              await loadDetail(detail.week.id);
                            }}
                          >
                            {q.published ? "取消發布" : "發布"}
                          </button>
                          <button
                            className="text-rose-300 underline"
                            onClick={async () => {
                              await apiDelete(`/admin/weekly/questions/${q.id}`);
                              await loadDetail(detail.week.id);
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">單字（{detail.words.length}）</p>
                  <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
                    {detail.words.map((w) => (
                      <div key={w.id} className="glass-soft flex items-center justify-between px-2 py-1.5 text-xs">
                        <span>
                          {w.word}｜{w.meaning}
                        </span>
                        <button
                          className="text-rose-300"
                          onClick={async () => {
                            await apiDelete(`/admin/weekly/items/word/${w.id}`);
                            await loadDetail(detail.week.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={async () => {
                      const word = prompt("單字");
                      if (!word) return;
                      const meaning = prompt("中文意思") ?? "";
                      await apiPost(`/admin/weekly/${detail.week.id}/items`, { kind: "word", word, meaning });
                      await loadDetail(detail.week.id);
                    }}
                  >
                    ＋ 新增單字
                  </Button>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">句子（{detail.sentences.length}）</p>
                  <div className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
                    {detail.sentences.map((s) => (
                      <div key={s.id} className="glass-soft flex items-center justify-between px-2 py-1.5 text-xs">
                        <span className="min-w-0 truncate">{s.en}</span>
                        <button
                          className="text-rose-300"
                          onClick={async () => {
                            await apiDelete(`/admin/weekly/items/sentence/${s.id}`);
                            await loadDetail(detail.week.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={async () => {
                      const en = prompt("英文句子");
                      if (!en) return;
                      const zh = prompt("中文翻譯") ?? "";
                      await apiPost(`/admin/weekly/${detail.week.id}/items`, { kind: "sentence", en, zh });
                      await loadDetail(detail.week.id);
                    }}
                  >
                    ＋ 新增句子
                  </Button>
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="狀態">
                  <Select value={detail.week.status} onChange={(e) => patchWeek({ status: e.target.value })}>
                    <option value="draft">草稿</option>
                    <option value="published">發布</option>
                    <option value="archived">封存</option>
                  </Select>
                </Field>
                <Field label="開放模式">
                  <Select value={detail.week.openMode} onChange={(e) => patchWeek({ openMode: e.target.value })}>
                    <option value="schedule">依星期排程</option>
                    <option value="manual_open">手動開放（指定期間）</option>
                    <option value="manual_close">手動關閉</option>
                  </Select>
                </Field>
                <Field label="開放星期">
                  <div className="flex flex-wrap gap-1">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => {
                          const next = detail.week.openDays.includes(i) ? detail.week.openDays.filter((x) => x !== i) : [...detail.week.openDays, i];
                          patchWeek({ openDays: next });
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-xs ${detail.week.openDays.includes(i) ? "border-[#37d3ff] bg-[#37d3ff]/15" : "border-[var(--line)]"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="開始時間">
                    <Input type="time" defaultValue={detail.week.openTime} onBlur={(e) => patchWeek({ openTime: e.target.value })} />
                  </Field>
                  <Field label="結束時間">
                    <Input type="time" defaultValue={detail.week.closeTime} onBlur={(e) => patchWeek({ closeTime: e.target.value })} />
                  </Field>
                </div>
                <Field label="Nova 入場費">
                  <Input type="number" min={0} defaultValue={detail.week.novaCost} onBlur={(e) => patchWeek({ novaCost: Number(e.target.value) })} />
                </Field>
                <Field label="螢光筆分析" hint="開啟時，圖片有螢光筆就優先分析標記區域；關閉時 AI 不會特別尋找螢光筆。">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Object.keys(detail.week.highlightMap ?? {}).length > 0} onChange={() => { const next = Object.keys(detail.week.highlightMap ?? {}).length > 0 ? {} : { blue: "句子", pink: "單字", yellow: "重要" }; setHighlightJson(JSON.stringify(next, null, 2)); void patchWeek({ highlightMap: next }); }} className="accent-[#37d3ff]" /> 開啟螢光筆優先分析</label>
                </Field>
                <Field label="螢光筆語意（JSON，可彈性自訂）" hint={'例如 {"blue":"句子","pink":"單字"}；若關閉，請儲存 {}。'}>
                  <div>
                    <Textarea value={highlightJson} onChange={(e) => setHighlightJson(e.target.value)} className="min-h-[120px] font-mono text-xs" />
                    <Button size="sm" variant="ghost" className="mt-2" onClick={async () => {
                      try { await patchWeek({ highlightMap: JSON.parse(highlightJson) }); }
                      catch { toast.push("error", "螢光筆語意必須是有效 JSON"); }
                    }}>儲存螢光筆語意</Button>
                  </div>
                </Field>
                <Field label="限定 Nova Pro">
                  <Select value={String(detail.week.proOnly)} onChange={(e) => patchWeek({ proOnly: e.target.value === "true" })}>
                    <option value="false">所有學生</option>
                    <option value="true">僅 Nova Pro</option>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    variant="gold"
                    onClick={async () => {
                      const from = prompt("重新開放起始時間（YYYY-MM-DDTHH:mm）", new Date().toISOString().slice(0, 16));
                      if (!from) return;
                      const until = prompt("結束時間（YYYY-MM-DDTHH:mm）", new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                      if (!until) return;
                      try {
                        await apiPost(`/admin/weekly/${detail.week.id}/reopen`, {
                          openFrom: new Date(from).toISOString(),
                          openUntil: new Date(until).toISOString(),
                          novaCost: detail.week.novaCost,
                          proOnly: detail.week.proOnly,
                        });
                        toast.push("success", "已重新開放此歷史週次");
                        await Promise.all([list.reload(), loadDetail(detail.week.id)]);
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      }
                    }}
                  >
                    重新開放歷史週次
                  </Button>
                </div>
              </div>
            )}

            {tab === "stats" && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="參與人數" value={stats.data?.participants ?? 0} />
                  <Stat label="完成率" value={`${stats.data?.completionRate ?? 0}%`} tone="cyan" />
                  <Stat label="平均分" value={stats.data?.average ?? 0} />
                  <Stat label="最高分" value={stats.data?.highest ?? 0} tone="gold" />
                  <Stat label="最低分" value={stats.data?.lowest ?? 0} />
                  <Stat label="背誦完成率" value={`${stats.data?.reciteRate ?? 0}%`} tone="violet" />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium">學生成績</p>
                    <div className="max-h-72 space-y-1 overflow-y-auto scroll-thin text-xs">
                      {stats.data?.results.map((r) => (
                        <div key={r.novaId} className="glass-soft flex items-center justify-between px-2 py-1.5">
                          <span>
                            {r.displayName}（{r.novaId}）
                          </span>
                          <span className="tabular-nums">
                            {r.score} 分 {r.recite ? "・背誦✓" : ""}
                          </span>
                        </div>
                      ))}
                      {!stats.data?.results.length && <EmptyState icon="◒" title="尚無學生作答" />}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium">最常錯的題目</p>
                    <div className="max-h-72 space-y-1 overflow-y-auto scroll-thin text-xs">
                      {stats.data?.commonWrong.map((c) => (
                        <div key={c.id} className="glass-soft px-2 py-1.5">
                          <span className="text-muted">
                            #{c.order}・錯 {c.wrongCount} 次
                          </span>
                          <p className="truncate">{c.stem}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      <Modal open={Boolean(detailItem)} onClose={() => setDetailItem(null)} title="AI 分析詳細結果" wide>
        {detailItem && <div className="space-y-3"><div className="flex gap-2"><Badge tone="cyan">{String(detailItem.category ?? "分析項目")}</Badge>{detailItem.confidence !== undefined && <Badge tone={Number(detailItem.confidence) < 0.6 ? "rose" : "green"}>信心 {Math.round(Number(detailItem.confidence) * 100)}%</Badge>}</div><pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-xs">{JSON.stringify(detailItem, null, 2)}</pre></div>}
      </Modal>
      <Modal open={Boolean(selectedQuestion)} onClose={() => setSelectedQuestion(null)} title="題目完整解析" wide>
        {selectedQuestion && <div className="space-y-3"><p className="text-base font-semibold">{selectedQuestion.orderIndex + 1}. {selectedQuestion.stem}</p><div className="space-y-1.5">{selectedQuestion.options.map((option, i) => <div key={option} className={`rounded-xl border p-3 text-sm ${selectedQuestion.answer.includes(option) ? "border-emerald-400/60 bg-emerald-400/10" : "border-[var(--line)]"}`}>{String.fromCharCode(65 + i)}. {option}{selectedQuestion.answer.includes(option) && <Badge tone="green">正解</Badge>}</div>)}</div><div className="rounded-xl bg-[#37d3ff]/10 p-3 text-sm"><p className="font-semibold">答案</p><p className="mt-1">{selectedQuestion.answer.join("、") || "未設定"}</p><p className="mt-2 font-semibold">解析</p><p className="mt-1 whitespace-pre-wrap text-muted">{selectedQuestion.explanation || "尚未提供解析"}</p></div><div className="flex gap-2"><Badge tone={selectedQuestion.needsReview ? "rose" : "green"}>{selectedQuestion.needsReview ? "需要人工確認" : "AI 信心足夠"}</Badge><Badge tone={selectedQuestion.published ? "green" : "muted"}>{selectedQuestion.published ? "已發布" : "未發布"}</Badge></div></div>}
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="建立週次">
        <div className="space-y-3">
          <Field label="週次代碼" required hint="格式：2026-W35">
            <Input value={form.weekCode} onChange={(e) => setForm({ ...form, weekCode: e.target.value })} />
          </Field>
          <Field label="標題" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="第 35 週補習小考" />
          </Field>
          <Field label="備註">
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="!min-h-[70px]" />
          </Field>
          <Button
            full
            onClick={async () => {
              try {
                const res = await apiPost<{ week: Week }>("/admin/weekly", form);
                toast.push("success", "週次已建立");
                setCreateOpen(false);
                await list.reload();
                setActiveId(res.week.id);
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(draftEdit)} onClose={() => setDraftEdit(null)} title="人工確認並發布" wide>
        <p className="mb-2 text-xs text-muted">確認 AI 整理的內容。你可以直接修改 JSON，確認後才會發布給學生。</p>
        <Textarea value={draftJson} onChange={(e) => setDraftJson(e.target.value)} className="!min-h-[380px] font-mono text-[11px]" />
        <div className="mt-3 flex gap-2">
          <Button
            onClick={async () => {
              if (!draftEdit) return;
              try {
                const payload = JSON.parse(draftJson);
                const res = await apiPost<{ counts: { questions: number; words: number; sentences: number } }>(`/admin/weekly/drafts/${draftEdit}/confirm`, payload);
                toast.push("success", `已確認並發布：題目 ${res.counts.questions}、單字 ${res.counts.words}、句子 ${res.counts.sentences}`);
                setDraftEdit(null);
                if (activeId) await loadDetail(activeId);
                await list.reload();
              } catch (err) {
                toast.push("error", err instanceof SyntaxError ? "JSON 格式錯誤" : errorMessage(err));
              }
            }}
          >
            確認並發布
          </Button>
          <Button variant="ghost" onClick={() => setDraftEdit(null)}>
            取消
          </Button>
        </div>
      </Modal>
    </div>
  );
}
