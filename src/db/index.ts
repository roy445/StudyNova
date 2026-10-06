import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

function secureDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "postgres:" || url.protocol === "postgresql:") {
      // pg v9 will change the meaning of the legacy aliases. Keep today's
      // verify-full behaviour explicit so deployments remain secure.
      url.searchParams.set("sslmode", "verify-full");
      url.searchParams.delete("uselibpqcompat");
    }
    return url.toString();
  } catch {
    // Preserve the original driver error for non-standard connection strings.
    return value;
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// Vercel isolates can receive several requests before the isolate is recycled.
// One connection made dashboard reads and PK/background writes queue behind one
// another and can hit connectionTimeoutMillis during short Neon bursts.
const configuredMax = Number(process.env.PG_POOL_MAX ?? (process.env.VERCEL ? 3 : 5));
const poolMax = Number.isFinite(configuredMax) ? Math.min(10, Math.max(1, Math.floor(configuredMax))) : 3;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: secureDatabaseUrl(databaseUrl),
    max: poolMax,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
    allowExitOnIdle: true,
  });

globalForDb.__arenaNextJsPostgresqlPool = pool;
pool.on("error", (error) => {
  // A Neon connection can be closed while a serverless isolate is being
  // suspended. Handle it here so pg does not surface an uncaught exception.
  console.error("[db] pooled connection error", error instanceof Error ? error.message : error);
});

export const db = drizzle(pool);
