import { describe, expect, it } from "vitest";
import { formatTaipeiDateTime } from "@/lib/date-time";

describe("formatTaipeiDateTime", () => {
  it("formats timestamps in Asia/Taipei with seconds", () => {
    expect(formatTaipeiDateTime("2026-09-29T00:00:00.000Z")).toBe("2026/09/29 08:00:00");
  });

  it("handles missing or invalid values safely", () => {
    expect(formatTaipeiDateTime(null)).toBe("尚無時間資料");
    expect(formatTaipeiDateTime("not-a-date")).toBe("時間資料無效");
  });
});
