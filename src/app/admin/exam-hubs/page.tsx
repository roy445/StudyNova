"use client";
import { useState } from "react";
import { apiGet, apiPatch, apiPost, useApi } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select, Textarea, useToast } from "@/components/ui";

type Hub = { id: string; name: string; educationLevel: string; schoolName: string; grade: number; examNumber: string; targetScore: number; status: string; openAt: string | null; closeAt: string | null };
type GenerationJob = { id: string; status: string; requirements: Record<string, unknown>; qualitySummary: Record<string, unknown>; createdAt: string };
type PreviewItem = { id: string; status: string; draft: Record<string, unknown>; quality: Record<string, unknown>; analysis: Record<string, unknown> };
type MaterialImport = { id: string; filename: string; mimeType: string; status: string; extractedText: string; materialId: string | null; createdAt: string };

export default function AdminExamHubsPage() {
  const toast = useToast();
  const api = useApi<{ hubs: Hub[] }>("/admin/exam-hubs");
  const [form, setForm] = useState({ name: "", educationLevel: "senior", schoolName: "", grade: 1, examNumber: "第一次段考", targetScore: 60, openAt: "", closeAt: "", status: "draft", announcement: "", showMarquee: false });
  const [words, setWords] = useState("");
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [generation, setGeneration] = useState({ subject: "英文", chapters: "", units: "Unit 1\nUnit 2\nUnit 3", difficulty: "normal", questionTypes: "single", count: 30, useGlobalBank: true, useExisting: true, generateNew: true, useMaterials: false, materialIds: "" });
  const [loading, setLoading] = useState(false);
  const [previewJob, setPreviewJob] = useState<{ id: string; items: PreviewItem[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedMaterialIds, setUploadedMaterialIds] = useState<string[]>([]);
  const [materialImports, setMaterialImports] = useState<Record<string, MaterialImport[]>>({});

  async function create() {
    try { await apiPost("/admin/exam-hubs", { ...form, grade: Number(form.grade), openAt: form.openAt ? new Date(form.openAt).toISOString() : null, closeAt: form.closeAt ? new Date(form.closeAt).toISOString() : null }); toast.push("success", "段考專區已建立"); setForm({ ...form, name: "", announcement: "" }); await api.reload(); } catch (err) { toast.push("error", err instanceof Error ? err.message : "建立失敗"); }
  }
  async function addWords(hubId: string) {
    try { const parsed = JSON.parse(words); await apiPost(`/admin/exam-hubs/${hubId}/words`, { words: Array.isArray(parsed) ? parsed : [parsed] }); toast.push("success", "正式單字已加入"); setWords(""); } catch { toast.push("error", "請確認 JSON 格式與單字欄位"); }
  }
  async function uploadMaterials(hubId: string, files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    setUploading(true);
    try {
      const result = await apiPost<{ uploaded: number }>(`/admin/exam-hubs/${hubId}/materials/upload`, form);
      const current = await apiGet<{ imports: MaterialImport[] }>(`/admin/exam-hubs/${hubId}/material-imports`);
      setMaterialImports((all) => ({ ...all, [hubId]: current.imports }));
      toast.push("success", `已解析 ${result.uploaded} 個檔案，請先檢查預覽後再確認匯入。`);
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "批次上傳失敗"); } finally { setUploading(false); }
  }
  async function confirmMaterialImports(hubId: string) {
    const pending = (materialImports[hubId] ?? []).filter((item) => item.status === "pending");
    if (!pending.length) return;
    try {
      const result = await apiPost<{ imported: number; materialIds: string[] }>(`/admin/exam-hubs/${hubId}/material-imports/confirm`, { importIds: pending.map((item) => item.id) });
      setUploadedMaterialIds((current) => [...current, ...result.materialIds]);
      setGeneration((current) => ({ ...current, useMaterials: true, materialIds: [...current.materialIds.split(",").filter(Boolean), ...result.materialIds].join(",") }));
      const refreshed = await apiGet<{ imports: MaterialImport[] }>(`/admin/exam-hubs/${hubId}/material-imports`);
      setMaterialImports((all) => ({ ...all, [hubId]: refreshed.imports }));
      toast.push("success", `已確認匯入 ${result.imported} 個材料來源。`);
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "確認匯入失敗"); }
  }
  async function openGeneration(hub: Hub) {
    setSelectedHub(hub);
    try { const result = await apiGet<{ jobs: GenerationJob[] }>(`/admin/exam-hubs/${hub.id}/ai-generation-jobs`); setJobs(result.jobs); } catch (err) { toast.push("error", err instanceof Error ? err.message : "無法載入 AI 出題工作"); }
  }
  async function createGeneration() {
    if (!selectedHub) return;
    setLoading(true);
    try {
      const result = await apiPost<{ job: GenerationJob }>(`/admin/exam-hubs/${selectedHub.id}/ai-generation-jobs`, { count: Number(generation.count), requirements: { educationLevel: selectedHub.educationLevel, schoolName: selectedHub.schoolName, grade: selectedHub.grade, subject: generation.subject, examNumber: selectedHub.examNumber, chapters: generation.chapters.split("\n").map((x) => x.trim()).filter(Boolean), units: generation.units.split("\n").map((x) => x.trim()).filter(Boolean), vocabularyRange: [], questionTypes: generation.questionTypes.split(",").map((x) => x.trim()).filter(Boolean), difficulty: generation.difficulty }, sourcePolicy: { useGlobalBank: generation.useGlobalBank, useMaterials: generation.useMaterials, useExisting: generation.useExisting, generateNew: generation.generateNew, materialIds: generation.materialIds.split(",").map((x) => x.trim()).filter(Boolean), questionIds: [] } });
      setJobs((current) => [result.job, ...current]); toast.push("success", "AI 出題工作已建立，正在逐題生成與品質檢查");
    } catch (err) { toast.push("error", err instanceof Error ? err.message : "建立 AI 出題工作失敗"); } finally { setLoading(false); }
  }
  async function inspect(jobId: string) {
    try { const result = await apiGet<{ job: GenerationJob; items: PreviewItem[] }>(`/admin/exam-question-generation/${jobId}`); setPreviewJob({ id: jobId, items: result.items }); } catch (err) { toast.push("error", err instanceof Error ? err.message : "無法載入預覽"); }
  }
  async function saveItem(item: PreviewItem) { try { const result = await apiPatch<{ item: PreviewItem }>(`/admin/exam-question-generation/${previewJob?.id}/items/${item.id}`, { draft: item.draft, status: "approved" }); setPreviewJob((current) => current ? { ...current, items: current.items.map((x) => x.id === item.id ? result.item : x) } : current); toast.push("success", "題目草稿已儲存"); } catch (err) { toast.push("error", err instanceof Error ? err.message : "儲存失敗"); } }
  async function confirmItems() { if (!previewJob) return; try { await apiPost(`/admin/exam-question-generation/${previewJob.id}/confirm`, { itemIds: previewJob.items.filter((item) => ["generated", "approved"].includes(item.status)).map((item) => item.id) }); toast.push("success", "已確認並加入段考專屬題庫"); setPreviewJob(null); } catch (err) { toast.push("error", err instanceof Error ? err.message : "尚有題目未通過審核"); } }

  return <div className="space-y-4"><header><p className="text-xs uppercase tracking-[0.2em] text-[#37d3ff]">Control Center / Exam Hub</p><h1 className="mt-1 text-2xl font-semibold">段考專區管理</h1><p className="text-sm text-muted">總題庫使用 scope=global；段考正式題庫使用 scope=exam:id。AI 只產生草稿，必須經管理員預覽、修改與確認才會正式入庫。</p></header>
    <Card title="建立段考專區"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="段考名稱"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="高一第一次段考" /></Field><Field label="學制"><Select value={form.educationLevel} onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}><option value="junior">國中</option><option value="senior">高中</option></Select></Field><Field label="學校"><Input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></Field><Field label="年級"><Select value={String(form.grade)} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}><option value="1">一年級</option><option value="2">二年級</option><option value="3">三年級</option></Select></Field><Field label="段考次數"><Input value={form.examNumber} onChange={(e) => setForm({ ...form, examNumber: e.target.value })} /></Field><Field label="目標分數（0–100）"><Input type="number" min={0} max={100} value={form.targetScore} onChange={(e) => setForm({ ...form, targetScore: Math.max(0, Math.min(100, Number(e.target.value))) })} /></Field><Field label="狀態"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">草稿</option><option value="published">已開放</option><option value="closed">已關閉</option></Select></Field><Field label="開放時間"><Input type="datetime-local" value={form.openAt} onChange={(e) => setForm({ ...form, openAt: e.target.value })} /></Field><Field label="關閉時間"><Input type="datetime-local" value={form.closeAt} onChange={(e) => setForm({ ...form, closeAt: e.target.value })} /></Field></div><p className="mt-2 text-xs text-muted">目標分數會保存到這個段考專區，學生查看段考資料與成績分析時可依此作為準備目標。</p><Field label="公告內容"><Textarea value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} /></Field><Button className="mt-3" onClick={() => void create()}>建立段考專區</Button></Card>
    <Card title="段考專屬題庫與 AI 出題"><div className="space-y-3">{api.data?.hubs.map((hub) => <div key={hub.id} className="glass-soft rounded-xl p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{hub.name}</p><p className="text-xs text-muted">{hub.schoolName || "不限學校"}・{hub.educationLevel === "senior" ? "高中" : "國中"}{hub.grade}・{hub.examNumber}・目標 {hub.targetScore} 分</p></div><div className="flex items-center gap-2"><Badge tone={hub.status === "published" ? "green" : hub.status === "closed" ? "rose" : "muted"}>{hub.status}</Badge><Button size="sm" onClick={() => void openGeneration(hub)}>AI 出題</Button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Textarea value={words} onChange={(e) => setWords(e.target.value)} placeholder={'正式單字 JSON，例如：[{"word":"abandon","meaning":"放棄"}]'} /><Button onClick={() => void addWords(hub.id)}>加入正式單字</Button></div><div className="mt-3 rounded-xl border border-dashed border-[#37d3ff]/35 bg-[#37d3ff]/5 p-3"><p className="text-sm font-semibold">上傳段考資料來源</p><p className="mt-1 text-xs text-muted">可一次選取最多 100 個檔案。上傳後只會解析並暫存，必須檢查預覽、按下確認匯入，才會成為 AI 可用教材。</p><input className="mt-3 block w-full text-xs" type="file" multiple accept=".pdf,.txt,.md,.csv,image/*" disabled={uploading} onChange={(e) => { void uploadMaterials(hub.id, e.target.files); e.currentTarget.value = ""; }} />{(materialImports[hub.id] ?? []).filter((item) => item.status === "pending").map((item) => <div key={item.id} className="mt-2 rounded-lg border border-white/10 bg-black/10 p-2 text-xs"><p className="font-medium">{item.filename} <span className="text-[#ffc857]">待確認</span></p><p className="mt-1 line-clamp-3 text-muted">{item.extractedText || "未解析出文字，請確認檔案內容。"}</p></div>)}{(materialImports[hub.id] ?? []).some((item) => item.status === "pending") && <Button className="mt-3 memory-card-action" disabled={uploading} onClick={() => void confirmMaterialImports(hub.id)}>確認預覽並匯入教材</Button>}{uploadedMaterialIds.length > 0 && <p className="mt-2 text-xs text-[#8eeaff]">已確認匯入 {uploadedMaterialIds.length} 個材料來源，可在 AI 出題時勾選「使用上傳材料」。</p>}</div></div>)}</div></Card>
    {selectedHub && <Card title={`AI 出題工作：${selectedHub.name}`} subtitle="需求設定 → AI 逐題生成 → 結構／答案／品質檢查 → 管理員預覽與修改 → 確認後才加入 exam:id 題庫"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="科目"><Input value={generation.subject} onChange={(e) => setGeneration({ ...generation, subject: e.target.value })} /></Field><Field label="難度"><Select value={generation.difficulty} onChange={(e) => setGeneration({ ...generation, difficulty: e.target.value })}><option value="easy">基礎</option><option value="normal">中等</option><option value="hard">中偏難</option><option value="advanced">困難</option></Select></Field><Field label="題數"><Input type="number" min={1} max={100} value={generation.count} onChange={(e) => setGeneration({ ...generation, count: Number(e.target.value) })} /></Field><Field label="題型（逗號分隔）"><Input value={generation.questionTypes} onChange={(e) => setGeneration({ ...generation, questionTypes: e.target.value })} /></Field><Field label="章節（每行一項）"><Textarea value={generation.chapters} onChange={(e) => setGeneration({ ...generation, chapters: e.target.value })} /></Field><Field label="單元（每行一項）"><Textarea value={generation.units} onChange={(e) => setGeneration({ ...generation, units: e.target.value })} /></Field></div><div className="mt-3 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={generation.useGlobalBank} onChange={(e) => setGeneration({ ...generation, useGlobalBank: e.target.checked })} /> 使用總題庫</label><label><input type="checkbox" checked={generation.useExisting} onChange={(e) => setGeneration({ ...generation, useExisting: e.target.checked })} /> 使用既有題目</label><label><input type="checkbox" checked={generation.useMaterials} onChange={(e) => setGeneration({ ...generation, useMaterials: e.target.checked })} /> 使用上傳材料</label><label><input type="checkbox" checked={generation.generateNew} onChange={(e) => setGeneration({ ...generation, generateNew: e.target.checked })} /> 產生全新題目</label></div><Button className="mt-3" disabled={loading} onClick={() => void createGeneration()}>{loading ? "建立中…" : "建立 AI 出題工作（不發布）"}</Button><div className="mt-4 space-y-2">{jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-3 text-sm"><span>{new Date(job.createdAt).toLocaleString("zh-TW")}</span><Badge tone={job.status === "confirmed" ? "green" : job.status === "generating" ? "cyan" : "muted"}>{job.status}</Badge><Button size="sm" variant="outline" onClick={() => void inspect(job.id)}>查看逐題預覽／審核</Button></div>)}</div></Card>}
    {previewJob && <Card title="逐題預覽與管理員審核" subtitle="可先修改題幹、選項、答案與解析；ANSWER_CONFLICT 或品質不合格題目不能確認入庫"><div className="space-y-3">{previewJob.items.map((item, index) => <div key={item.id} className="rounded-xl border border-[var(--line)] p-3"><div className="mb-2 flex justify-between text-xs"><span>第 {index + 1} 題</span><Badge tone={item.status === "generated" || item.status === "approved" ? "green" : "rose"}>{item.status}／品質 {String(item.quality.score ?? "-")}</Badge></div><Textarea value={String(item.draft.stem ?? "")} onChange={(e) => setPreviewJob((current) => current ? { ...current, items: current.items.map((x) => x.id === item.id ? { ...x, draft: { ...x.draft, stem: e.target.value } } : x) } : current)} /><Input className="mt-2" value={Array.isArray(item.draft.options) ? item.draft.options.join(" | ") : ""} onChange={(e) => setPreviewJob((current) => current ? { ...current, items: current.items.map((x) => x.id === item.id ? { ...x, draft: { ...x.draft, options: e.target.value.split("|").map((v) => v.trim()).filter(Boolean) } } : x) } : current)} /><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void saveItem(item)}>儲存修改</Button><span className="self-center text-xs text-muted">{Array.isArray(item.draft.answer) ? `答案：${item.draft.answer.join("、")}` : "答案待確認"}</span></div></div>)}<Button onClick={() => void confirmItems()}>管理員確認，正式加入段考專屬題庫</Button></div></Card>}
  </div>;
}
