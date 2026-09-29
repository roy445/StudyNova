import { describe, expect, it } from "vitest";
import { formatTaipeiDateTime, formatTaipeiDateTimeInput, parseTaipeiDateTimeInput } from "@/lib/date-time";

describe("formatTaipeiDateTime", () => {
  it("formats timestamps in Asia/Taipei with seconds", () => {
    expect(formatTaipeiDateTime("2026-09-29T00:00:00.000Z")).toBe("2026/09/29 08:00:00");
  });

  it("handles missing or invalid values safely", () => {
    expect(formatTaipeiDateTime(null)).toBe("尚無時間資料");
    expect(formatTaipeiDateTime("not-a-date")).toBe("時間資料無效");
  });

  it("round-trips Taiwan datetime-local values through UTC without an eight-hour shift", () => {
    expect(parseTaipeiDateTimeInput("2026-10-01T12:00")).toBe("2026-10-01T04:00:00.000Z");
    expect(formatTaipeiDateTimeInput("2026-10-01T04:00:00.000Z")).toBe("2026-10-01T12:00");
  });

  it("rejects malformed wall-clock values and treats an empty value as unset", () => {
    expect(parseTaipeiDateTimeInput("2026-02-30T12:00")).toBeNull();
    expect(parseTaipeiDateTimeInput("2026-10-01T25:00")).toBeNull();
    expect(parseTaipeiDateTimeInput("")).toBeNull();
    expect(formatTaipeiDateTimeInput("not-a-date")).toBe("");
  });
});
