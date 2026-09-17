export type TextbookDatabaseFailure = "missing_table_or_column" | "invalid_uuid_or_value" | "foreign_key" | "not_null" | "unknown";

export function classifyTextbookDatabaseError(error: unknown): TextbookDatabaseFailure {
  const current = error as { code?: unknown; message?: unknown; cause?: unknown } | null;
  const code = current && typeof current === "object" ? String(current.code ?? "") : "";
  const message = current && typeof current === "object" ? String(current.message ?? "") : String(error ?? "");
  if (code === "42P01" || code === "42703") return "missing_table_or_column";
  if (code === "22P02") return "invalid_uuid_or_value";
  if (code === "23503") return "foreign_key";
  if (code === "23502") return "not_null";
  if (/column .* does not exist|relation .* does not exist/i.test(message)) return "missing_table_or_column";
  if (current?.cause && current.cause !== error) return classifyTextbookDatabaseError(current.cause);
  return "unknown";
}
