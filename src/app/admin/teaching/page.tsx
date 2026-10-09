"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPatch, errorMessage, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, useToast } from "@/components/ui";

type Subject = { id: string; name: string; enabled: boolean; stageId: string | null; sortOrder: number };
type Edition = { id: string; subjectId: string | null; subjectName: string | null; publisher: string; version: string; volume: string; enabled: boolean; ocrStatus: string; updatedAt: string; lessonCount: number; contentCount: number };
type Overview = { subjects: Subject[]; editions: Edition[] };

export default function TeachingAdminPage() {
  const toast = useToast();
  const overview = useApi<Overview>("/admin/teaching/overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const data = overview.data;
  const filteredEditions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return data?.editions ?? [];
    return (data?.editions ?? []).filter((edition) => `${edition.subjectName ?? ""} ${edition.publisher} ${edition.version} ${edition.volume}`.toLocaleLowerCase().includes(keyword));
  }, [data?.editions, query]);

  async function toggle(subject: Subject) {
    setBusy(subject.id);
    try {
      await apiPatch(`/admin/teaching/subjects/${subject.id}`, { enabled: !subject.enabled });
      await overview.reload();
      toast.push("success", `${subject.name} 已${subject.enabled ? "關閉線上課程入口" : "開放線上課程入口"}`);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return <div className="space-y-4">
    <header>
      <p className="text-xs font-semibold tracking-[0.2em] text-[#7dd3fc]">STUDYNOVA · ONLINE TEACHING CONTROL CENTER</p>
      <h1 className="mt-2 text-2xl font-black">線上教學管理</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">這裡管理學生端的線上課程、課次與教學內容。出版社、版本與 PDF／圖片只是課程的來源資料，不是管理主體；每個科目只顯示一次。</p>
    </header>

    {overview.loading && <Card><Skeleton lines={8} /></Card>}
    {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
    {data && <>
      <Card title="科目入口" subtitle="科目名稱已由後端正規化去重；關閉只會隱藏學生端入口，不會刪除線上課程或學習紀錄。">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.subjects.map((subject) => {
            const courses = data.editions.filter((edition) => (edition.subjectName ?? "").trim().normalize("NFKC").toLocaleLowerCase() === subject.name.trim().normalize("NFKC").toLocaleLowerCase());
            const lessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
            const contents = courses.reduce((sum, course) => sum + course.contentCount, 0);
            return <div key={subject.id} className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{subject.name}</p>
                <Badge tone={subject.enabled ? "green" : "muted"}>{subject.enabled ? "學生可見" : "已隱藏"}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">{courses.length} 個課程來源・{lessons} 個課次・{contents} 個教學內容</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" loading={busy === subject.id} variant={subject.enabled ? "outline" : "primary"} onClick={() => void toggle(subject)}>{subject.enabled ? "隱藏科目" : "開放科目"}</Button>
                <Link href={`/admin/content?subjectId=${subject.id}`} className="inline-flex items-center rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/10">管理課程內容</Link>
              </div>
            </div>;
          })}
          {!data.subjects.length && <EmptyState title="目前沒有線上教學科目" hint="請先建立教育科目，再建立線上課程。" />}
        </div>
      </Card>

      <Card title="線上課程清單" subtitle="每一列代表一個可管理的線上課程來源；點擊後可編輯課程資訊、上傳教材、建立課次並匯入教學內容。" action={<Input className="w-full sm:w-64" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋科目、出版社或版本" />}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href="/admin/content" className="inline-flex items-center rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-bold text-slate-950">建立線上課程</Link>
          <Link href="/admin/chemistry" className="inline-flex items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10">化學知識圖譜（獨立工具）</Link>
        </div>
        <div className="space-y-2">
          {filteredEditions.map((edition) => <div key={edition.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="min-w-0"><p className="font-semibold">{edition.subjectName || "未指定科目"}・{edition.publisher}・{edition.version || "未命名課程"}</p><p className="text-xs text-muted">{edition.volume || "未指定冊次"}・{edition.lessonCount} 課次・{edition.contentCount} 個內容・{edition.enabled ? "學生可見" : "已隱藏"}・OCR：{edition.ocrStatus || "未開始"}</p></div>
            <Link href={`/admin/content?editionId=${edition.id}`} className="rounded-xl border border-[#7dd3fc]/30 px-3 py-2 text-xs font-semibold text-[#b9f2ff]">編輯線上課程</Link>
          </div>)}
          {!filteredEditions.length && <EmptyState title="尚無符合的線上課程" hint={query ? "請換一個搜尋關鍵字。" : "先建立一個科目課程，之後再建立課次與教學內容。"} />}
        </div>
      </Card>
    </>}
  </div>;
}
