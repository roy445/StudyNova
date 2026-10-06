import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

const LOGO_PATH = join(process.cwd(), "public", "brand", "studynova-logo-square-192.png");

export async function isLogoWatermarkEnabled() {
  const row = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "ai_logo_watermark")).limit(1))[0];
  return (row?.value as { enabled?: unknown } | undefined)?.enabled !== false;
}

export async function logoBuffer() {
  return readFile(LOGO_PATH);
}

/** Add a subtle StudyNova logo at the lower-right without changing the source content. */
export async function applyLogoWatermark(data: Buffer, enabled = true) {
  if (!enabled) return data;
  const logo = (await logoBuffer()).toString("base64");
  const metadata = await sharp(data).metadata();
  const width = Math.max(1, metadata.width ?? 1200);
  const height = Math.max(1, metadata.height ?? 900);
  const logoWidth = Math.max(72, Math.min(180, Math.round(width * 0.12)));
  const margin = Math.max(18, Math.round(width * 0.025));
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/png;base64,${logo}" x="${width - logoWidth - margin}" y="${height - logoWidth - margin}" width="${logoWidth}" height="${logoWidth}" preserveAspectRatio="xMidYMid meet" opacity="0.26"/></svg>`);
  return sharp(data).composite([{ input: overlay, blend: "over" }]).png().toBuffer();
}
