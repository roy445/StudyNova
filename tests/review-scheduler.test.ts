import { describe, expect, it } from "vitest";
import { initialReviewState, scheduleReview } from "@/server/review-scheduler";

describe("FSRS review scheduler", () => {
  it.each([
    ["again", "again"],
    ["hard", "hard"],
    ["good", "good"],
    ["easy", "easy"],
  ] as const)("schedules an %s review", (rating, expectedRating) => {
    const now = new Date("2026-09-08T00:00:00.000Z");
    const next = scheduleReview(initialReviewState(now), rating, now);
    expect(next.lastRating).toBe(expectedRating);
    expect(next.dueAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(next.reps).toBeGreaterThan(0);
    expect(next.stability).toBeGreaterThan(0);
    expect(next.difficulty).toBeGreaterThan(0);
    expect(next.retrievability).toBeGreaterThan(0);
  });

  it("makes Again earlier than Easy after a learned review", () => {
    const now = new Date("2026-09-08T00:00:00.000Z");
    const first = scheduleReview(initialReviewState(now), "good", now);
    const again = scheduleReview(first, "again", new Date("2026-09-09T00:00:00.000Z"));
    const easy = scheduleReview(first, "easy", new Date("2026-09-09T00:00:00.000Z"));
    expect(again.dueAt.getTime()).toBeLessThan(easy.dueAt.getTime());
    expect(again.lapses).toBeGreaterThanOrEqual(first.lapses);
  });
});
