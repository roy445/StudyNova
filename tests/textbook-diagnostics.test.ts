import { describe, expect, it } from "vitest";
import { classifyTextbookDatabaseError } from "../src/server/textbook-diagnostics";

describe("admin textbook database diagnostics", () => {
  it("classifies the production missing-column failure", () => {
    expect(classifyTextbookDatabaseError({ code: "42703", message: 'column "description" does not exist' })).toBe("missing_table_or_column");
    expect(classifyTextbookDatabaseError({ message: "Failed query", cause: { code: "42703", message: 'column "ocr_status" does not exist' } })).toBe("missing_table_or_column");
  });

  it.each([
    ["42P01", "missing_table_or_column"],
    ["22P02", "invalid_uuid_or_value"],
    ["23503", "foreign_key"],
    ["23502", "not_null"],
  ] as const)("classifies PostgreSQL error %s", (code, expected) => {
    expect(classifyTextbookDatabaseError({ code })).toBe(expected);
  });

  it("does not expose arbitrary errors as a known database category", () => {
    expect(classifyTextbookDatabaseError(new Error("unexpected failure"))).toBe("unknown");
  });
});
