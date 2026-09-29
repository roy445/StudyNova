import { describe, expect, it } from "vitest";
import { isStoredMaintenanceEnabled, maintenanceDateLabel, maintenanceErrorDetails } from "@/server/maintenance";
import { isAdminRole } from "@/server/auth";
import { maintenanceCategoryLabel, normalizeMaintenanceCategory } from "@/lib/maintenance";

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

  it("formats maintenance timestamps in Taipei time rather than the server timezone", () => {
    expect(maintenanceDateLabel("2026-10-01T04:00:00.000Z")).toBe("2026/10/01 12:00:00");
  });

  it("supports maintenance categories and safely defaults legacy values", () => {
    expect(maintenanceCategoryLabel("maintenance")).toBe("系統維護");
    expect(maintenanceCategoryLabel("repair")).toBe("系統修復");
    expect(maintenanceCategoryLabel("major_release")).toBe("重大版本更新");
    expect(normalizeMaintenanceCategory("legacy-value")).toBe("maintenance");
  });

  it("only recognizes supported administrator roles for the emergency entry", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
    expect(isAdminRole("student")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
