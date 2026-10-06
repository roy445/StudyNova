import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { AuthUser } from "./auth";
import { clientIp, getSession, rateLimit, requireAdmin, requireUser } from "./auth";
import { AppError, fail, newRequestId, safeErrorMessage } from "./core";
import { db } from "@/db";
import { featureVersionGates, legalConsents, legalDocuments, platformSettings, softwareReleases, systemLogs, users } from "@/db/schema";
import { APP_VERSION } from "@/lib/app-version";
import { compareSemVer, isValidSemVer } from "@/lib/semver";
import { featureKeyForApiPath, isFeatureGateLive } from "@/lib/feature-version";
import { classifyAuditPath, writeAudit } from "./audit";
import { ensureIdentityGroupMemberColumns, ensureIdentityGroupSchema } from "./db-compat";
import { classifyDatabaseError, databaseErrorMessage, databaseTarget, extractDatabaseDiagnostics } from "./db-diagnostics";
import { requireTesterBeta } from "./tester";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type AuthMode = "none" | "optional" | "user" | "admin";

export type Ctx = {
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  user: AuthUser | null;
  ip: string;
  json: <T>(schema: z.ZodType<T>) => Promise<T>;
  formData: () => Promise<FormData>;
  requireUser: () => AuthUser;
};

export type RouteDef = {
  method: Method;
  path: string;
  auth?: AuthMode;
  featureGate?: string;
  testerFeature?: string;
  rate?: { limit: number; windowSec: number; key?: string };
  handler: (ctx: Ctx) => Promise<unknown>;
};

export function route(def: RouteDef): RouteDef {
  return def;
}

type Compiled = RouteDef & { segments: string[] };

function compile(defs: RouteDef[]): Compiled[] {
  return defs.map((d) => ({ ...d, segments: d.path.split("/").filter(Boolean) }));
}

function match(compiled: Compiled[], method: string, segments: string[]) {
  for (const r of compiled) {
    if (r.method !== method) continue;
    if (r.segments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < r.segments.length; i += 1) {
      const pat = r.segments[i];
      if (pat.startsWith(":")) params[pat.slice(1)] = decodeURIComponent(segments[i]);
      else if (pat !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status });
}

export function errorResponse(err: AppError) {
  return Response.json(
    {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        hint: err.hint,
        requestId: err.requestId,
        details: err.details,
        docs: `/faq?code=${encodeURIComponent(err.code)}`,
      },
    },
    { status: err.status, headers: { "x-studynova-error": err.code, "x-request-id": err.requestId } },
  );
}

let compiledRoutes: Compiled[] | null = null;
let serviceControlCache: { enabled: boolean; message: string; estimatedRecoveryAt: string | null; expiresAt: number } | null = null;

async function serviceControl() {
  if (serviceControlCache && serviceControlCache.expiresAt > Date.now()) return serviceControlCache;
  const row = (await db.select().from(platformSettings).where(eq(platformSettings.key, "service_control")).limit(1))[0];
  const value = (row?.value ?? {}) as { enabled?: boolean; message?: string; description?: string; estimatedRecoveryAt?: string | null };
  serviceControlCache = { enabled: value.enabled !== false, message: value.message || value.description || "服務目前暫停中，請稍後再試。", estimatedRecoveryAt: value.estimatedRecoveryAt ?? null, expiresAt: Date.now() + 1_000 };
  return serviceControlCache;
}

async function loadRoutes(): Promise<Compiled[]> {
  if (compiledRoutes) return compiledRoutes;
  const mods = await Promise.all([
    import("./routes/auth-routes"),
    import("./routes/learning-routes"),
    import("./routes/word-detail-routes"),
    import("./routes/content-routes"),
    import("./routes/reading-routes"),
    import("./routes/ai-routes"),
    import("./routes/social-routes"),
    import("./routes/economy-routes"),
    import("./routes/weekly-routes"),
    import("./routes/admin-routes"),
    import("./routes/system-routes"),
    import("./routes/support-routes"),
    import("./routes/essay-routes"),
    import("./routes/performance-routes"),
    import("./routes/compression-routes"),
    import("./routes/export-routes"),
    import("./routes/visual-routes"),
    import("./routes/audit-content-routes"),
    import("./routes/learning-intelligence-routes"),
    import("./routes/intelligence-admin-routes"),
    import("./routes/learning-actions-routes"),
    import("./routes/exam-appeal-routes"),
    import("./routes/exam-hub-routes"),
    import("./routes/ai-background-routes"),
    import("./routes/daily-knowledge-routes"),
    import("./routes/pro-renewal-routes"),
    import("./routes/release-routes"),
    import("./routes/identity-group-routes"),
    import("./routes/error-log-routes"),
    import("./routes/analytics-routes"),
    import("./routes/pk-routes"),
    import("./routes/chemistry-routes"),
    import("./routes/tester-routes"),
  ]);
  compiledRoutes = compile(mods.flatMap((m) => m.routes));
  return compiledRoutes;
}

async function hasCurrentUsageConsent(userId: string) {
  const document = (await db.select({ version: legalDocuments.version }).from(legalDocuments).where(eq(legalDocuments.slug, "usage_rules")).limit(1))[0];
  if (!document) return true;
  const consentRows = await db.select({ id: legalConsents.id }).from(legalConsents).where(and(eq(legalConsents.userId, userId), eq(legalConsents.documentSlug, "usage_rules"), eq(legalConsents.documentVersion, document.version))).limit(1);
  const consent = consentRows[0];
  return Boolean(consent);
}

const lastSeenMemory = new Map<string, number>();
let minimumVersionCache: { value: string; expiresAt: number } | null = null;
const featureVersionCache = new Map<string, { value: { featureName: string; requiredVersion: string; minimumVersion: string; enabled: boolean; releaseStatus: string; releaseDate: Date | null } | null; expiresAt: number }>();

async function minimumSupportedVersion() {
  if (minimumVersionCache && minimumVersionCache.expiresAt > Date.now()) return minimumVersionCache.value;
  const rows = await db.select({ version: softwareReleases.version, minimum: softwareReleases.minimumSupportedVersion }).from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED"));
  const latest = rows.filter((row) => isValidSemVer(row.version)).sort((a, b) => compareSemVer(b.version, a.version))[0];
  const value = latest && isValidSemVer(latest.minimum) ? latest.minimum : "1.0.0";
  minimumVersionCache = { value, expiresAt: Date.now() + 5_000 };
  return value;
}

async function featureVersionGate(featureKey: string) {
  const cached = featureVersionCache.get(featureKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = (await db.select({ featureName: featureVersionGates.featureName, requiredVersion: featureVersionGates.requiredVersion, minimumVersion: featureVersionGates.minimumVersion, enabled: featureVersionGates.enabled, releaseStatus: featureVersionGates.releaseStatus, releaseDate: featureVersionGates.releaseDate }).from(featureVersionGates).where(eq(featureVersionGates.featureKey, featureKey)).limit(1))[0] ?? null;
  featureVersionCache.set(featureKey, { value: row, expiresAt: Date.now() + 5_000 });
  return row;
}

async function touchLastSeen(userId: string) {
  const now = Date.now();
  if ((lastSeenMemory.get(userId) ?? 0) > now - 10 * 60_000) return;
  lastSeenMemory.set(userId, now);
  try {
    await db.update(users).set({ lastSeenAt: new Date(now) }).where(and(eq(users.userId, userId), sql`${users.lastSeenAt} is null or ${users.lastSeenAt} < now() - interval '10 minutes'`));
  } catch {
    lastSeenMemory.delete(userId);
  }
}

export async function handleApiRequest(req: Request, pathSegments: string[]): Promise<Response> {
  try {
    await ensureIdentityGroupSchema();
  } catch (error) {
    console.error("[StudyNova][db-preflight] identity group schema unavailable", error);
  }
  try {
    await ensureIdentityGroupMemberColumns();
  } catch (error) {
    console.error("[StudyNova][db-preflight] identity group member columns unavailable", error);
  }
  const routes = await loadRoutes();
  const url = new URL(req.url);
  const found = match(routes, req.method, pathSegments);
  if (!found) return errorResponse(fail("REQ_ROUTE_NOT_FOUND", { message: `找不到 API 端點：/${pathSegments.join("/")}` }));

  const { route: def, params } = found;
  const ip = clientIp(req);
  let user: AuthUser | null = null;

  try {
    if (def.auth === "admin") user = await requireAdmin();
    else if (def.auth === "user") user = await requireUser();
    else if (def.auth === "optional") user = (await getSession())?.user ?? null;
    if (user) void touchLastSeen(user.userId);

    const versionExempt = def.path.startsWith("/auth") || def.path.startsWith("/releases") || def.path.startsWith("/admin/releases") || def.path.startsWith("/support") || def.path === "/health" || def.path === "/system/cron";
    if (user && !versionExempt) {
      const minimum = await minimumSupportedVersion();
      if (compareSemVer(minimum, "1.0.0") > 0) {
        const current = req.headers.get("x-studynova-version") ?? "";
        if (!isValidSemVer(current)) throw fail("APP_VERSION_REQUIRED", { details: { minimumSupportedVersion: minimum } });
        if (compareSemVer(current, minimum) < 0) throw fail("APP_VERSION_UPDATE_REQUIRED", { details: { currentVersion: current, minimumSupportedVersion: minimum } });
      }
    }

    const enforcedFeatureKey = def.featureGate ?? featureKeyForApiPath(def.path);
    if (user && enforcedFeatureKey) {
      const gate = await featureVersionGate(enforcedFeatureKey);
      const now = new Date();
      if (gate) {
        if (!isFeatureGateLive(gate, now)) throw fail("QUOTA_FEATURE_DISABLED", { message: `${gate.featureName} 尚未發布、已封存或目前已停用。`, details: { featureKey: enforcedFeatureKey } });
        const current = req.headers.get("x-studynova-version") ?? "";
        if (!isValidSemVer(current)) throw fail("APP_VERSION_REQUIRED", { details: { featureKey: enforcedFeatureKey, requiredVersion: gate.requiredVersion } });
        const requiredVersion = compareSemVer(gate.requiredVersion, gate.minimumVersion) >= 0 ? gate.requiredVersion : gate.minimumVersion;
        if (compareSemVer(current, requiredVersion) < 0) throw fail("FEATURE_VERSION_REQUIRED", { message: `${gate.featureName} 需要 StudyNova v${requiredVersion} 或更新版本。`, details: { featureKey: enforcedFeatureKey, featureName: gate.featureName, currentVersion: current, requiredVersion } });
      }
    }

    if (def.auth !== "admin" && !def.path.startsWith("/auth") && def.path !== "/health" && def.path !== "/system/cron") {
      const control = await serviceControl();
      if (!control.enabled) throw fail("SERVICE_MAINTENANCE", { message: control.message, details: { estimatedRecoveryAt: control.estimatedRecoveryAt } });
    }

    if (user && def.testerFeature) await requireTesterBeta(user, def.testerFeature);

    if (user && def.auth !== "admin" && !def.path.startsWith("/auth") && !def.path.startsWith("/support/legal") && def.path !== "/analytics/events" && def.path !== "/health" && !(await hasCurrentUsageConsent(user.userId))) {
      throw fail("AUTH_USAGE_RULES_REQUIRED");
    }

    if (def.rate) {
      const bucket = `${def.rate.key ?? def.path}:${user?.userId ?? ip}`;
      await rateLimit(bucket, def.rate.limit, def.rate.windowSec);
    }

    const ctx: Ctx = {
      req,
      params,
      query: url.searchParams,
      user,
      ip,
      json: async <T,>(schema: z.ZodType<T>) => {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw fail("REQ_INVALID_JSON");
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          throw fail("REQ_VALIDATION", {
            message: parsed.error.issues.map((i) => `${i.path.join(".") || "欄位"}：${i.message}`).join("；"),
            details: parsed.error.issues.map((i) => ({ field: i.path.join(".") || "root", message: i.message })),
          });
        }
        return parsed.data;
      },
      formData: () => req.formData(),
      requireUser: () => {
        if (!user) throw fail("AUTH_REQUIRED");
        return user;
      },
    };

    const startedAt = Date.now();
    const result = await def.handler(ctx);
    const response = result instanceof Response ? result : jsonResponse(result ?? null);
    if (user && (def.method !== "GET" || def.path.startsWith("/admin") || def.path.includes("/auth"))) {
      const audit = classifyAuditPath(def.path);
      await writeAudit({ userId: user.userId, eventType: audit.eventType, module: audit.module, action: audit.action, resourceId: params.id, ip, userAgent: req.headers.get("user-agent") ?? "", metadata: { status: response.status, httpStatus: response.status, durationMs: Date.now() - startedAt, route: def.path, method: def.method, queryKeys: Array.from(url.searchParams.keys()).join(",") } });
    }
    void logApiPerformance({ userId: user?.userId ?? null, route: def.path, method: def.method, status: response.status, durationMs: Date.now() - startedAt, requestId: response.headers.get("x-request-id") ?? newRequestId() });
    return response;
  } catch (err) {
    if (err instanceof AppError) {
      console.warn("[StudyNova][api-error]", JSON.stringify({
        requestId: err.requestId,
        code: err.code,
        status: err.status,
        method: def.method,
        route: def.path,
        params: Object.keys(params).length ? params : undefined,
        details: err.details,
        hint: err.hint,
      }));
      if (user) {
        const audit = classifyAuditPath(def.path);
        await writeAudit({ userId: user.userId, eventType: audit.eventType, module: audit.module, action: audit.action, resourceId: params.id, outcome: "failure", errorCategory: err.code, ip, userAgent: req.headers.get("user-agent") ?? "", metadata: { status: err.status, httpStatus: err.status, route: def.path, method: def.method, errorCode: err.code } });
      }
      await logSystemError(`api:${def.method} ${def.path}`, err.message, { ip, code: err.code, hint: err.hint, requestId: err.requestId, route: def.path, method: def.method, stage: "route_handler", details: err.details ?? null }, user?.userId ?? null);
      return errorResponse(err);
    }
    const requestId = newRequestId();
    const database = extractDatabaseDiagnostics(err);
    const databaseKind = classifyDatabaseError(err);
    const errorKey = databaseKind === "schema"
      ? (def.path === "/pk/matchmaking/join" ? "PK_MATCHMAKING_STORAGE_ERROR" : "SYS_DB_SCHEMA_MISMATCH")
      : databaseKind === "unavailable" ? "SYS_DB_UNAVAILABLE" : "SYS_INTERNAL";
    const internal = fail(errorKey, { requestId, details: { requestId, stage: `${def.method} ${def.path}` } });
    console.error("[StudyNova][api-database-error]", JSON.stringify({
      requestId,
      code: internal.code,
      method: def.method,
      route: def.path,
      params: Object.keys(params).length ? params : undefined,
      database,
      databaseTarget: databaseTarget(),
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: databaseErrorMessage(err),
    }));
    // Never persist raw driver messages: Drizzle may include SQL and query parameters.
    const message = database
      ? `Database operation failed (${database.code})`
      : /failed query:/i.test(err instanceof Error ? err.message : String(err))
        ? "Database operation failed (query omitted)"
        : safeErrorMessage(err);
    await logSystemError(`api:${def.method} ${def.path}`, message, { ip, code: internal.code, requestId, route: def.path, method: def.method, stage: "route_handler", ...(database ? { database } : {}) }, user?.userId ?? null);
    return errorResponse(internal);
  }
}

async function logApiPerformance(meta: { userId: string | null; route: string; method: string; status: number; durationMs: number; requestId: string }) {
  try {
    await db.insert(systemLogs).values({ userId: meta.userId, level: "perf", scope: "api", message: `${meta.method} ${meta.route}`, meta: { ...meta, timestamp: new Date().toISOString() } });
  } catch {
    /* performance logging must never affect the request */
  }
}

async function logSystemError(scope: string, message: string, meta: Record<string, unknown>, userId: string | null = null) {
  try {
    const code = typeof meta.code === "string" ? meta.code : "SN-SYS-9901";
    const route = typeof meta.route === "string" ? meta.route : scope;
    const fingerprint = createHash("sha256").update(`${code}|${route}|${scope}|${message.slice(0, 500)}`).digest("hex").slice(0, 48);
    const existing = (await db.select({ id: systemLogs.id, occurrenceCount: systemLogs.occurrenceCount }).from(systemLogs).where(and(eq(systemLogs.level, "error"), eq(systemLogs.fingerprint, fingerprint), isNull(systemLogs.resolvedAt))).orderBy(sql`${systemLogs.lastSeenAt} desc`).limit(1))[0];
    if (existing) {
      await db.update(systemLogs).set({ occurrenceCount: existing.occurrenceCount + 1, lastSeenAt: new Date(), meta: { ...meta, fingerprint, occurrenceCount: existing.occurrenceCount + 1 } }).where(eq(systemLogs.id, existing.id));
      return;
    }
    await db.insert(systemLogs).values({ userId, level: "error", scope, message: message.slice(0, 500), meta: { ...meta, fingerprint, occurrenceCount: 1 }, fingerprint, occurrenceCount: 1, firstSeenAt: new Date(), lastSeenAt: new Date() });
  } catch {
    /* logging must never break the response */
  }
}

/* ------------------------------------------------------- shared zod */

export const zSubject = z.string().min(1).max(20);
export const zText = (max = 5000) => z.string().max(max);
export const zUuid = z.string().uuid();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD");
