"use client";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";

type Hub = { id: string; name: string; educationLevel: string; schoolName: string; grade: number; examNumber: string; announcement: string; openAt: string | null; closeAt: string | null };
export default function ExamHubsPage() {
  const api = useApi<{ hubs: Hub[]; needsProfile: boolean; profileComplete: boolean }>("/exam-hubs/available");
  return <div className="space-y-4"><header><p className="text-xs uppercase tracking-[0.2em] text-[#37d3ff]">StudyNova / Exam Hub</p><h1 className="mt-1 text-2xl font-bold">段考專區</h1><p className="mt-1 text-sm text-muted">依你的學制、學校與年級顯示目前開放的段考內容。</p></header>{api.loading && <Card><Skeleton lines={5} /></Card>}{api.error && <ErrorState message={api.error} onRetry={api.reload} />}{api.data?.needsProfile && <Card title="段考日期天數不一樣嗎？"><p className="text-sm text-muted">請先補上學校、學制與年級，StudyNova 才能顯示符合你的段考專區與倒數。</p><Link href="/profile" className="mt-3 inline-block rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-semibold text-slate-950">前往填寫資料</Link></Card>}{api.data && !api.data.hubs.length && <EmptyState icon="⌁" title="目前沒有開放的段考專區" hint="管理員開放符合你的學校、學制與年級後，這裡會自動顯示。" />}{api.data?.hubs.map((hub) => <Link key={hub.id} href={`/exam-hubs/${hub.id}`} className="block"><Card title={hub.name} subtitle={`${hub.schoolName || "不限學校"}・${hub.educationLevel === "senior" ? "高中" : "國中"}${hub.grade}・${hub.examNumber}`}><div className="flex flex-wrap items-center gap-2"><Badge tone="green">已開放</Badge>{hub.closeAt && <span className="text-xs text-muted">開放至 {new Date(hub.closeAt).toLocaleString("zh-TW")}</span>}</div>{hub.announcement && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{hub.announcement}</p>}<p className="mt-3 text-sm font-semibold text-[#7dd3fc]">查看本次段考單字 →</p></Card></Link>)}</div>;
}
