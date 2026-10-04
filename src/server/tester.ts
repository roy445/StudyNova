import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { featurePermissions, identityGroupMembers, identityGroups, users } from "@/db/schema";
import type { AuthUser } from "./auth";
import { forbidden } from "./core";

export const TESTER_GROUP_NAME = "測試員";

export async function ensureTesterGroup(createdBy: string) {
  const existing = (await db.select().from(identityGroups).where(eq(identityGroups.name, TESTER_GROUP_NAME)).limit(1))[0];
  if (existing) return existing;
  try {
    const rows = await db.insert(identityGroups).values({
      name: TESTER_GROUP_NAME,
      description: "可提前體驗指定 Beta 功能、回報問題並協助驗證版本的測試身分。",
      badge: "TESTER",
      color: "#a78bfa",
      enabled: true,
      createdBy,
    }).returning();
    return rows[0];
  } catch {
    return (await db.select().from(identityGroups).where(eq(identityGroups.name, TESTER_GROUP_NAME)).limit(1))[0] ?? null;
  }
}

export async function isTesterUser(userId: string) {
  const rows = await db.select({ id: identityGroupMembers.userId })
    .from(identityGroupMembers)
    .innerJoin(identityGroups, eq(identityGroups.id, identityGroupMembers.identityGroupId))
    .where(and(eq(identityGroupMembers.userId, userId), eq(identityGroups.name, TESTER_GROUP_NAME), eq(identityGroups.enabled, true)))
    .limit(1);
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

export async function testerMembers(groupId: string) {
  return db.select({
    userId: users.userId,
    novaId: users.novaId,
    displayName: users.displayName,
    email: users.email,
    status: users.status,
    joinedAt: identityGroupMembers.joinedAt,
  }).from(identityGroupMembers)
    .innerJoin(users, eq(users.userId, identityGroupMembers.userId))
    .where(eq(identityGroupMembers.identityGroupId, groupId))
    .orderBy(asc(users.displayName));
}
