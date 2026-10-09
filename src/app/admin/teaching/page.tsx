"use client";

import Link from "next/link";
import { useState } from "react";
import { apiPatch, errorMessage, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from "@/components/ui";

type Subject = { id: string; name: string; enabled: boolean; stageId: string | null; sortOrder: number };
type Edition = { id: string; subjectId: string | null; publisher: string; version: string; volume: string; enabled: boolean; ocrStatus: string; updatedAt: string };
type Overview = { subjects: Subject[]; editions: Edition[] };

export default function TeachingAdminPage() {
  const toast = useToast();
  const overview = useApi<Overview>("/admin/teaching/overview");
  const [busy, setBusy] = useState<string | null>(null);
  const data = overview.data;

  async function toggle(subject: Subject) {
    setBusy(subject.id);
    try {
      await apiPatch(`/admin/teaching/subjects/${subject.id}`, { enabled: !subject.enabled });
      await overview.reload();
      toast.push("success", `${subject.name} 已${subject.enabled ? "關閉" : "開放"}`);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return <div className="space-y-4">
    <header>
      <p className="text-xs font-semibold tracking-[0.2em] text-[#7dd3fc]">STUDYNOVA · TEACHING CONTROL CENTER</p>
      <h1 className="mt-2 text-2xl font-black">教學專區總管理</h1>
      <p className="mt-1 text-sm text-muted">集中管理英文、數學、國文、化學、物理、生物、歷史、地理、公民等科目的開放狀態與教材內容。</p>
    </header>

    {overview.loading && <Card><Skeleton lines={8} /></Card>}
    {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
    {data && <>
      <Card title="科目開放控制" subtitle="關閉科目只會停止學生端顯示，不會刪除教材、課程或歷史資料。">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.subjects.map((subject) => {
            const count = data.editions.filter((edition) => edition.subjectId === subject.id).length;
            return <div key={subject.id} className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{subject.name}</p>
                <Badge tone={subject.enabled ? "green" : "muted"}>{subject.enabled ? "開放中" : "已關閉"}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">目前教材版本：{count} 個</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" loading={busy === subject.id} variant={subject.enabled ? "outline" : "primary"} onClick={() => void toggle(subject)}>{subject.enabled ? "關閉科目" : "開放科目"}</Button>
                <Link href={`/admin/content?subjectId=${subject.id}`} className="inline-flex items-center rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/10">管理教材</Link>
              </div>
            </div>;
          })}
          {!data.subjects.length && <EmptyState title="目前沒有教育科目" hint="請先在教育設定建立科目。" />}
        </div>
      </Card>

      <Card title="教材版本與編輯" subtitle="上傳圖片／PDF、執行 OCR、確認匯入並編輯教材內容，全部從同一個後台入口管理。">
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href="/admin/content" className="inline-flex items-center rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-bold text-slate-950">開啟教材內容中心</Link>
          <Link href="/admin/chemistry" className="inline-flex items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10">化學知識圖譜</Link>
        </div>
        <div className="space-y-2">
          {data.editions.map((edition) => {
            const subject = data.subjects.find((item) => item.id === edition.subjectId);
            return <div key={edition.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div><p className="font-semibold">{subject?.name ?? "未指定科目"}・{edition.publisher}・{edition.version || "未命名版本"}</p><p className="text-xs text-muted">{edition.volume || "未指定冊次"}・{edition.enabled ? "教材啟用" : "教材停用"}・OCR：{edition.ocrStatus || "未開始"}</p></div>
              <Link href={`/admin/content?editionId=${edition.id}`} className="rounded-xl border border-[#7dd3fc]/30 px-3 py-2 text-xs font-semibold text-[#b9f2ff]">編輯／上傳教材</Link>
            </div>;
          })}
          {!data.editions.length && <EmptyState title="尚無教材版本" hint="先開啟教材內容中心建立英文或其他科目的教材版本。" />}
        </div>
      </Card>
    </>}
  </div>;
}
