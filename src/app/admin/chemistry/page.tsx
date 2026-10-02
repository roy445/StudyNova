"use client";

import { useState } from "react";
import { Badge, Button, Card, Select, Skeleton, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Concept = { id: string; title: string; slug: string; description: string; topicId: string; status: string };
type Graph = { concepts: Concept[]; prerequisites: Array<{ prerequisiteConceptId: string; conceptId: string }>; topics: Array<{ id: string; title: string }> };

export default function ChemistryAdminPage() {
  const toast = useToast();
  const graph = useApi<Graph>("/admin/chemistry/graph");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await apiPost("/admin/chemistry/prerequisites", { prerequisiteConceptId: from, conceptId: to }); await graph.reload(); toast.push("success", "前置關係已保存"); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); } }
  const data = graph.data;
  return <div className="space-y-4"><header><p className="text-xs font-semibold tracking-[0.2em] text-[#7dd3fc]">CHEMISTRY CONTENT STUDIO</p><h1 className="mt-2 text-2xl font-black">🧪 化學教學管理</h1><p className="mt-1 text-sm text-muted">管理官方概念、課程與前置關係。後端會拒絕循環依賴，避免學習路線失效。</p></header><Card title="Knowledge Graph" subtitle="目前第一階段官方內容；學生能力值只從真實診斷與練習產生。">{graph.loading ? <Skeleton lines={6} /> : data ? <div className="space-y-4">{data.topics.map((topic) => <div key={topic.id} className="glass-soft rounded-2xl p-4"><p className="font-bold text-[#b9f2ff]">{topic.title}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.concepts.filter((concept) => concept.topicId === topic.id).map((concept) => <div key={concept.id} className="rounded-xl border border-white/10 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{concept.title}</span><Badge tone="green">{concept.status}</Badge></div><p className="mt-1 text-xs leading-5 text-muted">{concept.description}</p></div>)}</div></div>)}<div className="rounded-2xl border border-[#37d3ff]/25 bg-[#37d3ff]/5 p-4"><p className="font-semibold">新增前置關係</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"><Select value={from} onChange={(event) => setFrom(event.target.value)}><option value="">選擇前置概念</option>{data.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}</Select><span className="self-center text-center text-[#7dd3fc]">→</span><Select value={to} onChange={(event) => setTo(event.target.value)}><option value="">選擇後續概念</option>{data.concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}</Select><Button loading={busy} disabled={!from || !to} onClick={() => void save()}>保存</Button></div></div><div className="text-xs text-muted">已建立 {data.prerequisites.length} 條前置關係。官方內容發布前請先完成題目與解析品質檢查。</div></div> : null}</Card></div>;
}
