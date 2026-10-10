import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { learningCurriculum, learningSubjects } from "@/content/learning/ch1";

export default async function SubjectPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  const current = learningSubjects.find((item) => item.slug === subject);
  const curriculum = learningCurriculum[subject as keyof typeof learningCurriculum];
  if (!current || current.status !== "PUBLISHED" || !curriculum) { notFound(); return null; }
  const chapters = "chapters" in curriculum ? curriculum.chapters : [curriculum.chapter];
  return <div className="space-y-6 pb-24"><header className="flex flex-col justify-between gap-4 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.06] p-6 sm:flex-row sm:items-end sm:p-8"><div><Link href="/learning" className="text-xs text-cyan-200 hover:underline">← 線上學習</Link><h1 className="mt-3 text-3xl font-black">{current.icon} {current.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">{current.subtitle}</p></div><Badge tone="cyan">已開放</Badge></header>
    <Card title="📖 課程章節" subtitle={"chapters" in curriculum ? "四個章節分開學習；點選章節後只會顯示該章課次。" : "選擇章節開始學習。"}><div className="grid gap-4 sm:grid-cols-2">{chapters.map((chapter) => <Link href={`/learning/${subject}/${chapter.slug}`} key={chapter.slug} className="group rounded-2xl border border-cyan-300/20 bg-white/[0.03] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-cyan-300/[0.06]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-cyan-200">{chapter.slug.toUpperCase()}</p><h2 className="mt-1 text-xl font-bold">{chapter.title.replace(/^CH[1-4] /, "")}</h2></div><Badge tone="cyan">{"lessons" in chapter ? chapter.lessons.length : curriculum.lessons.length} 課</Badge></div><p className="mt-3 text-sm leading-6 text-muted">{chapter.subtitle}</p><div className="mt-4 space-y-2">{("lessons" in chapter ? chapter.lessons : curriculum.lessons).map((lesson) => <div key={lesson.slug} className="rounded-xl bg-black/10 p-3"><p className="text-xs text-cyan-200">{lesson.number}</p><p className="mt-1 text-sm font-semibold">{lesson.title}</p><p className="mt-1 text-xs text-muted">約 {lesson.minutes} 分鐘</p></div>)}</div><div className="mt-4 text-sm font-semibold text-cyan-200">進入本章 →</div></Link>)}</div></Card>
  </div>;
}
