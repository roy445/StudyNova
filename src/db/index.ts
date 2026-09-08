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

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: secureDatabaseUrl(databaseUrl),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
