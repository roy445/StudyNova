import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friends, shares, users } from "@/db/schema";
import { LogoMark, StarField } from "@/components/brand";
import { getSession } from "@/server/auth";
import { ShareActions } from "./share-actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  quiz: "測驗成績",
  note: "學習筆記",
  achievement: "成就解鎖",
  grades: "成績趨勢",
  challenge: "好友挑戰",
  plan: "學習報告",
  weekly: "每週小考",
  vocabulary: "單字卡",
};

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await db.select().from(shares).where(eq(shares.slug, slug)).limit(1);
  const share = rows[0];
  if (!share) notFound();
  const session = await getSession();
  if (share.visibility === "private" && session?.user.userId !== share.userId) notFound();
  if (share.visibility === "friends" && session?.user.userId !== share.userId) {
    if (!session) notFound();
    const friendship = await db.select({ userId: friends.userId }).from(friends).where(or(and(eq(friends.userId, session.user.userId), eq(friends.friendId, share.userId)), and(eq(friends.userId, share.userId), eq(friends.friendId, session.user.userId)))).limit(1);
    if (!friendship[0]) notFound();
  }
  await db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1` }).where(eq(shares.id, share.id));
  const owner = (await db.select({ displayName: users.displayName, novaId: users.novaId }).from(users).where(eq(users.userId, share.userId)).limit(1))[0];
  const payload = share.payload as Record<string, unknown>;
  const vocabularyWords = Array.isArray(payload.words) ? payload.words.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.word !== "string" || !item.word.trim()) return [];
    return [{ word: item.word.slice(0, 200), meaning: typeof item.meaning === "string" ? item.meaning.slice(0, 1000) : "", partOfSpeech: typeof item.partOfSpeech === "string" ? item.partOfSpeech.slice(0, 80) : "", phonetic: typeof item.phonetic === "string" ? item.phonetic.slice(0, 160) : "", example: typeof item.example === "string" ? item.example.slice(0, 1000) : "", exampleZh: typeof item.exampleZh === "string" ? item.exampleZh.slice(0, 1000) : "" }];
  }) : [];

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <StarField count={26} />
      <div className="glass anim-pop relative z-10 w-full max-w-md p-6 text-center">
        <div className="flex justify-center">
          <LogoMark size={98} />
        </div>
        <p className="mt-2 text-xs tracking-[0.2em] text-muted">STUDYNOVA AI · {KIND_LABEL[share.kind] ?? share.kind}</p>
        <h1 className="mt-2 text-xl font-bold">{share.title}</h1>
        <p className="mt-1 text-xs text-muted">
          來自 {share.visibility === "public" ? owner?.displayName : "StudyNova 使用者"} · {new Date(share.createdAt).toLocaleDateString("zh-TW")}
        </p>

        {share.kind === "vocabulary" ? (
          <div className="mt-4 max-h-[48dvh] space-y-2 overflow-y-auto text-left">
            {vocabularyWords.map((word, index) => <article key={`${word.word}-${index}`} className="glass-soft rounded-xl p-3"><div className="flex flex-wrap items-baseline gap-x-2"><h2 className="font-semibold">{word.word}</h2>{word.partOfSpeech && <span className="text-[11px] text-muted">{word.partOfSpeech}</span>}{word.phonetic && <span className="text-xs text-[#b9f2ff]">{word.phonetic}</span>}</div>{word.meaning && <p className="mt-1 text-sm">{word.meaning}</p>}{word.example && <p className="mt-2 text-xs leading-5 text-muted">{word.example}{word.exampleZh && <span className="block">{word.exampleZh}</span>}</p>}</article>)}
            {!vocabularyWords.length && <p className="rounded-xl bg-white/5 p-3 text-xs text-muted">這個分享目前沒有可顯示的單字。</p>}
          </div>
        ) : (
          <div className="mt-4 space-y-2 text-left text-sm">
            {Object.entries(payload).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 8).map(([key, value]) => (
              <div key={key} className="glass-soft flex items-start justify-between gap-3 px-3 py-2"><span className="text-xs text-muted">{key}</span><span className="min-w-0 flex-1 text-right text-sm">{String(value).slice(0, 300)}</span></div>
            ))}
          </div>
        )}

        {share.artifactId && <a href={`/api/v1/shares/public/${encodeURIComponent(share.slug)}/asset`} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-2xl border border-[#37d3ff]/30 bg-white/5 p-2"><img src={`/api/v1/shares/public/${encodeURIComponent(share.slug)}/asset`} alt={`${share.title} 預覽`} className="max-h-[420px] w-full object-contain" /></a>}
        <ShareActions shareId={share.id} kind={share.kind} loggedIn={Boolean(session)} returnPath={`/s/${encodeURIComponent(slug)}`} />

        <Link
          href="/register"
          className="focus-ring mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] px-4 py-3 text-sm font-medium text-white"
        >
          我也要用 StudyNova AI 讀書 →
        </Link>
      </div>
    </div>
  );
}
