import { describe, expect, it } from "vitest";
import { isStoredMaintenanceEnabled, maintenanceErrorDetails } from "@/server/maintenance";

describe("maintenance mode", () => {
  it("defaults to normal service when no persisted setting exists", () => {
    expect(isStoredMaintenanceEnabled({}, false)).toBe(false);
    expect(isStoredMaintenanceEnabled({ enabled: true }, true)).toBe(false);
  });

  it("activates only when the persisted service setting explicitly disables service", () => {
    expect(isStoredMaintenanceEnabled({ enabled: false }, true)).toBe(true);
    expect(isStoredMaintenanceEnabled({ enabled: "false" }, true)).toBe(false);
  });

  it("returns machine-readable maintenance details without changing authentication state", () => {
    expect(maintenanceErrorDetails({
      message: "系統施工中，請稍後再回來看看！",
      estimatedRecoveryAt: "2026-09-15T15:00:00.000Z",
    })).toEqual({
      code: "SERVICE_MAINTENANCE",
      message: "系統施工中，請稍後再回來看看！",
      estimatedRecoveryAt: "2026-09-15T15:00:00.000Z",
    });
  });
});
