import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AI question converter release migration", () => {
  const sql = readFileSync(resolve(process.cwd(), "drizzle/0121_ai_question_converter.sql"), "utf8");
  it("creates the job and item tables with ownership and expiry fields", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ai_question_converter_jobs"');
    expect(sql).toContain('"source_context_id" uuid');
    expect(sql).toContain('"expires_at" timestamptz');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ai_question_converter_items"');
  });
  it("seeds one canonical feature key and backend defaults", () => {
    expect(sql).toContain("'ai_question_converter'");
    expect(sql).toContain('"freeDailyLimit":3');
    expect(sql).toContain('"proDailyLimit":20');
  });
});
