"use client";
import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { apiPatch, apiPost, useApi } from "@/lib/api";

type SetRow = { id: string; title: string; description: string; examLabel: string; enabled: boolean; published: boolean; itemCount: number; units: Array<{ id: string; title: string; sortOrder: number }> };
type AdminData = { sets: SetRow[] };

export default function AdminExamVocabularyPage() {
  const toast = useToast();
  const data = useApi<AdminData>("/admin/exam-vocabulary");
  const filesRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  const [newSet, setNewSet] = useState({ title: "", description: "", examLabel: "英文段考" });
  const [unitTitle, setUnitTitle] = useState("第一單元");
  const [busy, setBusy] = useState(false);
  const current = data.data?.sets.find((item) => item.id === selected) ?? data.data?.sets[0];
  const create = async () => { if (!newSet.title.trim()) return; try { const result = await apiPost<{ set: SetRow }>("/admin/exam-vocabulary", newSet); setNewSet({ title: "", description: "", examLabel: "英文段考" }); setSelected(result.set.id); await data.reload(); toast.push("success", "段考總單字範圍已建立"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "建立失敗"); } };
  const upload = async () => { const files = filesRef.current?.files; if (!current || !files?.length) return; setBusy(true); try { const form = new FormData(); form.append("unitTitle", unitTitle); Array.from(files).forEach((file) => form.append("files", file)); const result = await apiPost<{ processedFiles: number; accepted: number; skipped: number; errors: string[] }>(`/admin/exam-vocabulary/${current.id}/upload`, form); toast.push("success", `已分析 ${result.processedFiles} 個檔案：新增 ${result.accepted} 字、重複略過 ${result.skipped} 字${result.errors.length ? `；${result.errors.length} 個檔案失敗` : ""}`); if (result.errors.length) console.warn(result.errors); if (filesRef.current) filesRef.current.value = ""; await data.reload(); } catch (error) { toast.push("error", error instanceof Error ? error.message : "OCR 匯入失敗"); } finally { setBusy(false); } };
  const toggle = async (field: "published" | "enabled", value: boolean) => { if (!current) return; try { await apiPatch(`/admin/exam-vocabulary/${current.id}`, { [field]: value }); await data.reload(); toast.push("success", value ? "設定已開啟" : "設定已關閉"); } catch (error) { toast.push("error", error instanceof Error ? error.message : "儲存失敗"); } };
  if (data.loading) return <Skeleton lines={8} />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-5 overflow-hidden">
    <Card title="英文段考總單字管理" subtitle="一次選擇多張單字／片語圖片，AI 會逐檔擷取後寫入單元；學生端可總覽所有單元、練習並下載正式 PDF。"><div className="grid min-w-0 gap-3 sm:grid-cols-3"><Field label="新增段考總範圍"><Input value={newSet.title} onChange={(e) => setNewSet({ ...newSet, title: e.target.value })} placeholder="例如：高一第一次段考" /></Field><Field label="顯示標籤"><Input value={newSet.examLabel} onChange={(e) => setNewSet({ ...newSet, examLabel: e.target.value })} /></Field><div className="flex items-end"><Button full onClick={() => void create()}>建立範圍</Button></div><div className="sm:col-span-3"><Field label="說明"><Textarea value={newSet.description} onChange={(e) => setNewSet({ ...newSet, description: e.target.value })} placeholder="例如：Unit 1–4，第一次段考全範圍" /></Field></div></div></Card>
    {!data.data?.sets.length && <EmptyState title="尚無段考單字範圍" hint="先建立一個段考總範圍，再分單元上傳圖片。" />}
    {!!data.data?.sets.length && <>
      <Card title="段考範圍與開放狀態"><div className="grid gap-2 sm:grid-cols-2">{data.data.sets.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`min-w-0 rounded-xl border p-3 text-left ${current?.id === item.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-[var(--line)]"}`}><div className="flex min-w-0 items-center justify-between gap-2"><span className="truncate font-semibold">{item.title}</span><Badge tone={item.published && item.enabled ? "green" : "muted"}>{item.published && item.enabled ? "學生端已開放" : "草稿／關閉"}</Badge></div><p className="mt-1 text-xs text-muted">{item.units.length} 單元・{item.itemCount} 字</p></button>)}</div></Card>
      {current && <Card title={`管理：${current.title}`} subtitle="圖片 OCR 會保留來源檔名；同一個段考範圍內重複單字會自動略過，不會重複灌入。"><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={current.enabled} onChange={(e) => void toggle("enabled", e.target.checked)} className="accent-cyan-400" />功能啟用</label><label className="flex items-center gap-2"><input type="checkbox" checked={current.published} onChange={(e) => void toggle("published", e.target.checked)} className="accent-cyan-400" />發布到學生端導覽列與首頁</label><span className="text-muted">目前共 {current.itemCount} 字</span></div><div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label="本批圖片歸屬單元"><Input value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} placeholder="例如：Unit 1" /></Field><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => filesRef.current?.click()}>選擇多張圖片</Button><Button onClick={() => void upload()} disabled={busy}>{busy ? "OCR 分析中…" : "開始擷取並匯入"}</Button></div></div><input ref={filesRef} type="file" accept="image/*,.pdf" multiple hidden /><p className="mt-2 text-xs text-muted">建議一次 10–30 張清楚圖片。OCR 會辨識單字、片語、詞性、中文、例句；若檔案失敗會列出錯誤，不影響其他檔案。</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{current.units.map((unit) => <div key={unit.id} className="rounded-xl border border-[var(--line)] bg-white/[.03] p-3 text-sm"><span className="font-semibold">{unit.title}</span><span className="ml-2 text-xs text-muted">可在學生端切換單元</span></div>)}</div><div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-xs leading-6 text-amber-100"><strong>PDF 產出：</strong>學生端會看到「下載 PDF 總覽」，檔案由伺服器正式生成，含 StudyNova Logo、頁首、段考範圍與浮水印，不是瀏覽器列印畫面。</div></Card>}
    </>}
  </div>;
}
