"use client";

import { useParams } from "next/navigation";
import { NoviAvatar } from "@/components/brand";
import { Badge, Button, Card, ErrorState, Skeleton, Stat, useToast } from "@/components/ui";
import { errorMessage, shareContent, useApi } from "@/lib/api";

type PublicNovi = {
  profile: {
    novaId: string;
    displayName: string;
    bio: string | null;
    level: number;
    xp: number;
    skin: string;
    core: string;
    effect: string;
    float: string;
    title: string;
    badge: string;
    isPro: boolean;
    inventory: Array<{ code: string; name: string; category: string }>;
  };
};

export default function PublicNoviPage() {
  const params = useParams<{ novaId: string }>();
  const toast = useToast();
  const novaId = String(params.novaId ?? "").toUpperCase();
  const profile = useApi<PublicNovi>(`/users/${encodeURIComponent(novaId)}/public`);
  const data = profile.data?.profile;

  async function share() {
    if (!data) return;
    try {
      const result = await shareContent({ title: `${data.displayName} 的 StudyNova NOVA`, text: `來看看 ${data.displayName} 的 Novi Lv.${data.level}！`, url: window.location.href });
      toast.push("success", result === "copied" ? "已複製展示頁連結" : "已開啟分享");
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      {profile.loading && <Card><Skeleton lines={6} /></Card>}
      {profile.error && <ErrorState message={profile.error} onRetry={profile.reload} />}
      {data && (
        <div className="space-y-4">
          <Card className="overflow-hidden !p-0">
            <div className="relative flex flex-col items-center gap-4 bg-gradient-to-br from-[#7c5cff]/25 via-[#37d3ff]/10 to-[#ffc857]/15 p-6 text-center sm:flex-row sm:text-left">
              <div className="rounded-3xl border border-white/15 bg-black/20 px-5 pt-3 shadow-[0_0_36px_rgba(55,211,255,0.16)]">
                <NoviAvatar size={132} skin={data.skin} core={data.core} effect={data.effect} float={data.float} level={data.level} state="happy" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className={`text-2xl font-extrabold ${data.isPro ? "pro-name" : ""}`}>{data.displayName}</h1>
                  {data.isPro && <Badge tone="gold">Nova Pro</Badge>}
                  {data.title && <Badge tone="violet">{data.title}</Badge>}
                  {data.badge && <Badge tone="cyan">{data.badge}</Badge>}
                </div>
                <p className="mt-1 tracking-[0.2em] text-[#7dd3fc]">{data.novaId}</p>
                {data.bio && <p className="mt-3 max-w-xl text-sm text-muted">{data.bio}</p>}
                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button size="sm" onClick={share}>分享這張 NOVA 卡</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(data.novaId).then(() => toast.push("success", "已複製 NOVA ID"))}>複製 ID</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <Stat label="Novi 等級" value={`Lv.${data.level}`} tone="violet" />
                <Stat label="XP" value={data.xp} tone="cyan" />
              </div>
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="✦ 裝備展示" subtitle="這是對方目前公開展示的 Novi 外觀與效果。">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[['外觀', data.skin], ['核心', data.core], ['特效', data.effect], ['漂浮', data.float]].map(([label, value]) => <div key={label} className="glass-soft p-3"><p className="text-muted">{label}</p><p className="mt-1 font-semibold text-[#e8edff]">{value === "none" ? "預設" : value}</p></div>)}
              </div>
            </Card>
            <Card title="▧ 收藏櫃" subtitle={`已解鎖 ${data.inventory.length} 件 Novi 商品，繼續努力也能打造自己的風格。`}>
              <div className="flex flex-wrap gap-2">{data.inventory.map((item) => <Badge key={item.code} tone={item.category === "skin" ? "violet" : item.category === "effect" ? "cyan" : "gold"}>{item.name}</Badge>)}</div>
              {!data.inventory.length && <p className="text-sm text-muted">目前還沒有公開收藏品。</p>}
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
