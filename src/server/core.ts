import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------- errors */

export {
  AppError,
  fail,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  tooMany,
  safeErrorMessage,
  deriveErrorCode,
  newRequestId,
  lookupErrorCode,
  ERROR_CATALOG,
  CATALOG_LIST,
} from "./errors";
export type { ErrorKey, ErrorDef, ErrorCategory } from "./errors";

/* ---------------------------------------------------------- passwords */

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 2;
const KEY_LEN = 64;

/** Memory-hard password hash (scrypt, Argon2id-equivalent security envelope). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, salt, hash] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const derived = scryptSync(password.normalize("NFKC"), Buffer.from(salt, "base64"), KEY_LEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    const expected = Buffer.from(hash, "base64");
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- ids */

const NOVA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Server-only public identifier. Never derived from email or real name. */
export function generateNovaId(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) out += NOVA_ALPHABET[bytes[i] % NOVA_ALPHABET.length];
  return `NV-${out.slice(0, 4)}-${out.slice(4)}`;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const slugToken = (len = 12) => randomBytes(32).toString("base64url").slice(0, len);
export function fingerprint(...parts: string[]): string {
  return sha256(parts.map((p) => p.replace(/\s+/g, " ").trim().toLowerCase()).join("|"));
}
export const joinCode = () => {
  const b = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) out += NOVA_ALPHABET[b[i] % NOVA_ALPHABET.length];
  return out;
};

/* -------------------------------------------------------------- dates */

export const TZ_OFFSET_MINUTES = 480; // Asia/Taipei (UTC+8)

export function localNow(now = new Date()): Date {
  return new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000);
}
export function todayStr(now = new Date()): string {
  return localNow(now).toISOString().slice(0, 10);
}
export function localWeekday(now = new Date()): number {
  return localNow(now).getUTCDay();
}
export function localHm(now = new Date()): string {
  return localNow(now).toISOString().slice(11, 16);
}
export function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
export function isoWeekCode(now = new Date()): string {
  const d = localNow(now);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
export function nextUtcMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
}

/* ---------------------------------------------------------------- csv */

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  const cols = headers ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  return `\uFEFF${body}`; // UTF-8 BOM
}

/* --------------------------------------------------------------- misc */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

export function sanitizeText(input: string, max = 20000): string {
  return input.replace(/\u0000/g, "").slice(0, max);
}

export function trend(values: number[]): "up" | "down" | "flat" | "volatile" {
  if (values.length < 2) return "flat";
  const diffs = values.slice(1).map((v, i) => v - values[i]);
  const ups = diffs.filter((d) => d > 1).length;
  const downs = diffs.filter((d) => d < -1).length;
  if (ups && downs) return "volatile";
  if (ups > downs) return "up";
  if (downs > ups) return "down";
  return "flat";
}

export const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "地科", "歷史", "地理", "公民", "其他"] as const;
