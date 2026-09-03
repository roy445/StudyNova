import { and, desc, eq, isNull, sql } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { notifications, pushSubscriptions, users, memberships, groupMembers } from "@/db/schema";

let vapidReady = false;

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureVapid() {
  if (vapidReady || !pushConfigured()) return pushConfigured();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@studynova.ai",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
  return true;
}

export type NotifyInput = {
  userId: string;
  kind?: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
  push?: boolean;
  vibrate?: number[];
};

/** Idempotent notification insert (dedupeKey prevents duplicates). */
export async function notify(input: NotifyInput): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind ?? "system",
      title: input.title.slice(0, 160),
      body: (input.body ?? "").slice(0, 800),
      link: input.link ?? "",
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  const created = Boolean(rows[0]);
  if (created && input.push) await sendPush(input.userId, { title: input.title, body: input.body ?? "", link: input.link ?? "/", vibrate: input.vibrate ?? [120, 60, 120] });
  return created;
}

export async function sendPush(userId: string, payload: { title: string; body: string; link: string; vibrate?: number[] }) {
  if (!ensureVapid()) return { sent: 0, configured: false };
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    }
  }
  return { sent, configured: true };
}

export async function resolveAudience(audience: string, audienceIds: string[]): Promise<string[]> {
  if (audience === "users") return audienceIds;
  if (audience === "admin") {
    const rows = await db.select({ userId: users.userId }).from(users).where(and(eq(users.status, "active"), sql`${users.role} in ('admin', 'owner')`));
    return rows.map((r) => r.userId);
  }
  if (audience === "pro") {
    const rows = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.tier, "pro"), sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`));
    return rows.map((r) => r.userId);
  }
  if (audience === "group") {
    if (!audienceIds.length) return [];
    const rows = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(sql`${groupMembers.groupId} = any(${sql.raw(`ARRAY[${audienceIds.map((i) => `'${i.replace(/'/g, "")}'`).join(",")}]::uuid[]`)})`);
    return [...new Set(rows.map((r) => r.userId))];
  }
  const rows = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
  return rows.map((r) => r.userId);
}

export async function listNotifications(userId: string, limit = 30) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.count ?? 0;
}

export async function markRead(userId: string, notificationId?: string) {
  if (notificationId) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.id, notificationId)));
  } else {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
}
