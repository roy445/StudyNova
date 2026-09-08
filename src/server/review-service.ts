import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningEvents, reviewItems } from "@/db/schema";
import { randomToken } from "./core";
import { initialReviewState, scheduleReview, type ReviewRating } from "./review-scheduler";

export async function ensureReviewItem(params: {
  userId: string;
  contentType: string;
  contentId: string;
  conceptId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const initial = initialReviewState();
  await db.insert(reviewItems).values({
    userId: params.userId,
    contentType: params.contentType,
    contentId: params.contentId,
    conceptId: params.conceptId ?? null,
    dueAt: initial.dueAt,
    metadata: params.metadata ?? {},
  }).onConflictDoNothing();
  return (await db.select().from(reviewItems).where(and(eq(reviewItems.userId, params.userId), eq(reviewItems.contentType, params.contentType), eq(reviewItems.contentId, params.contentId))).limit(1))[0];
}

export async function recordReviewOutcome(params: {
  userId: string;
  contentType: string;
  contentId: string;
  rating: ReviewRating;
  responseTimeMs?: number;
  hintUsed?: boolean;
  confidence?: number | null;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const item = await ensureReviewItem({ userId: params.userId, contentType: params.contentType, contentId: params.contentId, metadata: params.metadata });
  if (!item || item.state === "suspended") return null;
  const now = new Date();
  const next = scheduleReview(item, params.rating, now);
  const updated = await db.update(reviewItems).set({ ...next, updatedAt: now }).where(eq(reviewItems.id, item.id)).returning();
  await db.insert(learningEvents).values({
    userId: params.userId,
    eventType: "review",
    objectType: params.contentType,
    objectId: params.contentId,
    conceptId: item.conceptId,
    occurredAt: now,
    responseTimeMs: params.responseTimeMs ?? 0,
    correct: params.rating !== "again",
    hintUsed: params.hintUsed ?? false,
    confidence: params.confidence ?? null,
    source: params.source ?? "review",
    idempotencyKey: `review:${item.id}:${now.getTime()}:${randomToken()}`,
    metadata: { ...(params.metadata ?? {}), rating: params.rating, reviewItemId: item.id },
  });
  return updated[0] ?? null;
}
