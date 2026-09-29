import { describe, expect, it } from "vitest";
import { getMaintenanceCountdownParts } from "@/lib/maintenance";

describe("maintenance countdown", () => {
  const target = "2026-10-01T04:00:00.000Z";

  it("calculates days, hours, minutes, and seconds from one absolute target", () => {
    const now = Date.parse(target) - ((1 * 86_400 + 2 * 3_600 + 3 * 60 + 4) * 1_000);
    expect(getMaintenanceCountdownParts(target, now)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4, expired: false });
  });

  it("returns zero after the target time without producing negative values", () => {
    expect(getMaintenanceCountdownParts(target, Date.parse(target) + 5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
  });

  it("does not invent a fallback target when time is unset or invalid", () => {
    expect(getMaintenanceCountdownParts(null, Date.now())).toBeNull();
    expect(getMaintenanceCountdownParts("invalid", Date.now())).toBeNull();
  });
});
