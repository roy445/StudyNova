export const MAINTENANCE_CATEGORIES = ["maintenance", "repair", "major_release"] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  maintenance: "系統維護",
  repair: "系統修復",
  major_release: "重大版本更新",
};

export function normalizeMaintenanceCategory(value: unknown): MaintenanceCategory {
  return MAINTENANCE_CATEGORIES.includes(value as MaintenanceCategory)
    ? (value as MaintenanceCategory)
    : "maintenance";
}

export function maintenanceCategoryLabel(value: unknown): string {
  return MAINTENANCE_CATEGORY_LABELS[normalizeMaintenanceCategory(value)];
}

export type MaintenanceCountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

export function getMaintenanceCountdownParts(
  estimatedRecoveryAt: string | null | undefined,
  nowMs: number,
): MaintenanceCountdownParts | null {
  if (!estimatedRecoveryAt) return null;
  const targetMs = Date.parse(estimatedRecoveryAt);
  if (!Number.isFinite(targetMs)) return null;
  const remainingSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return { days, hours, minutes, seconds, expired: remainingSeconds === 0 };
}
