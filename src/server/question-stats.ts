import { sql } from "drizzle-orm";
import { db } from "@/db";
import { questionUsageStats } from "@/db/schema";

export async function recordQuestionAppearance(questionId: string, count = 1) {
  try {
    await db.insert(questionUsageStats).values({ questionId, appearanceCount: count, lastAppearedAt: new Date() }).onConflictDoUpdate({
      target: questionUsageStats.questionId,
      set: {
        appearanceCount: sql`${questionUsageStats.appearanceCount} + ${count}`,
        lastAppearedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.warn("[question-stats] appearance write skipped", error instanceof Error ? error.message : error);
  }
}

export async function recordQuestionAnswer(questionId: string, correct: boolean, responseMs = 0) {
  try {
    await db.insert(questionUsageStats).values({ questionId, answerCount: 1, correctCount: correct ? 1 : 0, totalResponseMs: Math.max(0, responseMs), lastAnsweredAt: new Date() }).onConflictDoUpdate({
      target: questionUsageStats.questionId,
      set: {
        answerCount: sql`${questionUsageStats.answerCount} + 1`,
        correctCount: sql`${questionUsageStats.correctCount} + ${correct ? 1 : 0}`,
        totalResponseMs: sql`${questionUsageStats.totalResponseMs} + ${Math.max(0, responseMs)}`,
        lastAnsweredAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.warn("[question-stats] answer write skipped", error instanceof Error ? error.message : error);
  }
}
