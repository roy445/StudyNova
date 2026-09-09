"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";
import { apiPost, errorMessage, useApi } from "@/lib/api";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];
const MODES = [
  { key: "tutor", label: "引導解題", description: "先給提示與思考方向，再逐步拆解。" },
  { key: "solution", label: "完整解析", description: "提供完整步驟、觀念與答案。" },
  { key: "note", label: "重點整理", description: "整理公式、關鍵概念與易錯點。" },
] as const;

type AnalyzeResult = { reply?: string; hint?: string; steps?: string[]; answer?: string; needsCrop?: boolean; mode?: string; segmentsUsed?: number };

type UploadResult = { context: { id: string; originalName: string } | null; error?: string; errorCode?: string };

export default function SolvePage() {
  const toast = useToast();
  const router = useRouter();
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number }> }>("/quotas");
  const [subject, setSubject] = useState("英文");
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("tutor");
  const [question, setQuestion] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cost = quotas.data?.quotas.find((item) => item.feature === "ai_solution")?.novaCost ?? null;

  async function solve() {
    if (!question.trim() && !files.length) {
      setError("請輸入題目，或上傳題目圖片／PDF。");
      return;
    }
    if (!confirmNovaSpend("解題專區 AI 分析", cost)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let contextIds: string[] = [];
      if (files.length) {
        const form = new FormData();
        files.slice(0, 8).forEach((file) => form.append("files", file));
        form.append("subject", subject);
        form.append("includeQuestion", "true");
        form.append("includeHandwriting", "true");
        form.append("includeNote", "true");
        const uploaded = await apiPost<{ results: UploadResult[] }>("/ai/solution/upload", form);
        const failed = uploaded.results.filter((item) => !item.context);
        if (failed.length) throw new Error(failed.map((item) => `${item.error ?? "檔案分析失敗"}（${item.errorCode ?? "SN-SYS-9901"}）`).join("；"));
        contextIds = uploaded.results.flatMap((item) => (item.context ? [item.context.id] : []));
      }
      const response = await apiPost<{ result: AnalyzeResult }>("/ai/solution/analyze", {
        contextIds,
        question: question.trim() || undefined,
        mode,
        subject,
        idempotencyKey: `solve:${crypto.randomUUID()}`,
      });
      setResult(response.result);
      toast.push("success", "解題分析完成！可以查看提示、步驟與重點。✨");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="✦ 解題專區" subtitle="支援各科目題目。你可以輸入文字或上傳題目圖片，讓 Novi 陪你一步一步理解。">
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
          英文圖片 OCR 會在學習中心處理；這裡是跨科解題入口，國文、數學、自然、社會與其他科目都可以使用。若題目不適合圖片分析，也可以直接詢問 Novi。
        </div>
        <NovaCostNotice cost={cost} action="解題專區 AI 分析" className="mt-3" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <Field label="科目">
              <Select value={subject} onChange={(event) => setSubject(event.target.value)}>
                {SUBJECTS.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="題目或補充要求" hint="可以貼上完整題目、你的作答與想先理解的地方。">
              <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：請說明這題為什麼要使用二次公式？或貼上題目文字。" rows={7} />
            </Field>
            <Field label="題目圖片／PDF" hint="最多 8 個檔案；請確保題目清楚、沒有重要內容被裁掉。">
              <input ref={inputRef} type="file" accept="image/*,.pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 8))} className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-xs" />
              {files.length > 0 && <p className="mt-1 text-xs text-muted">已選擇 {files.length} 個檔案：{files.map((file) => file.name).join("、")}</p>}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={solve}>開始解題</Button>
              <Button variant="ghost" onClick={() => { setQuestion(""); setFiles([]); setResult(null); setError(null); if (inputRef.current) inputRef.current.value = ""; }}>清除</Button>
              <Button variant="ghost" onClick={() => router.push("/ai")}>直接詢問 Novi</Button>
            </div>
            {error && <div className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">{error}</div>}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#7dd3fc]">解題方式</p>
            {MODES.map((item) => (
              <button key={item.key} type="button" onClick={() => setMode(item.key)} className={`w-full rounded-xl border p-3 text-left transition ${mode === item.key ? "border-cyan-300/60 bg-cyan-300/10" : "border-[var(--line)] bg-white/[0.02] hover:bg-white/5"}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{item.label}</span>{mode === item.key && <Badge tone="cyan">目前</Badge>}</div>
                <p className="mt-1 text-xs text-muted">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {busy && <Card title="Novi 正在分析"><Skeleton lines={5} /></Card>}
      {result && !busy && (
        <Card title="解題結果" subtitle={result.needsCrop ? "偵測到多題內容，建議裁切成單題後再分析。" : `已使用 ${result.segmentsUsed ?? 0} 個圖片內容區塊。`}>
          <div className="space-y-4 text-sm leading-7">
            {result.reply && <div className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3">{result.reply}</div>}
            {result.hint && <section><h2 className="font-semibold text-cyan-200">提示</h2><p className="whitespace-pre-wrap text-muted">{result.hint}</p></section>}
            {result.steps?.length ? <section><h2 className="font-semibold text-cyan-200">解題步驟</h2><ol className="mt-1 list-decimal space-y-1 pl-5">{result.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></section> : null}
            {result.answer && <section className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3"><h2 className="font-semibold text-emerald-200">答案</h2><p className="whitespace-pre-wrap">{result.answer}</p></section>}
          </div>
        </Card>
      )}
    </div>
  );
}

