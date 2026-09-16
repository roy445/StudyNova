import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friends, shares, users } from "@/db/schema";
import { LogoMark, StarField } from "@/components/brand";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  quiz: "測驗成績",
  note: "學習筆記",
  achievement: "成就解鎖",
  grades: "成績趨勢",
  challenge: "好友挑戰",
  plan: "學習報告",
  weekly: "每週小考",
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

        <div className="mt-4 space-y-2 text-left text-sm">
          {Object.entries(payload)
            .filter(([, v]) => typeof v === "string" || typeof v === "number")
            .slice(0, 8)
            .map(([k, v]) => (
              <div key={k} className="glass-soft flex items-start justify-between gap-3 px-3 py-2">
                <span className="text-xs text-muted">{k}</span>
                <span className="min-w-0 flex-1 text-right text-sm">{String(v).slice(0, 300)}</span>
              </div>
            ))}
        </div>

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
