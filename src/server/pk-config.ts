import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export type PkConfig = {
  enabled: boolean;
  quickMatchEnabled: boolean;
  friendMatchEnabled: boolean;
  customRoomEnabled: boolean;
  publicArenaEnabled: boolean;
  allowedModes: string[];
  maxPlayers: number;
  minQuestions: number;
  maxQuestions: number;
  minTimeSec: number;
  maxTimeSec: number;
  defaultRewardNova: number;
  defaultRewardXp: number;
  activityId: string | null;
};

export const DEFAULT_PK_CONFIG: PkConfig = {
  enabled: true,
  quickMatchEnabled: true,
  friendMatchEnabled: true,
  customRoomEnabled: true,
  publicArenaEnabled: true,
  allowedModes: ["1v1", "2v2", "3v3", "多人"],
  maxPlayers: 12,
  minQuestions: 5,
  maxQuestions: 30,
  minTimeSec: 10,
  maxTimeSec: 90,
  defaultRewardNova: 20,
  defaultRewardXp: 40,
  activityId: null,
};

function clampConfig(value: Record<string, unknown>): PkConfig {
  const allowed = Array.isArray(value.allowedModes) ? value.allowedModes.filter((mode): mode is string => typeof mode === "string" && DEFAULT_PK_CONFIG.allowedModes.includes(mode)) : DEFAULT_PK_CONFIG.allowedModes;
  const minQuestions = Math.max(5, Math.min(50, Number(value.minQuestions ?? DEFAULT_PK_CONFIG.minQuestions)) || DEFAULT_PK_CONFIG.minQuestions);
  const maxQuestions = Math.max(minQuestions, Math.min(50, Number(value.maxQuestions ?? DEFAULT_PK_CONFIG.maxQuestions)) || DEFAULT_PK_CONFIG.maxQuestions);
  const minTimeSec = Math.max(5, Math.min(120, Number(value.minTimeSec ?? DEFAULT_PK_CONFIG.minTimeSec)) || DEFAULT_PK_CONFIG.minTimeSec);
  const maxTimeSec = Math.max(minTimeSec, Math.min(120, Number(value.maxTimeSec ?? DEFAULT_PK_CONFIG.maxTimeSec)) || DEFAULT_PK_CONFIG.maxTimeSec);
  return {
    ...DEFAULT_PK_CONFIG,
    ...value,
    enabled: value.enabled !== false,
    quickMatchEnabled: value.quickMatchEnabled !== false,
    friendMatchEnabled: value.friendMatchEnabled !== false,
    customRoomEnabled: value.customRoomEnabled !== false,
    publicArenaEnabled: value.publicArenaEnabled !== false,
    allowedModes: allowed.length ? allowed : DEFAULT_PK_CONFIG.allowedModes,
    maxPlayers: Math.max(2, Math.min(12, Number(value.maxPlayers ?? DEFAULT_PK_CONFIG.maxPlayers)) || DEFAULT_PK_CONFIG.maxPlayers),
    minQuestions,
    maxQuestions,
    minTimeSec,
    maxTimeSec,
    defaultRewardNova: Math.max(0, Math.min(1000, Number(value.defaultRewardNova ?? DEFAULT_PK_CONFIG.defaultRewardNova)) || 0),
    defaultRewardXp: Math.max(0, Math.min(2000, Number(value.defaultRewardXp ?? DEFAULT_PK_CONFIG.defaultRewardXp)) || 0),
    activityId: typeof value.activityId === "string" ? value.activityId : null,
  };
}

export async function getPkConfig() {
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "online_pk_config")).limit(1))[0];
  return clampConfig((row?.value ?? {}) as Record<string, unknown>);
}

export function normalizePkConfig(value: Record<string, unknown>) {
  return clampConfig(value);
}
