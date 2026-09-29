"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";
import { apiPost, errorMessage, useApi } from "@/lib/api";
import { MAX_AI_SOLUTION_FILES, uploadAiSolutionFiles } from "@/lib/ai-solution-upload";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];
const MODES = [
  { key: "tutor", label: "引導解題", description: "先給提示與思考方向，再逐步拆解。" },
  { key: "solution", label: "完整解析", description: "提供完整步驟、觀念與答案。" },
  { key: "note", label: "重點整理", description: "整理公式、關鍵概念與易錯點。" },
] as const;

type AnalyzeResult = { reply?: string; hint?: string; steps?: string[]; answer?: string; needsCrop?: boolean; mode?: string; segmentsUsed?: number };

export default function SolvePage() {
  const toast = useToast();
  const router = useRouter();
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number; used?: number; limit?: number; remaining?: number; unlimited?: boolean }> }>("/quotas");
  const [subject, setSubject] = useState("英文");
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("tutor");
  const [question, setQuestion] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ value: number; label: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cost = quotas.data?.quotas.find((item) => item.feature === "ai_solution")?.novaCost ?? null;
  const uploadQuota = quotas.data?.quotas.find((item) => item.feature === "ai_solution_upload");

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
        const uploaded = await uploadAiSolutionFiles(files, {
          subject,
          scope: { includeQuestion: true, includeHandwriting: true, includeNote: true },
          onProgress: setUploadProgress,
        });
        const failed = uploaded.results.filter((item) => !item.context);
        contextIds = uploaded.results.flatMap((item) => (item.context ? [item.context.id] : []));
        if (!contextIds.length) throw new Error(failed.map((item) => `${item.error ?? "檔案分析失敗"}（${item.errorCode ?? "SN-SYS-9901"}）`).join("；") || "沒有可供解題的已辨識檔案。");
        if (failed.length) setError(`有 ${failed.length} 個檔案未完成：${failed.map((item) => `${item.error ?? "檔案分析失敗"}（${item.errorCode ?? "SN-SYS-9901"}）`).join("；")}`);
        setUploadProgress({ value: 100, label: "圖片辨識完成，正在整理解題…" });
        await quotas.reload();
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
      setUploadProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="✦ 解題專區" subtitle="支援各科目題目。你可以輸入文字或上傳題目圖片，讓 Novi 陪你一步一步理解。">
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
          英文圖片 OCR 會在學習中心處理；這裡是跨科解題入口，國文、數學、自然、社會與其他科目都可以使用。若題目不適合圖片分析，也可以直接詢問 Novi。
        </div>
        <NovaCostNotice cost={cost} action="解題專區 AI 分析" className="mt-3" />
        {uploadQuota && <p className="mt-2 text-xs text-muted">今日圖片／PDF：{uploadQuota.unlimited ? "不限量" : `已使用 ${uploadQuota.used ?? 0} / ${uploadQuota.limit ?? 0} 個`}</p>}
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
            <Field label="題目圖片／PDF" hint={`一次最多 ${MAX_AI_SOLUTION_FILES} 個檔案；每檔上限 18 MiB。圖片會直接傳到私有雲端儲存，不經 Vercel Function。`}>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/heic,.pdf" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length > MAX_AI_SOLUTION_FILES) toast.push("info", `一次最多上傳 ${MAX_AI_SOLUTION_FILES} 個檔案，已保留前 ${MAX_AI_SOLUTION_FILES} 個。`); setFiles(selected.slice(0, MAX_AI_SOLUTION_FILES)); }} className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-xs" />
              {files.length > 0 && <p className="mt-1 text-xs text-muted">已選擇 {files.length} 個檔案：{files.map((file) => file.name).join("、")}</p>}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={solve}>開始解題</Button>
              <Button variant="ghost" onClick={() => { setQuestion(""); setFiles([]); setResult(null); setError(null); if (inputRef.current) inputRef.current.value = ""; }}>清除</Button>
              <Button variant="ghost" onClick={() => router.push("/ai")}>直接詢問 Novi</Button>
            </div>
            {uploadProgress && <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/5 px-3 py-2"><div className="mb-1 flex justify-between gap-2 text-xs"><span>{uploadProgress.label}</span><span>{uploadProgress.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-all" style={{ width: `${uploadProgress.value}%` }} /></div></div>}
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
