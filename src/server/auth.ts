import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, memberships, rateLimits } from "@/db/schema";
import { AppError, forbidden, randomToken, sha256, tooMany, unauthorized } from "./core";

export const SESSION_COOKIE = "sn_session";
// 使用明確 30 天長效 session，避免跨日被瀏覽器當成 session cookie 清除。
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  userId: string;
  novaId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  onboarded: boolean;
  isPro: boolean;
  proExpiresAt: Date | null;
};

export type SessionInfo = { user: AuthUser; sessionId: string };

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    expires: new Date(Date.now() + Math.max(0, maxAge) * 1000),
    priority: "high" as const,
  };
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    ip: (meta.ip ?? "").slice(0, 64),
    userAgent: (meta.userAgent ?? "").slice(0, 200),
    expiresAt,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

export async function getSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      rotatedAt: sessions.rotatedAt,
      sessionExpiresAt: sessions.expiresAt,
      userId: users.userId,
      novaId: users.novaId,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      onboarded: users.onboarded,
      tier: memberships.tier,
      expiresAt: memberships.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.userId, sessions.userId))
    .leftJoin(memberships, eq(memberships.userId, users.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.status === "blocked") return null;

  // 延長舊版本 cookie，讓已登入使用者不必因為舊的 14 天期限重新登入。
  try {
    store.set(SESSION_COOKIE, token, cookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
  } catch {
    /* read-only render context；API request 會在下一次請求更新 cookie */
  }
  if (new Date(row.sessionExpiresAt).getTime() < Date.now() + SESSION_TTL_MS / 2) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) }).where(and(eq(sessions.id, row.sessionId), eq(sessions.tokenHash, tokenHash)));
  }

  const proActive = row.tier === "pro" && (!row.expiresAt || new Date(row.expiresAt) > new Date());
  return {
    sessionId: row.sessionId,
    user: {
      userId: row.userId,
      novaId: row.novaId,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      status: row.status,
      onboarded: row.onboarded,
      isPro: Boolean(proActive),
      proExpiresAt: row.expiresAt ?? null,
    },
  };
}

export async function requireUser(): Promise<AuthUser> {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session.user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "owner") throw forbidden("需要管理員權限");
  return user;
}

export function assertOwner(ownerId: string | null | undefined, user: AuthUser) {
  if (!ownerId) throw forbidden();
  if (ownerId !== user.userId && user.role !== "owner" && user.role !== "admin") throw forbidden();
}

/** Strict ownership: even admins cannot read private student content. */
export function assertStrictOwner(ownerId: string | null | undefined, user: AuthUser) {
  if (!ownerId || ownerId !== user.userId) throw forbidden("這不是你的資料");
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/* --------------------------------------------------------- rate limit */

export async function rateLimit(bucketKey: string, limit: number, windowSec: number) {
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const rows = await db
    .insert(rateLimits)
    .values({ bucket: bucketKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if ((rows[0]?.count ?? 1) > limit) throw tooMany();
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export { AppError };
