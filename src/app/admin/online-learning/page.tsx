"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPatch, errorMessage, useApi } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton, useToast } from "@/components/ui";

type Subject = { id: string; name: string; enabled: boolean; stageId: string | null; sortOrder: number };
type Course = { id: string; subjectId: string | null; subjectName: string | null; publisher: string; version: string; volume: string; enabled: boolean; ocrStatus: string; updatedAt: string; lessonCount: number; contentCount: number };
type Overview = { subjects: Subject[]; editions: Course[] };
type Tab = "overview" | "courses" | "subjects" | "workflow";

const subjectKey = (name: string) => name.trim().normalize("NFKC").toLocaleLowerCase();
const statusLabel = (course: Course) => course.enabled ? "已上架" : "已下架";

export default function OnlineLearningAdminPage() {
  const toast = useToast();
  const overview = useApi<Overview>("/admin/teaching/overview");
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const data = overview.data;
  const courses = data?.editions ?? [];
  const filteredCourses = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return courses.filter((course) => {
      const textMatch = !keyword || `${course.subjectName ?? ""} ${course.publisher} ${course.version} ${course.volume}`.toLocaleLowerCase().includes(keyword);
      const statusMatch = status === "all" || (status === "published" ? course.enabled : !course.enabled);
      return textMatch && statusMatch;
    });
  }, [courses, query, status]);
  const totalLessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
  const totalContents = courses.reduce((sum, course) => sum + course.contentCount, 0);
  const publishedCourses = courses.filter((course) => course.enabled).length;
  const analyzedCourses = courses.filter((course) => course.ocrStatus === "ready").length;

  async function toggleSubject(subject: Subject) {
    setBusy(subject.id);
    try {
      await apiPatch(`/admin/teaching/subjects/${subject.id}`, { enabled: !subject.enabled });
      await overview.reload();
      toast.push("success", `${subject.name} 已${subject.enabled ? "下架學生端入口" : "上架學生端入口"}`);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const tabs: Array<[Tab, string]> = [["overview", "總覽"], ["courses", "課程管理"], ["subjects", "科目入口"], ["workflow", "內容工作流"]];
  return <div className="space-y-4">
    <header className="rounded-3xl border border-[#37d3ff]/20 bg-gradient-to-br from-[#102b4b] via-[#111a35] to-[#25133c] p-5 shadow-[0_20px_60px_rgba(20,100,180,0.15)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.2em] text-[#7dd3fc]">STUDYNOVA · ONLINE LEARNING OPERATIONS</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">線上學習管理後台</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">集中管理學生端的線上課程、科目入口、課次、教材內容、OCR 分析與上架流程。這裡不再把「化學管理」或「教材版本」當作主入口，而是用課程學習體驗來管理。</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/admin/content" className="rounded-xl bg-[#37d3ff] px-4 py-2 text-sm font-bold text-slate-950">建立課程</Link><Link href="/dashboard" className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">查看學生端</Link></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === key ? "bg-white text-slate-950" : "border border-white/15 bg-white/5 text-white/75 hover:bg-white/10"}`}>{label}</button>)}</div>
    </header>

    {overview.loading && <Card><Skeleton lines={8} /></Card>}
    {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}
    {data && <>
      {tab === "overview" && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="科目入口" value={data.subjects.length} detail="已去重" tone="cyan" /><Metric title="線上課程" value={courses.length} detail={`${publishedCourses} 個學生可見`} tone="violet" /><Metric title="課次" value={totalLessons} detail="可逐課學習" tone="gold" /><Metric title="教學內容" value={totalContents} detail={`${analyzedCourses} 個課程已完成 OCR`} tone="green" /></div>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card title="快速工作台" subtitle="依照實際管理情境快速進入，不必先找資料表。"><div className="grid gap-2 sm:grid-cols-2">{[["/admin/content", "建立／編輯線上課程", "設定科目、課程名稱、來源與說明"], ["/admin/question-banks", "管理練習題庫", "把課程內容轉成可練習題目"], ["/admin/ai-jobs", "查看 AI 分析工作", "追蹤 OCR、分析與失敗重試"], ["/admin/exam-hubs", "連結段考專區", "把課程範圍轉成段考練習"]].map(([href, title, detail]) => <Link key={href} href={href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-[#37d3ff]/50 hover:bg-[#37d3ff]/5"><p className="font-semibold text-[#b9f2ff]">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></Link>)}</div></Card>
          <Card title="目前需要注意" subtitle="用來快速找出尚未完成的線上課程。"><div className="space-y-2 text-sm">{courses.filter((course) => !course.subjectName || course.ocrStatus === "failed").slice(0, 5).map((course) => <Link key={course.id} href={`/admin/content?editionId=${course.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-rose-300/10 p-3"><span className="truncate">{course.subjectName || "未指定科目"}・{course.publisher}・{course.version || "未命名"}</span><span className="text-xs text-rose-200">{course.ocrStatus === "failed" ? "OCR 失敗" : "缺少科目"}</span></Link>)}{!courses.some((course) => !course.subjectName || course.ocrStatus === "failed") && <p className="rounded-xl bg-emerald-300/10 p-3 text-sm text-emerald-100">目前沒有待處理警示，課程資料狀態良好。</p>}</div></Card>
        </div>
      </>}

      {tab === "courses" && <Card title="課程管理" subtitle="搜尋、篩選並進入單一線上課程的詳細內容管理。" action={<div className="flex w-full flex-wrap gap-2 sm:w-auto"><Input className="w-full sm:w-56" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋科目、課程或版本" /><Select className="w-full sm:w-32" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部狀態</option><option value="published">已上架</option><option value="hidden">已下架</option></Select></div>}><div className="space-y-2">{filteredCourses.map((course) => <CourseRow key={course.id} course={course} />)}{!filteredCourses.length && <EmptyState title="沒有符合條件的課程" hint={query ? "請換一個關鍵字或狀態。" : "先建立第一個線上課程。"} />}</div></Card>}

      {tab === "subjects" && <Card title="科目入口管理" subtitle="每個科目只顯示一張卡片；重複的資料由後端統一合併顯示。"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.subjects.map((subject) => { const subjectCourses = courses.filter((course) => subjectKey(course.subjectName ?? "") === subjectKey(subject.name)); return <div key={subject.id} className="glass-soft rounded-2xl p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold">{subject.name}</p><Badge tone={subject.enabled ? "green" : "muted"}>{subject.enabled ? "學生可見" : "已隱藏"}</Badge></div><p className="mt-2 text-xs text-muted">{subjectCourses.length} 個課程・{subjectCourses.reduce((sum, course) => sum + course.lessonCount, 0)} 個課次</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" loading={busy === subject.id} variant={subject.enabled ? "outline" : "primary"} onClick={() => void toggleSubject(subject)}>{subject.enabled ? "下架入口" : "上架入口"}</Button><Link href={`/admin/content?subjectId=${subject.id}`} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/10">管理課程</Link></div></div>; })}{!data.subjects.length && <EmptyState title="尚無科目" hint="請先建立教育科目。" />}</div></Card>}

      {tab === "workflow" && <div className="grid gap-4 md:grid-cols-3"><WorkflowStep number="01" title="建立課程" detail="設定科目、學段、課程名稱、版本與學生端說明。" href="/admin/content" action="前往建立" /><WorkflowStep number="02" title="建立課次與內容" detail="上傳 PDF／圖片，使用 OCR 分析，再確認匯入為課次與教學內容。" href="/admin/content" action="開啟 Content Studio" /><WorkflowStep number="03" title="發布與延伸" detail="上架科目入口，串接題庫、段考專區、AI 分析與學生複習。" href="/admin/question-banks" action="前往題庫" /></div>}
    </>}
  </div>;
}

function Metric({ title, value, detail, tone }: { title: string; value: number; detail: string; tone: "cyan" | "violet" | "gold" | "green" }) {
  const colors = { cyan: "border-cyan-300/25 text-cyan-100", violet: "border-violet-300/25 text-violet-100", gold: "border-amber-300/25 text-amber-100", green: "border-emerald-300/25 text-emerald-100" };
  return <div className={`rounded-2xl border bg-white/[0.035] p-4 ${colors[tone]}`}><p className="text-xs text-muted">{title}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function CourseRow({ course }: { course: Course }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{course.subjectName || "未指定科目"}・{course.publisher}・{course.version || "未命名課程"}</p><Badge tone={course.enabled ? "green" : "muted"}>{statusLabel(course)}</Badge></div><p className="mt-1 text-xs text-muted">{course.volume || "未指定冊次"}・{course.lessonCount} 課次・{course.contentCount} 個教學內容・OCR：{course.ocrStatus || "未開始"}</p></div><Link href={`/admin/content?editionId=${course.id}`} className="rounded-xl border border-[#7dd3fc]/30 px-3 py-2 text-xs font-semibold text-[#b9f2ff]">開啟課程工作區</Link></div>;
}

function WorkflowStep({ number, title, detail, href, action }: { number: string; title: string; detail: string; href: string; action: string }) {
  return <Card><p className="text-3xl font-black text-[#7dd3fc]">{number}</p><h2 className="mt-3 text-lg font-bold">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-muted">{detail}</p><Link href={href} className="mt-4 inline-flex rounded-xl border border-[#37d3ff]/30 px-3 py-2 text-xs font-semibold text-[#b9f2ff]">{action}</Link></Card>;
}
