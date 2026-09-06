"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Select, Stat } from "@/components/ui";

const DATASETS = [
  { key: "notes", label: "我的專屬筆記", group: "學習資料" },
  { key: "vocabulary", label: "單字", group: "學習資料" },
  { key: "wrong", label: "錯題本", group: "測驗資料" },
  { key: "studyMaterials", label: "AI 整理與學習資料", group: "學習資料" },
  { key: "plans", label: "學習計畫", group: "學習紀錄" },
  { key: "studyRecords", label: "每日學習紀錄", group: "學習紀錄" },
  { key: "focus", label: "專注計時", group: "學習紀錄" },
  { key: "tasks", label: "任務紀錄", group: "學習紀錄" },
  { key: "dailyTasks", label: "每日任務", group: "學習紀錄" },
  { key: "achievements", label: "成就與徽章", group: "學習紀錄" },
  { key: "nova", label: "Nova 交易紀錄", group: "帳務紀錄" },
  { key: "xp", label: "XP 紀錄", group: "帳務紀錄" },
];

const FORMATS = [
  { key: "json", label: "JSON", cost: 100 },
  { key: "csv", label: "CSV（表格）", cost: 200 },
  { key: "xlsx", label: "XLSX（Excel）", cost: 500 },
  { key: "txt", label: "TXT（純文字）", cost: 100 },
  { key: "md", label: "Markdown", cost: 100 },
  { key: "pdf", label: "PDF（學習報告）", cost: 800 },
  { key: "docx", label: "DOCX（Word）", cost: 600 },
  { key: "zip", label: "ZIP（完整資料）", cost: 1000 },
];

type Preview = {
  datasets: Array<{ label: string; count: number }>;
  total: number;
  estimatedBytes: number;
  sample: Array<Record<string, unknown>>;
  cost: number;
};

type Artifact = { kind: "text" | "pdf" | "other"; value: string };

export default function ExportPage() {
  const [selected, setSelected] = useState<string[]>(["notes"]);
  const [format, setFormat] = useState("json");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);

  const query = useMemo(
    () => `/api/v1/exports/preview?kind=${encodeURIComponent(selected.join(","))}&format=${format}${from ? `&from=${encodeURIComponent(new Date(from).toISOString())}` : ""}${to ? `&to=${encodeURIComponent(new Date(to).toISOString())}` : ""}`,
    [selected, format, from, to],
  );
  const formatCost = FORMATS.find((item) => item.key === format)?.cost ?? 0;
  const totalCost = preview?.cost ?? formatCost;

  useEffect(() => {
    if (!selected.length) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(query, { credentials: "include" })
        .then((response) => response.json())
        .then((response) => setPreview(response.data))
        .catch(() => setPreview(null))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, selected.length]);

  useEffect(() => {
    if (!selected.length || !preview) {
      const clearTimer = window.setTimeout(() => setArtifact(null), 0);
      return () => window.clearTimeout(clearTimer);
    }
    let active = true;
    let objectUrl = "";
    const timer = window.setTimeout(async () => {
      setArtifact(null);
      setArtifactLoading(true);
      try {
        const response = await fetch(query.replace("/exports/preview?", "/exports/preview-file?"), { credentials: "include" });
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("application/pdf")) {
          objectUrl = URL.createObjectURL(await response.blob());
          if (active) setArtifact({ kind: "pdf", value: objectUrl });
        } else if (type.includes("text/") || type.includes("json")) {
          if (active) setArtifact({ kind: "text", value: await response.text() });
        } else if (active) {
          setArtifact({ kind: "other", value: "此格式已產生成品，正式生成後可下載檔案。" });
        }
      } catch {
        if (active) setArtifact(null);
      } finally {
        if (active) setArtifactLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [query, selected.length, preview]);

  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const downloadUrl = selected.length ? `/api/v1/exports/download?kind=${encodeURIComponent(selected.join(","))}&format=${format}&confirmed=1${from ? `&from=${encodeURIComponent(new Date(from).toISOString())}` : ""}${to ? `&to=${encodeURIComponent(new Date(to).toISOString())}` : ""}` : "#";
  const download = () => {
    if (!preview || loading || !selected.length) return;
    if (!window.confirm(`將生成 ${format.toUpperCase()}，總共扣除 ${totalCost} Nova。確定繼續嗎？`)) return;
    window.location.assign(downloadUrl);
  };

  return (
    <main className="container space-y-5 py-6 sm:py-8">
      <div>
        <p className="text-xs uppercase tracking-[.24em] text-[#37d3ff]">MY DATA</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">我的資料匯出中心</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">先預覽實際資料內容，再選擇格式。正式生成前，總扣點會直接寫在按鈕上。</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card title="選擇資料" subtitle="可複選多種資料，僅能匯出目前登入帳號自己的紀錄">
          <div className="grid gap-2 sm:grid-cols-2">
            {DATASETS.map((item) => <label key={item.key} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition ${selected.includes(item.key) ? "border-[#37d3ff]/60 bg-[#37d3ff]/10" : "border-[var(--line)] bg-white/[0.02]"}`}><input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} className="accent-[#37d3ff]" /><span><strong>{item.label}</strong><small className="mt-0.5 block text-[10px] text-muted">{item.group}</small></span></label>)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="開始日期" hint="留空代表不限"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2" /></Field><Field label="結束日期" hint="留空代表不限"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2" /></Field></div>
        </Card>
        <Card title="格式與生成" subtitle="總扣點集中顯示在生成按鈕，不再重複跳提示">
          <Field label="匯出格式"><Select value={format} onChange={(event) => setFormat(event.target.value)}>{FORMATS.map((item) => <option key={item.key} value={item.key}>{item.label}・{item.cost} Nova</option>)}</Select></Field>
          {preview && <div className="mt-4 grid grid-cols-2 gap-2"><Stat label="資料筆數" value={preview.total} tone="cyan" /><Stat label="預估大小" value={`${(preview.estimatedBytes / 1024).toFixed(1)} KB`} /></div>}
          <div className="mt-4 min-h-12 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 p-3 text-xs leading-5 text-muted">{preview ? `包含 ${preview.datasets.filter((item) => item.count > 0).map((item) => `${item.label} ${item.count} 筆`).join("、") || "目前沒有符合條件的資料"}。` : "選擇資料後會顯示預計筆數與大小。"}</div>
          <Button full variant="gold" onClick={download} disabled={!preview || loading || !selected.length}>生成匯出（總扣 {totalCost} Nova）</Button>
        </Card>
      </div>
      <Card title={`實際成品預覽：${format.toUpperCase()}`} subtitle="這裡顯示依目前選取資料真正產生的格式，不是資料筆數摘要。">
        {artifactLoading && <div className="h-24 animate-pulse rounded-xl bg-white/5" aria-label="預覽準備中" />}
        {!artifactLoading && artifact?.kind === "pdf" && <iframe title="PDF 匯出成品預覽" src={artifact.value} className="h-[680px] w-full rounded-xl border border-[var(--line)] bg-white" />}
        {!artifactLoading && artifact?.kind === "text" && <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-black/30 p-4 text-xs leading-5">{artifact.value}</pre>}
        {!artifactLoading && artifact?.kind === "other" && <div className="rounded-xl border border-[#ffc857]/30 bg-[#ffc857]/10 p-4 text-sm text-[#ffe7ad]">{artifact.value}</div>}
        {!artifactLoading && !artifact && <p className="text-xs text-muted">選擇資料後會顯示實際格式預覽。</p>}
      </Card>
      {preview?.sample?.length ? <Card title="資料內容摘要" subtitle="以下為部分原始資料，方便對照實際成品"><div className="max-h-72 overflow-auto rounded-lg bg-black/20 p-3">{preview.sample.map((row, index) => <pre key={index} className="mb-3 whitespace-pre-wrap border-b border-[var(--line)] pb-2 text-xs last:mb-0 last:border-0">{JSON.stringify(row, null, 2)}</pre>)}</div></Card> : null}
      <Card title="匯出安全說明"><div className="grid gap-2 text-xs leading-5 text-muted sm:grid-cols-3"><p>預覽不扣 Nova；生成按鈕會顯示總扣點。</p><p>不同格式依複雜度收取不同 Nova。</p><p>不會包含 System Prompt、API Key、Token 或內部工具資訊。</p></div></Card>
    </main>
  );
}
