import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = await readFile(new URL("../drizzle/0042_ai_solution_permission.sql", import.meta.url), "utf8");
const client = new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Applied 0042_ai_solution_permission.sql");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Failed to apply ai_solution migration", { code: error?.code ?? "UNKNOWN", message: String(error?.message ?? "unknown").slice(0, 240) });
  process.exitCode = 1;
} finally {
  await client.end();
}
