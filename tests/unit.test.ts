import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateNovaId,
  fingerprint,
  toCsv,
  addDaysStr,
  daysBetween,
  isoWeekCode,
  trend,
  safeErrorMessage,
  nextUtcMonthStart,
} from "@/server/core";
import { fail, deriveErrorCode, lookupErrorCode, CATALOG_LIST, ERROR_CATALOG } from "@/server/errors";
import { extractJson } from "@/server/ai";
import { isWeekOpen } from "@/server/queue";

describe("password hashing", () => {
  it("verifies the correct password and rejects wrong ones", () => {
    const hash = hashPassword("Sup3r-Secret!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Sup3r-Secret!", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("never stores the plaintext password", () => {
    const hash = hashPassword("plaintext-check");
    expect(hash.includes("plaintext-check")).toBe(false);
  });
});

describe("NOVA ID", () => {
  it("uses the NV- prefix and safe alphabet", () => {
    const id = generateNovaId();
    expect(id).toMatch(/^NV-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("is unique across a large sample", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateNovaId()));
    expect(set.size).toBe(2000);
  });
});

describe("question fingerprint", () => {
  it("is stable regardless of whitespace/case", () => {
    expect(fingerprint("英文", " Hello  World ", "A")).toBe(fingerprint("英文", "hello world", "a"));
  });
  it("differs for different answers", () => {
    expect(fingerprint("英文", "Hello", "A")).not.toBe(fingerprint("英文", "Hello", "B"));
  });
});

describe("csv export", () => {
  it("writes a UTF-8 BOM and escapes separators", () => {
    const csv = toCsv([{ name: 'A,B"C', score: 90 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"A,B""C"');
  });
});

describe("date helpers", () => {
  it("adds days and measures distance", () => {
    expect(addDaysStr("2026-01-30", 3)).toBe("2026-02-02");
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  });
  it("produces ISO week codes", () => {
    expect(isoWeekCode(new Date("2026-08-26T00:00:00Z"))).toMatch(/^2026-W\d{2}$/);
  });
  it("computes the next UTC month start for AI cooldowns", () => {
    const next = nextUtcMonthStart(new Date("2026-03-15T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("trend detection", () => {
  it("detects rising, falling and volatile series", () => {
    expect(trend([68, 75, 81, 84])).toBe("up");
    expect(trend([90, 80, 70])).toBe("down");
    expect(trend([60, 90, 55, 92])).toBe("volatile");
  });
});

describe("error redaction", () => {
  it("hides secrets from surfaced messages", () => {
    expect(safeErrorMessage(new Error("invalid api key sk-123"))).toBe("系統發生錯誤，請稍後再試");
    expect(safeErrorMessage(fail("REQ_VALIDATION", { message: "請輸入標題" }))).toBe("請輸入標題");
  });
});

describe("AI json extraction", () => {
  it("parses fenced json blocks", () => {
    const out = extractJson<{ reply: string }>('```json\n{"reply":"hi"}\n```', { reply: "" });
    expect(out.reply).toBe("hi");
  });
  it("falls back safely on malformed payloads", () => {
    expect(extractJson<{ reply: string }>("not json at all", { reply: "fallback" }).reply).toBe("fallback");
  });
});

describe("weekly exam opening rules", () => {
  const base = { status: "published", openMode: "schedule", openDays: [6, 0], openTime: "00:00", closeTime: "23:59", openFrom: null, openUntil: null };

  it("never opens a draft week", () => {
    expect(isWeekOpen({ ...base, status: "draft" })).toBe(false);
  });
  it("respects manual close", () => {
    expect(isWeekOpen({ ...base, openMode: "manual_close" })).toBe(false);
  });
  it("supports manual open windows", () => {
    expect(
      isWeekOpen({
        ...base,
        openMode: "manual_open",
        openFrom: new Date(Date.now() - 3600_000),
        openUntil: new Date(Date.now() + 3600_000),
      }),
    ).toBe(true);
    expect(
      isWeekOpen({
        ...base,
        openMode: "manual_open",
        openFrom: new Date(Date.now() + 3600_000),
        openUntil: new Date(Date.now() + 7200_000),
      }),
    ).toBe(false);
  });
  it("is not hard-coded to Saturday – any weekday can be configured", () => {
    const everyDay = { ...base, openDays: [0, 1, 2, 3, 4, 5, 6] };
    expect(isWeekOpen(everyDay)).toBe(true);
    expect(isWeekOpen({ ...base, openDays: [] })).toBe(false);
  });
});


describe("error code system", () => {
  it("gives every catalog entry a unique SN- code", () => {
    const codes = CATALOG_LIST.map((d) => d.code);
    expect(codes.length).toBeGreaterThan(60);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^SN-[A-Z]+-\d{4}$/);
  });

  it("attaches code, hint, status and requestId to every AppError", () => {
    const err = fail("QUOTA_EXHAUSTED");
    expect(err.code).toBe(ERROR_CATALOG.QUOTA_EXHAUSTED.code);
    expect(err.status).toBe(429);
    expect(err.hint.length).toBeGreaterThan(0);
    expect(err.requestId).toMatch(/^REQ-[0-9A-F]{10}$/);
  });

  it("derives stable unique codes for undocumented messages", () => {
    const a = deriveErrorCode("REQ", "自訂錯誤訊息");
    const b = deriveErrorCode("REQ", "自訂錯誤訊息");
    const c = deriveErrorCode("REQ", "另一個錯誤訊息");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^SN-REQ-[0-9A-F]{4}$/);
  });

  it("can look documented codes up for the FAQ / manual", () => {
    expect(lookupErrorCode(ERROR_CATALOG.AI_NOT_CONFIGURED.code)?.category).toBe("AI");
    expect(lookupErrorCode("SN-NOPE-0000")).toBeNull();
  });
});
