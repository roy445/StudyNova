export type TextbookDatabaseFailure = "missing_table_or_column" | "invalid_uuid_or_value" | "foreign_key" | "not_null" | "unknown";

export function classifyTextbookDatabaseError(error: unknown): TextbookDatabaseFailure {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "42P01" || code === "42703") return "missing_table_or_column";
  if (code === "22P02") return "invalid_uuid_or_value";
  if (code === "23503") return "foreign_key";
  if (code === "23502") return "not_null";
  return "unknown";
}
