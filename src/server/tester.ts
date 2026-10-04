import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { featurePermissions, users } from "@/db/schema";
import type { AuthUser } from "./auth";
import { forbidden } from "./core";

export const TESTER_GROUP_NAME = "測試員";

export async function enrollTesterUser(userId: string) {
  await db.update(users).set({ role: "tester", updatedAt: new Date() }).where(eq(users.userId, userId));
  return true;
}

export async function isTesterUser(userId: string) {
  const rows = await db.select({ id: users.userId }).from(users).where(and(eq(users.userId, userId), eq(users.role, "tester"))).limit(1);
  return Boolean(rows[0]);
}

/** Server-side Beta gate. Owners/admins bypass the tester membership check. */
export async function requireTesterBeta(user: AuthUser, feature: string) {
  if (user.role === "admin" || user.role === "owner") return;
  if (!(await isTesterUser(user.userId))) throw forbidden("這項 AI 相機新版功能目前只開放給測試員。");
  const permission = (await db.select({ enabled: featurePermissions.enabled, testerEnabled: featurePermissions.testerEnabled })
    .from(featurePermissions)
    .where(eq(featurePermissions.feature, feature))
    .limit(1))[0];
  if (!permission?.enabled || !permission.testerEnabled) throw forbidden("這項 AI 相機 Beta 功能目前尚未開放。");
}

export async function testerFeatures() {
  return db.select({
    feature: featurePermissions.feature,
    label: featurePermissions.label,
    category: featurePermissions.category,
    enabled: featurePermissions.enabled,
    testerEnabled: featurePermissions.testerEnabled,
    testerDescription: featurePermissions.testerDescription,
  }).from(featurePermissions).where(and(eq(featurePermissions.enabled, true), eq(featurePermissions.testerEnabled, true))).orderBy(asc(featurePermissions.category), asc(featurePermissions.label));
}

export async function testerMembers() {
  return db.select({
    userId: users.userId,
    novaId: users.novaId,
    displayName: users.displayName,
    email: users.email,
    status: users.status,
  }).from(users)
    .where(and(eq(users.role, "tester"), eq(users.status, "active")))
    .orderBy(asc(users.displayName));
}
