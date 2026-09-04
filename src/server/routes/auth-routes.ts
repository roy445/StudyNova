import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { users, userSettings, passwordResetTokens, sessions, memberships, novaAccounts, assistantProfiles, assistantInventory, assistantItems } from "@/db/schema";
import { route, type RouteDef } from "../router";
import {
  fail,
  badRequest,
  conflict,
  generateNovaId,
  hashPassword,
  notFound,
  randomToken,
  sha256,
  unauthorized,
  verifyPassword,
} from "../core";
import { createSession, destroySession, getSession } from "../auth";
import { ensureDailyTasks, ensureUserEconomy, allFeatureStates, novaBalance } from "../economy";
import { notify } from "../notify";

const emailSchema = z.string().email("Email 格式不正確").max(180);
const passwordSchema = z.string().min(8, "密碼至少 8 個字元").max(128);

async function createUniqueNovaId(): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const candidate = generateNovaId();
    const exists = await db.select({ id: users.userId }).from(users).where(eq(users.novaId, candidate)).limit(1);
    if (!exists[0]) return candidate;
  }
  throw fail("AUTH_NOVAID_GENERATE_FAILED");
}

export const routes: RouteDef[] = [
  route({
    method: "POST",
    path: "/auth/register",
    auth: "none",
    rate: { limit: 10, windowSec: 600, key: "register" },
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({
          email: emailSchema,
          password: passwordSchema,
          displayName: z.string().min(1, "請輸入顯示名稱").max(40),
        }),
      );
      const email = body.email.toLowerCase().trim();
      const existing = await db.select({ id: users.userId }).from(users).where(eq(users.email, email)).limit(1);
      if (existing[0]) throw fail("AUTH_EMAIL_TAKEN");

      const novaId = await createUniqueNovaId();
      const inserted = await db
        .insert(users)
        .values({
          novaId,
          email,
          passwordHash: hashPassword(body.password),
          displayName: body.displayName.trim(),
          role: "student",
        })
        .returning({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, role: users.role });

      const user = inserted[0];
      await db.insert(userSettings).values({ userId: user.userId }).onConflictDoNothing();
      await ensureUserEconomy(user.userId);
      await ensureDailyTasks(user.userId);
      await notify({
        userId: user.userId,
        kind: "system",
        title: "🎉 歡迎加入 StudyNova！",
        body: `你的 NOVA ID 是 ${user.novaId}，把它分享給同學就能加好友。`,
        link: "/onboarding",
        dedupeKey: `welcome:${user.userId}`,
      });
      await createSession(user.userId, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent") ?? "" });
      return { userId: user.userId, novaId: user.novaId, displayName: user.displayName, role: user.role, onboarded: false };
    },
  }),

  route({
    method: "POST",
    path: "/auth/login",
    auth: "none",
    rate: { limit: 15, windowSec: 300, key: "login" },
    handler: async (ctx) => {
      const body = await ctx.json(
        z.object({ identifier: z.string().min(3, "請輸入 NOVA ID 或 Email").max(180), password: z.string().min(1).max(128) }),
      );
      const identifier = body.identifier.trim();
      const isEmail = identifier.includes("@");
      const rows = await db
        .select()
        .from(users)
        .where(isEmail ? eq(users.email, identifier.toLowerCase()) : eq(users.novaId, identifier.toUpperCase()))
        .limit(1);
      const user = rows[0];
      // Generic error – never disclose whether the account exists.
      const generic = fail("AUTH_INVALID_CREDENTIALS");
      if (!user) {
        hashPassword("timing-equalizer");
        throw generic;
      }
      if (!verifyPassword(body.password, user.passwordHash)) throw generic;
      if (user.status === "blocked") throw fail("AUTH_ACCOUNT_BLOCKED");

      await ensureUserEconomy(user.userId);
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.userId, user.userId));
      await createSession(user.userId, { ip: ctx.ip, userAgent: ctx.req.headers.get("user-agent") ?? "" });
      return { userId: user.userId, novaId: user.novaId, displayName: user.displayName, role: user.role, onboarded: user.onboarded };
    },
  }),

  route({
    method: "POST",
    path: "/auth/logout",
    auth: "optional",
    handler: async () => {
      await destroySession();
      return { loggedOut: true };
    },
  }),

  route({
    method: "GET",
    path: "/auth/me",
    auth: "optional",
    handler: async () => {
      const session = await getSession();
      if (!session) return { user: null };
      const u = session.user;
      await ensureUserEconomy(u.userId);
      const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, u.userId)).limit(1))[0] ?? null;
      const profile = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, u.userId)).limit(1))[0] ?? null;
      const balance = await novaBalance(u.userId);
      return {
        user: { ...u, proExpiresAt: u.proExpiresAt },
        settings,
        novi: profile,
        nova: balance,
      };
    },
  }),

  route({
    method: "GET",
    path: "/auth/sessions",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db
        .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.userId, user.userId));
      return { sessions: rows };
    },
  }),

  route({
    method: "DELETE",
    path: "/auth/sessions/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(sessions).where(and(eq(sessions.id, ctx.params.id), eq(sessions.userId, user.userId)));
      return { revoked: true };
    },
  }),

  route({
    method: "POST",
    path: "/auth/password/forgot",
    auth: "none",
    rate: { limit: 5, windowSec: 900, key: "forgot" },
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ email: emailSchema }));
      const rows = await db.select().from(users).where(eq(users.email, body.email.toLowerCase().trim())).limit(1);
      const generic = { sent: true, message: "如果這個 Email 已註冊，我們已寄出重設連結。" } as Record<string, unknown>;
      if (!rows[0]) return generic;
      const token = randomToken(32);
      await db.insert(passwordResetTokens).values({
        userId: rows[0].userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      const link = `/reset-password?token=${token}`;
      await notify({
        userId: rows[0].userId,
        kind: "security",
        title: "🔐 密碼重設連結",
        body: "30 分鐘內有效，僅能使用一次。",
        link,
        dedupeKey: `reset:${token.slice(0, 12)}`,
      });
      // In dev / self-hosted mode without SMTP the link is returned so the owner can deliver it.
      if (process.env.SMTP_URL) return generic;
      return { ...generic, devResetLink: link };
    },
  }),

  route({
    method: "POST",
    path: "/auth/password/reset",
    auth: "none",
    rate: { limit: 10, windowSec: 900, key: "reset" },
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ token: z.string().min(10).max(200), password: passwordSchema }));
      const tokenHash = sha256(body.token);
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
        .limit(1);
      const record = rows[0];
      if (!record) throw fail("AUTH_RESET_TOKEN_INVALID");
      const used = await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.id, record.id), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });
      if (!used[0]) throw fail("AUTH_RESET_TOKEN_USED");
      await db.update(users).set({ passwordHash: hashPassword(body.password), updatedAt: new Date() }).where(eq(users.userId, record.userId));
      await db.delete(sessions).where(eq(sessions.userId, record.userId));
      return { reset: true };
    },
  }),

  route({
    method: "POST",
    path: "/auth/password/change",
    auth: "user",
    rate: { limit: 10, windowSec: 900 },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ current: z.string().min(1).max(128), next: passwordSchema }));
      const rows = await db.select().from(users).where(eq(users.userId, user.userId)).limit(1);
      if (!rows[0] || !verifyPassword(body.current, rows[0].passwordHash)) throw fail("AUTH_PASSWORD_WRONG");
      await db.update(users).set({ passwordHash: hashPassword(body.next), updatedAt: new Date() }).where(eq(users.userId, user.userId));
      return { changed: true };
    },
  }),

  route({
    method: "GET",
    path: "/account/nova-id-qr",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const origin = new URL(ctx.req.url).origin;
      const link = `${origin}/add-friend?novaId=${user.novaId}`;
      const svg = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#0b1120", light: "#ffffff" } });
      return { novaId: user.novaId, link, svg };
    },
  }),

  route({
    method: "GET",
    path: "/account/settings",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.insert(userSettings).values({ userId: user.userId }).onConflictDoNothing();
      const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1))[0];
      const quotas = await allFeatureStates(user.userId);
      return { settings, quotas };
    },
  }),

  route({
    method: "PATCH",
    path: "/account/settings",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          schoolLevel: z.enum(["junior", "senior"]).optional(),
          grade: z.number().int().min(1).max(3).optional(),
          dailyGoalMinutes: z.number().int().min(10).max(600).optional(),
          favoriteSubjects: z.array(z.string().max(20)).max(12).optional(),
          englishLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(),
          dailyWordCount: z.number().int().min(3).max(60).optional(),
          reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          aiReminderFrequency: z.enum(["low", "normal", "high"]).optional(),
          theme: z.enum(["dark", "light"]).optional(),
          reducedMotion: z.boolean().optional(),
        }),
      );
      await db.insert(userSettings).values({ userId: user.userId }).onConflictDoNothing();
      const updated = await db
        .update(userSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(userSettings.userId, user.userId))
        .returning();
      await db.update(users).set({ onboarded: true, updatedAt: new Date() }).where(eq(users.userId, user.userId));
      return { settings: updated[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/account/profile",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({ displayName: z.string().min(1).max(40).optional(), bio: z.string().max(200).optional() }),
      );
      const updated = await db
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.userId, user.userId))
        .returning({ displayName: users.displayName, bio: users.bio, novaId: users.novaId });
      return { profile: updated[0] };
    },
  }),

  route({
    method: "GET",
    path: "/account/overview",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const nova = (await db.select().from(novaAccounts).where(eq(novaAccounts.userId, user.userId)).limit(1))[0];
      const membership = (await db.select().from(memberships).where(eq(memberships.userId, user.userId)).limit(1))[0];
      const novi = (await db.select().from(assistantProfiles).where(eq(assistantProfiles.userId, user.userId)).limit(1))[0];
      return { nova, membership, novi };
    },
  }),

  route({
    method: "DELETE",
    path: "/account",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ password: z.string().min(1) }));
      const rows = await db.select().from(users).where(eq(users.userId, user.userId)).limit(1);
      if (!rows[0] || !verifyPassword(body.password, rows[0].passwordHash)) throw fail("AUTH_PASSWORD_WRONG");
      if (rows[0].role === "owner") throw fail("AUTH_OWNER_PROTECTED");
      await db.delete(users).where(eq(users.userId, user.userId));
      await destroySession();
      return { deleted: true };
    },
  }),

  route({
    method: "GET",
    path: "/users/:novaId/public",
    auth: "user",
    handler: async (ctx) => {
      const rows = await db
        .select({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, bio: users.bio, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.novaId, ctx.params.novaId.toUpperCase()))
        .limit(1);
      if (!rows[0]) throw fail("ACCT_NOT_FOUND");
      const novi = (await db.select({ level: assistantProfiles.level, xp: assistantProfiles.xp, skin: assistantProfiles.skin, core: assistantProfiles.core, effect: assistantProfiles.effect, float: assistantProfiles.float, title: assistantProfiles.title, badge: assistantProfiles.badge }).from(assistantProfiles).where(eq(assistantProfiles.userId, rows[0].userId)).limit(1))[0];
      const inventory = await db.select({ code: assistantItems.code, name: assistantItems.name, category: assistantItems.category }).from(assistantInventory).innerJoin(assistantItems, eq(assistantItems.id, assistantInventory.itemId)).where(eq(assistantInventory.userId, rows[0].userId));
      const m = (await db.select().from(memberships).where(eq(memberships.userId, rows[0].userId)).limit(1))[0];
      const isPro = m?.tier === "pro" && (!m.expiresAt || new Date(m.expiresAt) > new Date());
      return { profile: { ...rows[0], ...novi, level: novi?.level ?? 1, xp: novi?.xp ?? 0, isPro: Boolean(isPro), inventory } };
    },
  }),
];
