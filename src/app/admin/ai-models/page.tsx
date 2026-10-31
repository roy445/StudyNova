"use client";

import { useState } from "react";
import { Badge, Button, Card, Select, Skeleton, useToast } from "@/components/ui";
import { apiPatch, errorMessage, useApi } from "@/lib/api";

type Model = { id: string; label: string; kind: string; endpoint: string; chatCompatible: boolean; freePrototype: boolean; enabledByDefault: boolean; officialUrls: string[] };
type Data = { models: Model[]; taskModels: Record<string, string>; endpoint: string; configured: boolean };

const TASK_LABELS: Record<string, string> = { general_chat: "一般聊天", tutoring: "教學與提示", reasoning: "推理／解題", coding: "程式與工具", subject_qa: "學科問答", planning: "規劃與安排", document_analysis: "文件分析", vision: "圖片／影片理解" };

export default function AdminAiModelsPage() {
  const api = useApi<Data>("/admin/ai/models");
  const [busy, setBusy] = useState("");
  const toast = useToast();
  async function save(task: string, modelId: string) {
    setBusy(task);
    try { await apiPatch("/admin/ai/models/routing", { task, modelId }); toast.push("success", `${TASK_LABELS[task] ?? task} 已綁定模型`); await api.reload(); }
    catch (error) { toast.push("error", errorMessage(error)); }
    finally { setBusy(""); }
  }
  const chatModels = api.data?.models.filter((model) => model.chatCompatible) ?? [];
  return <div className="space-y-5 pb-16">
    <header><p className="text-xs font-bold tracking-[.2em] text-[#7dd3fc]">NVIDIA AI MODEL REGISTRY</p><h1 className="mt-1 text-2xl font-black">AI 模型與任務路由</h1><p className="mt-2 max-w-3xl text-sm text-muted">管理 NVIDIA hosted 模型的任務分工。所有設定仍會經過既有 runAi、額度、健康檢查、使用紀錄與 fallback；API Key 永遠不會顯示在前端。</p></header>
    {api.loading && <Card><Skeleton lines={5} /></Card>}
    {api.error && <Card><p className="text-sm text-rose-200">{api.error}</p></Card>}
    {api.data && <>
      <Card title="連線狀態" subtitle="正式 endpoint 與部署設定"><div className="flex flex-wrap items-center gap-3"><Badge tone={api.data.configured ? "green" : "gold"}>{api.data.configured ? "NVIDIA_API_KEY 已設定" : "尚未設定 NVIDIA_API_KEY"}</Badge><code className="rounded bg-black/20 px-2 py-1 text-xs">{api.data.endpoint}</code><span className="text-xs text-muted">Build hosted 免費原型方案受 RPM／帳戶限額限制，非無限制免費。</span></div></Card>
      <Card title="任務模型綁定" subtitle="管理員可切換已核實支援 Chat Completions 的模型；儲存後立即套用至新請求"><div className="grid gap-3 md:grid-cols-2">{Object.entries(api.data.taskModels).map(([task, modelId]) => <div key={task} className="rounded-xl border border-[var(--line)] p-3"><div className="mb-2 flex items-center justify-between gap-2"><b>{TASK_LABELS[task] ?? task}</b><Badge tone="cyan">{task}</Badge></div><Select value={modelId} onChange={(event) => void save(task, event.target.value)} disabled={busy === task}>{chatModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</Select><p className="mt-2 text-xs text-muted">{busy === task ? "儲存中…" : modelId}</p></div>)}</div></Card>
      <Card title="已查核模型 Registry" subtitle="OCR／Parse／Embedding 保留在清單中，但不會誤接到 Chat endpoint"><div className="grid gap-3 lg:grid-cols-2">{api.data.models.map((model) => <div key={model.id} className="rounded-xl border border-[var(--line)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b>{model.label}</b><div className="flex gap-2"><Badge tone={model.chatCompatible ? "green" : "gold"}>{model.kind}</Badge><Badge tone={model.freePrototype ? "cyan" : "rose"}>{model.freePrototype ? "可免費原型" : "需部署"}</Badge></div></div><p className="mt-2 break-all font-mono text-xs text-muted">{model.id}</p><p className="mt-1 text-xs text-muted">官方介面：{model.endpoint}；{model.chatCompatible ? "可進 Chat／Vision 任務路由" : "專用介面，暫不接 Chat 路由"}</p><div className="mt-2 flex flex-wrap gap-2">{model.officialUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">官方來源</a>)}</div></div>)}</div></Card>
    </>}
  </div>;
}
