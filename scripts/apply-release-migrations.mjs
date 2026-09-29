import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const releaseMigrations = [
  "0083_generation_share_reading_bot.sql",
  "0084_pk_bot_system_identities.sql",
  "0085_pk_matchmaking_schema_repair.sql",
  "0086_queue_worker_leases.sql",
  "0087_quiz_history_user_fk_repair.sql",
  "0088_focus_timer_sessions.sql",
  "0089_focus_sessions_completed_at_repair.sql",
  "0090_ai_solution_upload_quota.sql",
  "0091_version_center_feature_gates.sql",
  "0092_maintenance_announcement_history.sql",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to apply the StudyNova release migrations.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
const lockKey = "studynova-release-migrations-v1";

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS studynova_release_migrations (
      name text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applyMigration = async (name) => {
    const sql = await readFile(resolve("drizzle", name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query("SELECT sha256 FROM studynova_release_migrations WHERE name = $1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== sha256) {
        throw new Error(`Applied migration checksum mismatch: ${name}. Restore the original file or add a new migration.`);
      }
      console.log(`Already applied: ${name}`);
      return;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO studynova_release_migrations (name, sha256) VALUES ($1, $2)", [name, sha256]);
      await client.query("COMMIT");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Failed migration ${name}: ${error instanceof Error ? error.message : "unknown database error"}`);
    }
  };

  for (const name of releaseMigrations) {
    // 0088 alters completed_at but older supported baselines may not have it.
    // Apply the forward-only 0089 repair first, keeping 0088's published checksum unchanged.
    if (name === "0088_focus_timer_sessions.sql") {
      await applyMigration("0089_focus_sessions_completed_at_repair.sql");
    }
    await applyMigration(name);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration runner failed.");
  process.exitCode = 1;
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
  } catch {
    // Connection may not have been established.
  }
  await client.end().catch(() => undefined);
}
