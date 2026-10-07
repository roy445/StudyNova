import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("users.is_system production schema repair", () => {
  it("uses an idempotent forward-only SQL repair", async () => {
    const sql = await readFile("drizzle/0108_users_system_column_repair.sql", "utf8");
    expect(sql).toMatch(/ALTER TABLE users/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false/i);
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|RENAME COLUMN/i);
  });

  it("is included in the release migration runner", async () => {
    const runner = await readFile("scripts/apply-release-migrations.mjs", "utf8");
    expect(runner).toContain('"0108_users_system_column_repair.sql"');
  });
});
