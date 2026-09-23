import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export type RegistrationControl = {
  enabled: boolean;
  reason: string;
  reopeningAt: string | null;
  notice: string;
  updatedAt: string | null;
};

const DEFAULT_REGISTRATION_CONTROL: RegistrationControl = {
  enabled: true,
  reason: "",
  reopeningAt: null,
  notice: "",
  updatedAt: null,
};

export async function getRegistrationControl(): Promise<RegistrationControl> {
  try {
    const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "registration_control")).limit(1))[0];
    const value = (row?.value ?? {}) as Partial<RegistrationControl>;
    return {
      ...DEFAULT_REGISTRATION_CONTROL,
      ...value,
      enabled: value.enabled !== false,
      reopeningAt: value.reopeningAt ?? null,
      updatedAt: row?.updatedAt?.toISOString?.() ?? value.updatedAt ?? null,
    };
  } catch {
    // A settings read failure must not accidentally block new users.
    return DEFAULT_REGISTRATION_CONTROL;
  }
}
