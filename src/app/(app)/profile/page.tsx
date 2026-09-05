"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NoviAvatar } from "@/components/brand";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Progress, Select, Skeleton, Stat, Tabs, useToast } from "@/components/ui";
import { apiPatch, apiPost, errorMessage, shareContent, useApi } from "@/lib/api";

type Novi = {
  profile: { name: string; level: number; xp: number; skin: string; core: string; effect: string; float: string; voice: string; title: string; badge: string; frame: string } | null;
  levels: Array<{ level: number; name: string; requiredXp: number; upgradeCostNova: number; ability: string; aura: string }>;
  nextLevel: { level: number; name: string; requiredXp: number; upgradeCostNova: number; ability: string } | null;
  items: Array<{ id: string; code: string; name: string; category: string; priceNova: number; description: string; requiredLevel: number; proOnly: boolean; owned: boolean; enabled?: boolean }>;
  balance: number;
  isPro: boolean;
};

function ProfileInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "profile");
  const me = useApi<{ user: { novaId: string; displayName: string; email: string; role: string; isPro: boolean; proExpiresAt: string | null }; settings: Record<string, unknown> | null; nova: number }>("/auth/me");
  const novi = useApi<Novi>("/novi");
  const nova = useApi<{ account: { balance: number; lifetimeEarned: number; lifetimeSpent: number }; ledger: Array<{ id: string; amount: number; reason: string; createdAt: string; balanceAfter: number }>; xp: Array<{ id: string; amount: number; reason: string; createdAt: string }> }>("/nova");
  const achievements = useApi<{ achievements: Array<{ id: string; code: string; title: string; description: string; icon: string; target: number; progress: number; unlockedAt: string | null; rewardNova: number }> }>("/achievements");
  const membership = useApi<{ membership: { tier: string; expiresAt: string | null } | null; isPro: boolean; quotas: Array<{ feature: string; label: string; used: number; limit: number; unlimited: boolean; proOnly: boolean }>; comparison: Array<{ feature: string; label: string; free: number; pro: number; proOnly: boolean }>; history: Array<{ id: string; action: string; days: number; reason: string; createdAt: string }> }>("/membership");
  const proPlans = useApi<{ plans: Array<{ id: string; days: number; priceNova: number }> }>("/membership/pro-exchange-plans");
  const push = useApi<{ configured: boolean; publicKey: string; subscriptions: number }>("/push/config");
  const settings = useApi<{ settings: Record<string, unknown> }>("/account/settings");

  const [displayName, setDisplayName] = useState("");
  const [coupon, setCoupon] = useState("");
  const [pwd, setPwd] = useState({ current: "", next: "" });

  const profile = novi.data?.profile;

  async function enablePush() {
    try {
      if (!push.data?.configured) return toast.push("error", "伺服器尚未設定 VAPID 金鑰");
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return toast.push("error", "你拒絕了通知權限");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: push.data.publicKey });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await apiPost("/push/subscribe", { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
      toast.push("success", "已開啟推播通知");
      await push.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-col items-center gap-3 bg-gradient-to-r from-[#7c5cff]/20 to-[#ffc857]/10 p-5 sm:flex-row">
          <NoviAvatar size={92} state="happy" level={profile?.level ?? 1} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className={`text-lg font-bold ${me.data?.user.isPro ? "pro-name" : ""}`}>{me.data?.user.displayName}</h1>
              {me.data?.user.isPro && <Badge tone="gold">Nova Pro</Badge>}
              {profile?.title && <Badge tone="violet">{profile.title}</Badge>}
            </div>
            <p className="text-sm tracking-widest text-[#7dd3fc]">{me.data?.user.novaId}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(me.data?.user.novaId ?? "");
                  toast.push("success", "已複製 NOVA ID");
                }}
              >
                複製 ID
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await shareContent({
                    title: "StudyNova AI",
                    text: `我的 NOVA ID 是 ${me.data?.user.novaId}，一起來 StudyNova 讀書！`,
                    url: `${window.location.origin}/nova/${me.data?.user.novaId}`,
                  });
                  toast.push("success", res === "copied" ? "已複製分享內容" : "已開啟分享");
                }}
              >
                分享 NOVA
              </Button>
              <Link href={`/nova/${me.data?.user.novaId}`} className="focus-ring inline-flex items-center rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-muted transition hover:border-[#37d3ff]/50 hover:text-[#7dd3fc]">
                公開展示頁
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Nova" value={nova.data?.account.balance ?? 0} tone="gold" />
            <Stat label="XP" value={profile?.xp ?? 0} tone="cyan" />
            <Stat label="Novi" value={`Lv.${profile?.level ?? 1}`} tone="violet" />
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: "profile", label: "個人資料", icon: "◎" },
          { key: "novi", label: "Novi 養成", icon: "✦" },
          { key: "shop", label: "商店", icon: "▧" },
          { key: "nova", label: "Nova 紀錄", icon: "✦" },
          { key: "achievements", label: "成就", icon: "◇" },
          { key: "pass", label: "我的通行證", icon: "▤" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "profile" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(me.data?.user.role === "admin" || me.data?.user.role === "owner") && (
            <Card className="border-[#ffc857]/40 bg-gradient-to-br from-[#ffc857]/10 to-transparent lg:col-span-2" title="▣ 後台權力擁有者入口" subtitle="手機版也可以從這裡管理使用者、公告、推播、PRO 與每週小考。">
              <Link href="/admin" className="focus-ring flex items-center justify-between gap-3 rounded-xl border border-[#ffc857]/30 bg-[#ffc857]/10 px-4 py-3 text-sm text-[#ffe7a8] transition hover:bg-[#ffc857]/20">
                <span><strong>進入管理後台</strong><span className="ml-2 text-xs text-muted">管理員專用</span></span>
                <span aria-hidden="true">→</span>
              </Link>
            </Card>
          )}
          <Card title="◎ 個人資料">
            <div className="space-y-3">
              <Field label="顯示名稱">
                <Input value={displayName || (me.data?.user.displayName ?? "")} onChange={(e) => setDisplayName(e.target.value)} />
              </Field>
              <Button
                size="sm"
                onClick={async () => {
                  await apiPatch("/account/profile", { displayName: displayName || me.data?.user.displayName });
                  toast.push("success", "已更新");
                  await me.reload();
                }}
              >
                儲存
              </Button>
              <p className="text-xs text-muted">Email：{me.data?.user.email}（僅用於密碼重設）</p>
            </div>
          </Card>

          <Card title="⌁ 學習設定" subtitle="修改後會立即影響每日單字、AI 建議與讀書計畫">
            {settings.loading && <Skeleton lines={4} />}
            {settings.data && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="就讀學校（可選填）">
                  <Input
                    defaultValue={String(settings.data.settings.schoolName ?? "")}
                    placeholder="例如：清水高中"
                    onBlur={async (e) => {
                      await apiPatch("/account/settings", { schoolName: e.target.value.trim() });
                      toast.push("success", "已更新學校資訊");
                    }}
                  />
                </Field>
                <Field label="每日學習目標（分鐘）">
                  <Input
                    type="number"
                    min={10}
                    max={600}
                    defaultValue={String(settings.data.settings.dailyGoalMinutes ?? 45)}
                    onBlur={async (e) => {
                      await apiPatch("/account/settings", { dailyGoalMinutes: Number(e.target.value) });
                      toast.push("success", "已更新每日目標");
                    }}
                  />
                </Field>
                <Field label="每日單字量">
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    defaultValue={String(settings.data.settings.dailyWordCount ?? 10)}
                    onBlur={async (e) => {
                      await apiPatch("/account/settings", { dailyWordCount: Number(e.target.value) });
                      toast.push("success", "已更新單字量");
                    }}
                  />
                </Field>
                <Field label="英文程度">
                  <Select
                    defaultValue={String(settings.data.settings.englishLevel ?? "A2")}
                    onChange={async (e) => {
                      await apiPatch("/account/settings", { englishLevel: e.target.value });
                      toast.push("success", "已更新英文程度");
                    }}
                  >
                    {["A1", "A2", "B1", "B2", "C1"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="提醒時間">
                  <Input
                    type="time"
                    defaultValue={String(settings.data.settings.reminderTime ?? "20:00")}
                    onBlur={async (e) => {
                      await apiPatch("/account/settings", { reminderTime: e.target.value });
                      toast.push("success", "已更新提醒時間");
                    }}
                  />
                </Field>
                <Field label="主題">
                  <Select
                    defaultValue={document.documentElement.dataset.theme ?? "dark"}
                    onChange={async (e) => {
                      document.documentElement.dataset.theme = e.target.value;
                      localStorage.setItem("sn-theme", e.target.value);
                      await apiPatch("/account/settings", { theme: e.target.value });
                    }}
                  >
                    <option value="dark">深色</option>
                    <option value="light">淺色</option>
                  </Select>
                </Field>
                <Field label="減少動畫">
                  <Select
                    defaultValue={document.documentElement.dataset.motion ?? "normal"}
                    onChange={async (e) => {
                      document.documentElement.dataset.motion = e.target.value;
                      localStorage.setItem("sn-motion", e.target.value);
                      await apiPatch("/account/settings", { reducedMotion: e.target.value === "reduced" });
                    }}
                  >
                    <option value="normal">正常動畫</option>
                    <option value="reduced">減少動畫</option>
                  </Select>
                </Field>
              </div>
            )}
          </Card>

          <Card title="▣ 安全與通知">
            <div className="space-y-3">
              <Field label="目前密碼">
                <Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
              </Field>
              <Field label="新密碼">
                <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              </Field>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await apiPost("/auth/password/change", pwd);
                    toast.push("success", "密碼已更新");
                    setPwd({ current: "", next: "" });
                  } catch (err) {
                    toast.push("error", errorMessage(err));
                  }
                }}
              >
                更新密碼
              </Button>
              <div className="border-t border-[var(--line)] pt-3">
                <p className="text-xs text-muted">推播通知：{push.data?.configured ? `${push.data.subscriptions} 個裝置已訂閱` : "伺服器尚未設定 VAPID"}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={enablePush}>
                    開啟推播
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await apiPost<{ sent: number }>("/push/test");
                      toast.push("success", `已送出 ${res.sent} 則測試推播`);
                    }}
                  >
                    測試推播
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "novi" && (
        <Card title="✦ Novi 養成">
          {novi.loading && <Skeleton lines={4} />}
          {novi.error && <ErrorState message={novi.error} onRetry={novi.reload} />}
          {novi.data && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <NoviAvatar size={110} state="cheer" level={profile?.level ?? 1} />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">
                    {profile?.name} · Lv.{profile?.level} {novi.data.levels.find((l) => l.level === profile?.level)?.name}
                  </p>
                  <p className="text-xs text-muted">{novi.data.levels.find((l) => l.level === profile?.level)?.ability}</p>
                  {novi.data.nextLevel && (
                    <div className="mt-2">
                      <Progress value={profile?.xp ?? 0} max={novi.data.nextLevel.requiredXp} tone="violet" />
                      <p className="mt-1 text-xs text-muted">
                        升級到 Lv.{novi.data.nextLevel.level}「{novi.data.nextLevel.name}」需要 {novi.data.nextLevel.requiredXp} XP 與 {novi.data.nextLevel.upgradeCostNova} Nova
                      </p>
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={async () => {
                          try {
                            await apiPost("/novi/upgrade");
                            toast.push("success", "Novi 升級成功！");
                            await novi.reload();
                            await nova.reload();
                          } catch (err) {
                            toast.push("error", errorMessage(err));
                          }
                        }}
                      >
                        升級 Novi
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(["frame", "title", "badge"] as const).map((cat) => (
                    <Field key={cat} label={{ frame: "頭像框", title: "稱號", badge: "徽章" }[cat]}>
                    <Select
                      value={String(profile?.[cat] ?? "none")}
                      onChange={async (e) => {
                        try {
                          await apiPatch("/novi", { [cat]: e.target.value });
                          toast.push("success", "已更換");
                          await novi.reload();
                        } catch (err) {
                          toast.push("error", errorMessage(err));
                        }
                      }}
                    >
                      <option value={cat === "frame" ? "frame-default" : "none"}>預設</option>
                      {novi.data?.items.filter((i) => i.category === cat && i.owned).map((i) => (
                        <option key={i.id} value={i.code}>
                          {i.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>

              <div className="space-y-1.5">
                {novi.data.levels.map((l) => (
                  <div key={l.level} className={`glass-soft flex items-center justify-between px-3 py-2 text-xs ${(profile?.level ?? 1) >= l.level ? "" : "opacity-60"}`}>
                    <span>
                      Lv.{l.level} {l.name}
                    </span>
                    <span className="text-muted">
                      {l.requiredXp} XP・{l.ability}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === "shop" && (
        <Card title="▧ Novi 商店" subtitle={`目前 Nova 餘額：${novi.data?.balance ?? 0}`} action={<Button size="sm" variant="ghost" onClick={() => void novi.reload()}>重新整理商品</Button>}>
          <div className="mb-3 rounded-xl border border-[#37d3ff]/20 bg-[#37d3ff]/5 px-3 py-2 text-xs text-muted">商品下架後會立即從這裡消失；PRO 商品會先顯示資格要求，購買時後端也會再次驗證。</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {novi.data?.items.map((item) => (
              <div key={item.id} className="glass-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2"><Badge tone="cyan">{{ badge: "徽章", title: "稱號", frame: "頭像框" }[item.category] ?? "商品"}</Badge><p className="truncate text-sm font-medium">{item.name}</p></div>
                  {item.proOnly && <Badge tone="gold">Pro</Badge>}
                </div>
                  <p className="mt-0.5 text-[11px] text-muted">{item.description}</p>
                  <p className="mt-1 text-[11px] text-muted">需要 Lv.{item.requiredLevel}{item.proOnly ? "・需要 Nova Pro" : ""}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#ffd98a]">✦ {item.priceNova}</span>
                    <div className="flex items-center gap-1.5">
                      {item.owned ? (
                        <Badge tone="green">已擁有</Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={Boolean(item.proOnly && !novi.data?.isPro)}
                          onClick={async () => {
                            if (item.proOnly && !novi.data?.isPro) return toast.push("error", "這是 Nova Pro 專屬商品，請先升級資格");
                            try {
                              await apiPost(`/novi/shop/${item.id}/buy`);
                              toast.push("success", `已購買 ${item.name}`);
                              await novi.reload();
                              await nova.reload();
                            } catch (err) {
                              toast.push("error", errorMessage(err));
                            }
                          }}
                    >
                      {item.proOnly && !novi.data?.isPro ? "需 Pro" : "購買"}
                    </Button>
                  )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}


      {tab === "nova" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="✦ Nova 帳戶">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="餘額" value={nova.data?.account.balance ?? 0} tone="gold" />
              <Stat label="累計獲得" value={nova.data?.account.lifetimeEarned ?? 0} />
              <Stat label="累計花費" value={nova.data?.account.lifetimeSpent ?? 0} />
            </div>
            <div className="mt-3 max-h-80 space-y-1 overflow-y-auto scroll-thin">
              {nova.data?.ledger.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-1.5 text-xs">
                  <span className="min-w-0 truncate">{t.reason}</span>
                  <span className={`tabular-nums ${t.amount > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {t.amount > 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </div>
              ))}
              {!nova.data?.ledger.length && <EmptyState icon="✦" title="還沒有交易紀錄" />}
            </div>
          </Card>
          <Card title="⌁ XP 紀錄">
            <div className="max-h-96 space-y-1 overflow-y-auto scroll-thin">
              {nova.data?.xp.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-1.5 text-xs">
                  <span className="min-w-0 truncate">{t.reason}</span>
                  <span className="tabular-nums text-[#7dd3fc]">+{t.amount}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "achievements" && (
        <Card title="◇ 成就">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.data?.achievements.map((a) => (
              <div key={a.id} className={`glass-soft p-3 ${a.unlockedAt ? "" : "opacity-70"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {a.icon} {a.title}
                  </p>
                  {a.unlockedAt ? <Badge tone="green">已解鎖</Badge> : <Badge tone="muted">未解鎖</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">{a.description}</p>
                <div className="mt-1.5">
                  <Progress value={Math.min(a.progress, a.target)} max={a.target} tone={a.unlockedAt ? "green" : "violet"} />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {Math.min(a.progress, a.target)}/{a.target}・獎勵 {a.rewardNova} Nova
                </p>
                {a.unlockedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1.5"
                    onClick={async () => {
                      const res = await apiPost<{ url: string }>("/shares", { kind: "achievement", title: `我解鎖了「${a.title}」`, payload: { icon: a.icon, description: a.description } });
                      const out = await shareContent({ title: "StudyNova 成就", text: `我解鎖了「${a.title}」！`, url: `${window.location.origin}${res.url}` });
                      toast.push("success", out === "copied" ? "已複製分享連結" : "已開啟分享");
                    }}
                  >
                    分享成果卡
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "pass" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="▤ 我的通行證">
            <div className={`rounded-2xl p-4 ${membership.data?.isPro ? "gold-ring bg-gradient-to-br from-[#ffc857]/20 to-[#ff9f43]/5" : "border border-[var(--line)]"}`}>
              <p className="text-lg font-bold">{membership.data?.isPro ? "Nova Pro 會員" : "免費方案"}</p>
              <p className="text-xs text-muted">
                {membership.data?.membership?.expiresAt ? `到期日：${new Date(membership.data.membership.expiresAt).toLocaleDateString("zh-TW")}` : "Nova Pro 由管理員授予，無法自行購買"}
              </p>
              {membership.data?.isPro && (
                  <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>學習獎勵雙倍 Nova 與 XP</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>金色流動身分與專屬徽章</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>進階 AI 額度與較長對話</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>AI 題目分析與詳解教學</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>優先參加 PRO 每週小考</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>每週小考專屬排名標記</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>限定活動、挑戰與競賽</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>Novi PRO 表情與核心特效</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>錯題與學習報告進階洞察</li>
                    <li><span className="mr-1 text-[#ffd98a]">✓</span>限定公告與專屬獎勵</li>
                  </ul>
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-[#ffc857]/25 bg-[#ffc857]/5 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#ffd98a]">用 Nova 點數兌換 Nova Pro</p><Badge tone="gold">最多 30 天</Badge></div>
              <p className="mt-1 text-xs text-muted">天數越長總價越高，30 天方案提供最多使用天數但價格也最高。</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {proPlans.data?.plans.map((plan) => <Button key={plan.id} disabled={membership.data?.isPro === true} variant={plan.days === 30 ? "gold" : "ghost"} onClick={async () => { try { const res = await apiPost<{ plan: { days: number; priceNova: number }; balance: number }>("/membership/pro-exchange", { planId: plan.id, requestId: crypto.randomUUID() }); toast.push("success", `已兌換 Nova Pro ${res.plan.days} 天，剩餘 ${res.balance} Nova`); await Promise.all([nova.reload(), membership.reload(), me.reload()]); } catch (err) { toast.push("error", errorMessage(err)); } }}>{membership.data?.isPro ? "目前為 Pro" : `${plan.days} 天・✦ ${plan.priceNova} Nova`}</Button>)}
              </div>
            </div>
            <div className="mt-3">
              <Field label="優惠碼">
                <div className="flex gap-2">
                  <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="輸入優惠碼" />
                  <Button
                    onClick={async () => {
                      try {
                        const res = await apiPost<{ kind: string; value: number }>("/coupons/redeem", { code: coupon });
                        toast.push("success", `兌換成功：${res.kind === "pro" ? `Nova Pro ${res.value} 天` : `${res.value} ${res.kind.toUpperCase()}`}`);
                        setCoupon("");
                        await Promise.all([nova.reload(), membership.reload(), me.reload()]);
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      }
                    }}
                  >
                    兌換
                  </Button>
                </div>
              </Field>
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted">
              {membership.data?.history.map((h) => (
                <p key={h.id}>
                  {new Date(h.createdAt).toLocaleDateString("zh-TW")}・{h.action}
                  {h.days ? ` ${h.days} 天` : ""}｜{h.reason}
                </p>
              ))}
            </div>
          </Card>

          <Card title="◒ 今日額度使用">
            <div className="space-y-2">
              {membership.data?.quotas.map((q) => (
                <div key={q.feature}>
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      {q.label} {q.proOnly && <Badge tone="gold">Pro</Badge>}
                    </span>
                    <span className="tabular-nums text-muted">{q.unlimited ? "無限" : `${q.used}/${q.limit}`}</span>
                  </div>
                  <Progress value={q.unlimited ? 0 : q.used} max={Math.max(1, q.limit)} tone={q.used >= q.limit && !q.unlimited ? "gold" : "cyan"} />
                </div>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto scroll-thin">
              <table className="w-full min-w-[320px] text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-1">功能</th>
                    <th className="pb-1 text-right">免費</th>
                    <th className="pb-1 text-right">Nova Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {membership.data?.comparison.map((c) => (
                    <tr key={c.feature} className="border-t border-[var(--line)]">
                      <td className="py-1">{c.label}</td>
                      <td className="py-1 text-right tabular-nums">{c.free === 0 ? "—" : c.free}</td>
                      <td className="py-1 text-right tabular-nums text-[#ffd98a]">{c.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <ProfileInner />
    </Suspense>
  );
}
