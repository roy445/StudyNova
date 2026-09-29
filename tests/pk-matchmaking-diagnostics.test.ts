import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { pkMatchmakingQueue } from "@/db/schema";
import { ApiRequestError } from "@/lib/api";
import { classifyDatabaseError, extractDatabaseDiagnostics } from "@/server/db-diagnostics";
import { ERROR_CATALOG, fail } from "@/server/errors";

describe("PK matchmaking production schema contract", () => {
  it("defines stable typed diagnostics for matchmaking and schema drift", () => {
    expect(ERROR_CATALOG.PK_MATCHMAKING_STORAGE_ERROR.category).toBe("PK");
    expect(ERROR_CATALOG.PK_MATCHMAKING_STORAGE_ERROR.code).toBe("SN-PK-9716");
    expect(ERROR_CATALOG.SYS_DB_SCHEMA_MISMATCH.category).toBe("SYS");
    const error = fail("SYS_DB_SCHEMA_MISMATCH", { requestId: "REQ-TEST-1234" });
    expect(error.toJSON().requestId).toBe("REQ-TEST-1234");
    const displayed = new ApiRequestError({ code: "SN-PK-9716", message: "配對暫時無法使用", hint: "請稍後重試", requestId: "REQ-TEST-1234" }, 503).display;
    expect(displayed).toContain("SN-PK-9716");
    expect(displayed).toContain("請稍後重試");
    expect(displayed).toContain("REQ-TEST-1234");
  });

  it("maps every ORM column to the deployed queue migration names", () => {
    const names = getTableConfig(pkMatchmakingQueue).columns.map((column) => column.name);
    expect(names).toEqual([
      "id", "user_id", "match_type", "subject", "grade", "unit", "difficulty",
      "question_count", "question_time_sec", "question_bank_id", "status", "options",
      "joined_at", "last_heartbeat_at", "expires_at",
    ]);
    expect(names).not.toContain("created_at");
  });

  it("extracts only safe PostgreSQL diagnostics from wrapped driver errors", () => {
    const error = Object.assign(new Error("Failed query: SELECT secret_value FROM private_table"), {
      cause: Object.assign(new Error("column does not exist"), {
        code: "42703", table: "pk_matchmaking_queue", column: "created_at", constraint: "ignored_constraint",
      }),
    });
    expect(extractDatabaseDiagnostics(error)).toEqual({ code: "42703", table: "pk_matchmaking_queue", column: "created_at", constraint: "ignored_constraint" });
    expect(classifyDatabaseError(error)).toBe("schema");
  });

  it("maps Postgres.js snake_case undefined-column diagnostics", () => {
    const error = Object.assign(new Error("column does not exist"), {
      cause: Object.assign(new Error("driver error"), {
        code: "42703", schema_name: "public", table_name: "pk_bot_profiles", column_name: "enabled",
      }),
    });
    expect(extractDatabaseDiagnostics(error)).toEqual({ code: "42703", schema: "public", table: "pk_bot_profiles", column: "enabled" });
  });

  it("recognizes temporary database connectivity failures", () => {
    const error = Object.assign(new Error("connection lost"), { code: "08006" });
    expect(classifyDatabaseError(error)).toBe("unavailable");
    expect(extractDatabaseDiagnostics(error)).toEqual({ code: "08006" });
  });
});
