import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export type MaintenanceState = {
  enabled: boolean;
  title: string;
  description: string;
  badgeText: string;
  estimatedRecoveryAt: string | null;
  notice: string;
  startedAt: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  title: "系統施工中",
  description: "StudyNova 目前正在進行系統維護與更新，暫時無法使用。",
  badgeText: "系統維護中，請稍候",
  estimatedRecoveryAt: null,
  notice: "請稍後再回來看看！",
  startedAt: null,
  updatedByName: null,
  updatedAt: null,
};

export function isStoredMaintenanceEnabled(value: Record<string, unknown>, hasRow: boolean): boolean {
  return hasRow && value.enabled === false;
}

export function maintenanceErrorDetails(state: { estimatedRecoveryAt: string | null; message: string }) {
  return { code: "SERVICE_MAINTENANCE", message: state.message, estimatedRecoveryAt: state.estimatedRecoveryAt };
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
    const value = (row?.value ?? {}) as Partial<MaintenanceState>;
    return {
      ...DEFAULT_STATE,
      ...value,
      // Existing service_control uses enabled=true for normal service and false for maintenance.
      enabled: isStoredMaintenanceEnabled(value, Boolean(row)),
      estimatedRecoveryAt: value.estimatedRecoveryAt ?? null,
      startedAt: value.startedAt ?? null,
      updatedByName: value.updatedByName ?? null,
      updatedAt: row?.updatedAt?.toISOString?.() ?? value.updatedAt ?? null,
    };
  } catch {
    // A settings read failure must not lock the entire site for every user.
    return DEFAULT_STATE;
  }
}

export function maintenanceDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}
