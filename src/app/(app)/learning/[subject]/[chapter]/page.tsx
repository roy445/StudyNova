import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { chemistryChapter, chemistryLessons } from "@/content/learning/ch1";

export default async function ChapterPage({ params }: { params: Promise<{ subject: string; chapter: string }> }) {
  const { subject, chapter } = await params;
  if (subject !== "chemistry" || chapter !== "ch1") notFound();
  return <div className="space-y-6 pb-24"><header><Link href={`/learning/${subject}`} className="text-xs text-cyan-200 hover:underline">← 高中化學</Link><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[.25em] text-cyan-200">CH1 COURSE MAP</p><h1 className="mt-2 text-3xl font-black">{chemistryChapter.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted">{chemistryChapter.subtitle}</p></div><Badge tone="cyan">教材來源：{chemistryChapter.sourcePages}</Badge></div></header>
    <Card title="學習路徑" subtitle="先理解，再互動、練習與回顧。完成度會在實際完成活動後更新。"><div className="grid gap-3">{chemistryLessons.map((lesson) => <Link href={`/learning/${subject}/${chapter}/${lesson.slug}`} key={lesson.slug} className="group rounded-2xl border border-[var(--line)] bg-white/[0.025] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/40"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-sm font-bold text-cyan-200">{lesson.number}</span><div><h2 className="font-bold">{lesson.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{lesson.summary}</p></div></div><div className="text-right text-xs text-muted">約 {lesson.minutes} 分鐘<br /><span className="text-cyan-200">開始 →</span></div></div><div className="mt-3 flex flex-wrap gap-2">{lesson.concepts.slice(0, 4).map((concept) => <span key={concept} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted">{concept}</span>)}</div></Link>)}</div></Card>
    <Card title="來源與範圍" subtitle="本章內容依使用者提供的正式講義建立，不把 PDF 解析錯誤當作教材。"><p className="text-sm leading-7 text-muted">{chemistryChapter.source}・{chemistryChapter.sourcePages}</p></Card>
  </div>;
}
