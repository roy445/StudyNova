export type DatabaseDiagnostics = {
  code?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

export type DatabaseErrorKind = "schema" | "unavailable" | "other";

const SQLSTATE = /^[0-9A-Z]{5}$/;
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "42704"]);
const CONNECTION_ERROR_PREFIXES = ["08"];
const CONNECTION_ERROR_CODES = new Set(["57P01", "57P02", "57P03", "53300"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Walk common Drizzle/driver cause wrappers and copy only safe, structured fields. */
export function extractDatabaseDiagnostics(error: unknown): DatabaseDiagnostics | null {
  let current: unknown = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 6 && isRecord(current) && !visited.has(current); depth += 1) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const rawCode = record.code;
    if (typeof rawCode === "string" && SQLSTATE.test(rawCode)) {
      const diagnostics: DatabaseDiagnostics = { code: rawCode };
      const aliases = {
        schema: ["schema", "schema_name"],
        table: ["table", "table_name"],
        column: ["column", "column_name"],
        constraint: ["constraint", "constraint_name"],
      } as const;
      for (const key of Object.keys(aliases) as (keyof typeof aliases)[]) {
        const value = aliases[key].map((alias) => record[alias]).find((candidate) => typeof candidate === "string");
        if (typeof value === "string" && /^[a-zA-Z0-9_]{1,128}$/.test(value)) diagnostics[key] = value;
      }
      const message = typeof record.message === "string" ? record.message : "";
      if (!diagnostics.column) {
        const column = /column "([a-zA-Z0-9_]{1,128})" does not exist/i.exec(message)?.[1];
        if (column) diagnostics.column = column;
      }
      if (!diagnostics.table) {
        const relation = /relation "([a-zA-Z0-9_]{1,128})" does not exist/i.exec(message)?.[1];
        if (relation) diagnostics.table = relation;
      }
      return diagnostics;
    }
    current = record.cause ?? record.originalError ?? record.original ?? record.driverError;
  }
  return null;
}

export function classifyDatabaseError(error: unknown): DatabaseErrorKind {
  const code = extractDatabaseDiagnostics(error)?.code;
  if (!code) {
    const message = databaseErrorMessage(error).toLowerCase();
    if (/connection terminated|connection refused|connection reset|timeout|timed out|econn|socket|too many clients|server closed/i.test(message)) return "unavailable";
    if (/failed query|relation .* does not exist|column .* does not exist|schema/i.test(message)) return "schema";
    return "other";
  }
  if (SCHEMA_ERROR_CODES.has(code)) return "schema";
  if (CONNECTION_ERROR_CODES.has(code) || CONNECTION_ERROR_PREFIXES.some((prefix) => code.startsWith(prefix))) return "unavailable";
  return "other";
}

export function databaseErrorMessage(error: unknown) {
  let current: unknown = error;
  const visited = new Set<unknown>();
  const messages: string[] = [];
  for (let depth = 0; depth < 6 && isRecord(current) && !visited.has(current); depth += 1) {
    visited.add(current);
    if (typeof current.message === "string" && current.message.trim()) messages.push(current.message.trim());
    current = current.cause ?? current.originalError ?? current.original ?? current.driverError;
  }
  return (messages.join(" | ") || "unknown error").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-db-url]").slice(0, 240);
}
