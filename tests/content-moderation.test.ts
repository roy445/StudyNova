import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/0138_content_moderation.sql", "utf8");
const moderation = readFileSync("src/server/content-moderation.ts", "utf8");
const aiRoute = readFileSync("src/server/routes/ai-routes.ts", "utf8");
const teachingRoute = readFileSync("src/server/routes/teaching-room-routes.ts", "utf8");

 describe("content moderation safety contract", () => {
  it("stores full evidence, warning count and indexes", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "moderation_events"');
    expect(migration).toContain('"content_warning_count" integer NOT NULL DEFAULT 0');
    expect(migration).toContain('"content" text NOT NULL');
    expect(migration).toContain('"warning_number" integer NOT NULL DEFAULT 1');
    expect(migration).toContain("AI 對話與社群內容安全");
  });

  it("has a three-warning block gate and an appeal path", () => {
    expect(moderation).toContain("nextWarningCount >= 3");
    expect(moderation).toContain('status: "blocked"');
    expect(moderation).toContain("AUTH_ACCOUNT_BLOCKED");
    expect(moderation).toContain("moderationEventId");
    expect(aiRoute).toContain('channel: "ai_chat"');
    expect(teachingRoute).toContain('channel: "teaching_room"');
  });

  it("requires the bottom-of-chat safety reminder", () => {
    expect(aiRoute).toContain("moderationFooter");
    expect(teachingRoute).toContain("moderationFooter");
  });
});
