import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { formatTaipeiDateTime } from "@/lib/date-time";
import { normalizeMaintenanceCategory, type MaintenanceCategory } from "@/lib/maintenance";

export type MaintenanceState = {
  enabled: boolean;
  category: MaintenanceCategory;
  title: string;
  reason: string;
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
  category: "maintenance",
  title: "系統施工中",
  reason: "",
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

export function normalizeMaintenanceState(value: Record<string, unknown>, hasRow: boolean, updatedAt: string | null = null): MaintenanceState {
  return {
    ...DEFAULT_STATE,
    enabled: isStoredMaintenanceEnabled(value, hasRow),
    category: normalizeMaintenanceCategory(value.category),
    title: typeof value.title === "string" ? value.title : DEFAULT_STATE.title,
    reason: typeof value.reason === "string" ? value.reason : "",
    description: typeof value.description === "string" ? value.description : DEFAULT_STATE.description,
    badgeText: typeof value.badgeText === "string" ? value.badgeText : DEFAULT_STATE.badgeText,
    notice: typeof value.message === "string" ? value.message : typeof value.notice === "string" ? value.notice : DEFAULT_STATE.notice,
    estimatedRecoveryAt: typeof value.estimatedRecoveryAt === "string" ? value.estimatedRecoveryAt : null,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    updatedByName: typeof value.updatedByName === "string" ? value.updatedByName : null,
    updatedAt: updatedAt ?? (typeof value.updatedAt === "string" ? value.updatedAt : null),
  };
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
    const value = (row?.value ?? {}) as Record<string, unknown>;
    return normalizeMaintenanceState(value, Boolean(row), row?.updatedAt?.toISOString?.() ?? null);
  } catch {
    // A settings read failure must not lock the entire site for every user.
    return DEFAULT_STATE;
  }
}

export function maintenanceDateLabel(value: string | null): string | null {
  if (!value) return null;
  return formatTaipeiDateTime(value);
}
