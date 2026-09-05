import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  novaAccounts,
  novaTransactions,
  xpTransactions,
  assistantProfiles,
  assistantLevels,
  assistantItems,
  assistantInventory,
  assistantTransactions,
  novaProExchangePlans,
  novaProExchangeTransactions,
  memberships,
  membershipHistory,
  coupons,
  couponRedemptions,
  featurePermissions,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, conflict, fail, notFound } from "../core";
import { allFeatureStates, grantMembership, grantNova, grantXp, isProUser } from "../economy";
import { notify } from "../notify";

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/nova",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const account = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0];
      const ledger = await db.select().from(novaTransactions).where(eq(novaTransactions.userId, user.userId)).orderBy(desc(novaTransactions.createdAt)).limit(60);
      const xp = await db.select().from(xpTransactions).where(eq(xpTransactions.userId, user.userId)).orderBy(desc(xpTransactions.createdAt)).limit(60);
      return { account, ledger, xp };
    },
  }),

  route({
    method: "GET",
    path: "/novi",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const profile = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      const levels = await db.select().from(assistantLevels).orderBy(asc(assistantLevels.level));
      const items = await db.select().from(assistantItems).where(and(eq(assistantItems.enabled, true), inArray(assistantItems.category, ["badge", "title", "frame"]))).orderBy(asc(assistantItems.category), asc(assistantItems.priceNova));
      const inventory = await db.select().from(assistantInventory).where(eq(assistantInventory.userId, user.userId));
      const balance = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0]?.balance ?? 0;
      const next = levels.find((l) => l.level === (profile?.level ?? 1) + 1) ?? null;
      return {
        profile,
        levels,
        nextLevel: next,
        items: items.map((i) => ({ ...i, owned: inventory.some((inv) => inv.itemId === i.id) })),
        inventory,
        balance,
        isPro: user.isPro,
      };
    },
  }),

  route({
    method: "POST",
    path: "/novi/upgrade",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const profile = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      if (!profile) throw notFound("找不到 Novi 資料");
      const next = (await db.select().from(assistantLevels).where(eq(assistantLevels.level, profile.level + 1)).limit(1))[0];
      if (!next) throw fail("NOVA_MAX_LEVEL");
      if (profile.xp < next.requiredXp) throw fail("NOVA_XP_NOT_ENOUGH", { message: `需要 ${next.requiredXp} XP 才能升級（目前 ${profile.xp}）` });
      if (next.upgradeCostNova > 0) {
        await grantNova({
          userId: user.userId,
          amount: -next.upgradeCostNova,
          reason: `Novi 升級到 Lv.${next.level}`,
          source: "novi_upgrade",
          idempotencyKey: `noviup:${user.userId}:${next.level}`,
        });
      }
      const rows = await db
        .update(assistantProfiles)
        .set({ level: next.level, updatedAt: new Date() })
        .where(and(eq(assistantProfiles.userId, user.userId), eq(assistantProfiles.level, profile.level)))
        .returning();
      if (!rows[0]) throw fail("NOVA_UPGRADE_CONFLICT");
      await db.insert(assistantTransactions).values({ userId: user.userId, kind: `upgrade_lv${next.level}`, costNova: next.upgradeCostNova });
      await notify({ userId: user.userId, kind: "novi", title: `✨ Novi 升級：${next.name}`, body: next.ability, link: "/profile?tab=novi" });
      return { profile: rows[0], level: next };
    },
  }),

  route({
    method: "PATCH",
    path: "/novi",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          name: z.string().min(1).max(20).optional(),
          title: z.string().max(40).optional(),
          badge: z.string().max(40).optional(),
          frame: z.string().max(40).optional(),
        }),
      );
      const inventory = await db
        .select({ code: assistantItems.code, category: assistantItems.category })
        .from(assistantInventory)
        .innerJoin(assistantItems, eq(assistantItems.id, assistantInventory.itemId))
        .where(eq(assistantInventory.userId, user.userId));
      const owns = (code: string | undefined, category: string) =>
        !code || code === "none" || code === "frame-default" || inventory.some((i) => i.code === code && i.category === category);
      if (!owns(body.frame, "frame") || !owns(body.title, "title") || !owns(body.badge, "badge")) {
        throw badRequest("你尚未擁有這個外觀，請先到 Novi 商店購買");
      }
      const rows = await db.update(assistantProfiles).set({ name: body.name, title: body.title, badge: body.badge, frame: body.frame, skin: "core-classic", core: "none", effect: "none", float: "none", voice: "default", updatedAt: new Date() }).where(eq(assistantProfiles.userId, user.userId)).returning();
      return { profile: rows[0] };
    },
  }),

  route({
    method: "POST",
    path: "/novi/shop/:itemId/buy",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const item = (await db.select().from(assistantItems).where(eq(assistantItems.id, ctx.params.itemId)).limit(1))[0];
      if (!item || !item.enabled) throw fail("SYS_NOT_FOUND", { message: "找不到商品" });
      const profile = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      if ((profile?.level ?? 1) < item.requiredLevel) throw fail("NOVA_ITEM_LEVEL", { message: `需要 Novi Lv.${item.requiredLevel} 才能購買` });
      if (item.proOnly && !(await isProUser(user.userId))) throw fail("QUOTA_PRO_REQUIRED", { message: "這是 Nova Pro 專屬商品" });
      const owned = await db.select().from(assistantInventory).where(and(eq(assistantInventory.userId, user.userId), eq(assistantInventory.itemId, item.id))).limit(1);
      if (owned[0]) throw fail("NOVA_ITEM_OWNED");

      await grantNova({
        userId: user.userId,
        amount: -item.priceNova,
        reason: `購買 Novi 商品：${item.name}`,
        source: "shop",
        idempotencyKey: `shop:${user.userId}:${item.id}`,
      });
      const rows = await db.insert(assistantInventory).values({ userId: user.userId, itemId: item.id }).onConflictDoNothing().returning();
      if (!rows[0]) throw fail("NOVA_ITEM_OWNED");
      await db.insert(assistantTransactions).values({ userId: user.userId, itemId: item.id, kind: "purchase", costNova: item.priceNova });
      return { item, inventory: rows[0], balance: (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0]?.balance ?? 0 };
    },
  }),

  route({
    method: "GET",
    path: "/membership/pro-exchange-plans",
    auth: "user",
    handler: async () => ({ plans: await db.select().from(novaProExchangePlans).where(eq(novaProExchangePlans.enabled, true)).orderBy(asc(novaProExchangePlans.days)) }),
  }),

  route({
    method: "POST",
    path: "/membership/pro-exchange",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ planId: z.string().uuid(), requestId: z.string().uuid().optional() }));
      const plan = (await db.select().from(novaProExchangePlans).where(and(eq(novaProExchangePlans.id, body.planId), eq(novaProExchangePlans.enabled, true))).limit(1))[0];
      if (!plan) throw notFound("找不到可用的 Nova Pro 方案");
      if (plan.days > 30) throw badRequest("Nova Pro 兌換方案最多 30 天");
      const idempotencyKey = body.requestId ?? crypto.randomUUID();
      const previous = (await db.select().from(novaProExchangeTransactions).where(eq(novaProExchangeTransactions.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (previous && previous.userId !== user.userId) throw conflict("此兌換請求識別碼已被使用");
      if (previous) return { exchanged: false, plan, transaction: previous, balance: (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0]?.balance ?? 0 };
      await grantNova({ userId: user.userId, amount: -plan.priceNova, reason: `Nova 點數兌換 Nova Pro ${plan.days} 天`, source: "pro_exchange", idempotencyKey: `proexchange:${idempotencyKey}` });
      await grantMembership({ userId: user.userId, days: plan.days, actorId: user.userId, reason: `Nova 點數兌換 ${plan.days} 天`, action: "extend" });
      const transaction = (await db.insert(novaProExchangeTransactions).values({ userId: user.userId, days: plan.days, priceNova: plan.priceNova, idempotencyKey }).returning())[0];
      await notify({ userId: user.userId, kind: "membership", title: "✨ Nova Pro 兌換成功", body: `已使用 ${plan.priceNova} Nova 兌換 ${plan.days} 天 Nova Pro。`, link: "/profile?tab=pass", dedupeKey: `proexchange-notify:${transaction.id}` });
      return { exchanged: true, plan, transaction, balance: (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0]?.balance ?? 0 };
    },
  }),

  route({
    method: "GET",
    path: "/membership",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const m = (await db.select().from(memberships).where(eq(memberships.userId, user.userId)).limit(1))[0];
      const history = await db.select().from(membershipHistory).where(eq(membershipHistory.userId, user.userId)).orderBy(desc(membershipHistory.createdAt)).limit(20);
      const quotas = await allFeatureStates(user.userId);
      const perms = await db.select().from(featurePermissions).orderBy(asc(featurePermissions.feature));
      return {
        membership: m,
        isPro: user.isPro,
        history,
        quotas,
        comparison: perms.map((p) => ({ feature: p.feature, label: p.label, free: p.freeDailyLimit, pro: p.proDailyLimit, proOnly: p.proOnly })),
      };
    },
  }),

  route({
    method: "POST",
    path: "/coupons/redeem",
    auth: "user",
    rate: { limit: 12, windowSec: 3600 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ code: z.string().min(3).max(40) }));
      const code = body.code.trim().toUpperCase();
      const coupon = (await db.select().from(coupons).where(eq(coupons.code, code)).limit(1))[0];
      const invalid = fail("COUPON_INVALID");
      if (!coupon || !coupon.enabled) throw invalid;
      const now = new Date();
      if (coupon.startsAt && new Date(coupon.startsAt) > now) throw invalid;
      if (coupon.endsAt && new Date(coupon.endsAt) < now) throw invalid;

      const claimed = await db.insert(couponRedemptions).values({ couponId: coupon.id, userId: user.userId }).onConflictDoNothing().returning();
      if (!claimed[0]) throw fail("COUPON_ALREADY_USED");

      const bumped = await db
        .update(coupons)
        .set({ redeemedCount: sql`${coupons.redeemedCount} + 1` })
        .where(and(eq(coupons.id, coupon.id), sql`${coupons.redeemedCount} < ${coupons.maxRedemptions}`))
        .returning({ redeemedCount: coupons.redeemedCount });
      if (!bumped[0]) {
        await db.delete(couponRedemptions).where(eq(couponRedemptions.id, claimed[0].id));
        throw fail("COUPON_LIMIT_REACHED");
      }

      if (coupon.kind === "nova") {
        await grantNova({ userId: user.userId, amount: coupon.value, reason: `優惠碼：${code}`, source: "coupon", idempotencyKey: `coupon:${coupon.id}:${user.userId}` });
      } else if (coupon.kind === "xp") {
        await grantXp({ userId: user.userId, amount: coupon.value, reason: `優惠碼：${code}`, idempotencyKey: `coupon:${coupon.id}:${user.userId}` });
      } else if (coupon.kind === "pro") {
        const { grantMembership } = await import("../economy");
        await grantMembership({ userId: user.userId, days: coupon.value, actorId: user.userId, reason: `優惠碼：${code}`, action: "extend" });
      }
      await notify({ userId: user.userId, kind: "reward", title: "🎁 優惠碼兌換成功", body: `${code}：${coupon.kind === "pro" ? `Nova Pro ${coupon.value} 天` : `${coupon.value} ${coupon.kind.toUpperCase()}`}`, link: "/profile" });
      return { redeemed: true, kind: coupon.kind, value: coupon.value };
    },
  }),

  route({
    method: "GET",
    path: "/quotas",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { quotas: await allFeatureStates(user.userId), isPro: user.isPro };
    },
  }),
];
