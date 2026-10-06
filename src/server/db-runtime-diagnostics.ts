import type { Pool, PoolClient } from "pg";
import { databaseTarget } from "./db-diagnostics";

export type DbRuntimeStage =
  | "connection_attempt"
  | "connection_success"
  | "connection_timeout"
  | "connection_error"
  | "query_success"
  | "query_timeout";

export type DbRuntimeDiagnostic = {
  environment: "production" | "preview" | "development" | "unknown";
  databaseConfigured: boolean;
  target: { host: string; database: string; schema: string };
  stages: Array<{ stage: DbRuntimeStage; at: string; latencyMs?: number; errorType?: string }>;
  connection: "success" | "timeout" | "error";
  query: "success" | "timeout" | "error" | "not_attempted";
  latencyMs: number;
  pool: { total: number; idle: number; waiting: number };
};

const DIAGNOSTIC_TIMEOUT_MS = 8_000;

function environment(): DbRuntimeDiagnostic["environment"] {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  if (process.env.NODE_ENV === "development") return "development";
  return "unknown";
}

function safeErrorType(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (/timeout|timed out|etimedout|pool/i.test(lower)) return /pool/i.test(lower) ? "pool timeout" : "timeout";
  if (/refused|econnrefused/i.test(lower)) return "connection refused";
  if (/enotfound|getaddrinfo|dns/i.test(lower)) return "DNS failure";
  if (/password|authentication|28p01/i.test(lower)) return "authentication failed";
  if (/ssl|certificate|tls/i.test(lower)) return "SSL error";
  return "database error";
}

function targetWithSchema(configured: boolean) {
  const target = databaseTarget();
  return {
    host: configured ? target.host : "not-configured",
    database: configured ? target.database : "unknown",
    schema: "public",
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error("database diagnostic timeout"));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function diagnoseDatabaseRuntime(pool: Pool): Promise<DbRuntimeDiagnostic> {
  const started = Date.now();
  const configured = Boolean(process.env.DATABASE_URL?.trim());
  const stages: DbRuntimeDiagnostic["stages"] = [];
  const mark = (stage: DbRuntimeStage, extra: Partial<DbRuntimeDiagnostic["stages"][number]> = {}) => stages.push({ stage, at: new Date().toISOString(), ...extra });
  const base = { environment: environment(), databaseConfigured: configured, target: targetWithSchema(configured), stages, connection: "error" as const, query: "not_attempted" as const, latencyMs: 0, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  if (!configured) return { ...base, latencyMs: Date.now() - started };

  mark("connection_attempt");
  let client: PoolClient | undefined;
  try {
    client = await withTimeout<PoolClient>(pool.connect(), DIAGNOSTIC_TIMEOUT_MS, () => mark("connection_timeout", { errorType: "timeout" }));
    mark("connection_success", { latencyMs: Date.now() - started });
  } catch (error) {
    const errorType = safeErrorType(error);
    mark(errorType === "timeout" || errorType === "pool timeout" ? "connection_timeout" : "connection_error", { errorType });
    const connectionErrorType = stages.at(-1)?.errorType ?? safeErrorType(error);
    return { ...base, connection: connectionErrorType === "timeout" || connectionErrorType === "pool timeout" ? "timeout" : "error", latencyMs: Date.now() - started, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  }

  if (!client) return { ...base, connection: "error", latencyMs: Date.now() - started, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };

  try {
    await withTimeout(client.query("SELECT 1"), DIAGNOSTIC_TIMEOUT_MS, () => mark("query_timeout", { errorType: "timeout" }));
    mark("query_success", { latencyMs: Date.now() - started });
    return { ...base, connection: "success", query: "success", latencyMs: Date.now() - started, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  } catch (error) {
    if (!stages.some((stage) => stage.stage === "query_timeout")) mark("query_timeout", { errorType: safeErrorType(error) });
    const queryErrorType = stages.at(-1)?.errorType ?? safeErrorType(error);
    return { ...base, connection: "success", query: queryErrorType === "timeout" || queryErrorType === "pool timeout" ? "timeout" : "error", latencyMs: Date.now() - started, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  } finally {
    client.release();
  }
}
