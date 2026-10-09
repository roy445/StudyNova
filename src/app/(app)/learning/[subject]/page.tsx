import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { learningCurriculum, learningSubjects } from "@/content/learning/ch1";

export default async function SubjectPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  const current = learningSubjects.find((item) => item.slug === subject);
  const curriculum = learningCurriculum[subject as keyof typeof learningCurriculum];
  if (!current || current.status !== "PUBLISHED" || !curriculum) notFound();
  return <div className="space-y-6 pb-24"><header className="flex flex-col justify-between gap-4 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.06] p-6 sm:flex-row sm:items-end sm:p-8"><div><Link href="/learning" className="text-xs text-cyan-200 hover:underline">← 線上學習</Link><h1 className="mt-3 text-3xl font-black">{current.icon} {current.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">{current.subtitle}</p></div><Badge tone="cyan">已開放</Badge></header>
    {"tracks" in current && <Card title="適用範圍" subtitle="目前先開放高一；同一份基礎物理內容提供給以下普通高中學習分組。"><div className="flex flex-wrap gap-2"><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">年級：{current.gradeLabel}</span>{current.tracks?.map((track) => <span key={track} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-muted">{track}</span>)}</div><p className="mt-4 text-xs leading-6 text-muted">自然組後續可銜接更完整的物理課程；技術型高中各群科是否適用，仍以學校課綱與授課進度為準。</p></Card>}
    <Card title="📖 課程" subtitle="目前只顯示已經有實際教材與內容的章節，不建立假章節。"><Link href={`/learning/${subject}/${curriculum.chapter.slug}`} className="group block rounded-2xl border border-cyan-300/20 bg-white/[0.03] p-4 transition hover:border-cyan-300/50 hover:bg-cyan-300/[0.06]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-cyan-200">{curriculum.chapter.slug.toUpperCase()}</p><h2 className="mt-1 text-xl font-bold">{curriculum.chapter.title.replace("CH1 ", "")}</h2><p className="mt-2 text-sm text-muted">{curriculum.chapter.subtitle}</p></div><Badge tone="cyan">已開放</Badge></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{curriculum.lessons.map((lesson) => <div key={lesson.slug} className="rounded-xl bg-black/10 p-3"><p className="text-xs text-cyan-200">{lesson.number}</p><p className="mt-1 text-sm font-semibold">{lesson.title}</p><p className="mt-1 text-xs text-muted">約 {lesson.minutes} 分鐘</p></div>)}</div><div className="mt-5 text-sm font-semibold text-cyan-200">進入課程總覽 →</div></Link></Card>
  </div>;
}
