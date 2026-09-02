import { z } from "zod";
import type { AuthUser } from "./auth";
import { clientIp, getSession, rateLimit, requireAdmin, requireUser } from "./auth";
import { AppError, fail, newRequestId, safeErrorMessage } from "./core";
import { db } from "@/db";
import { systemLogs } from "@/db/schema";

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

async function loadRoutes(): Promise<Compiled[]> {
  if (compiledRoutes) return compiledRoutes;
  const mods = await Promise.all([
    import("./routes/auth-routes"),
    import("./routes/learning-routes"),
    import("./routes/content-routes"),
    import("./routes/ai-routes"),
    import("./routes/social-routes"),
    import("./routes/economy-routes"),
    import("./routes/weekly-routes"),
    import("./routes/admin-routes"),
    import("./routes/system-routes"),
    import("./routes/support-routes"),
  ]);
  compiledRoutes = compile(mods.flatMap((m) => m.routes));
  return compiledRoutes;
}

export async function handleApiRequest(req: Request, pathSegments: string[]): Promise<Response> {
  const routes = await loadRoutes();
  const url = new URL(req.url);
  const found = match(routes, req.method, pathSegments);
  if (!found) return errorResponse(fail("REQ_ROUTE_NOT_FOUND", { message: `找不到 API 端點：/${pathSegments.join("/")}` }));

  const { route: def, params } = found;
  const ip = clientIp(req);

  try {
    let user: AuthUser | null = null;
    if (def.auth === "admin") user = await requireAdmin();
    else if (def.auth === "user") user = await requireUser();
    else if (def.auth === "optional") user = (await getSession())?.user ?? null;

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

    const result = await def.handler(ctx);
    if (result instanceof Response) return result;
    return jsonResponse(result ?? null);
  } catch (err) {
    if (err instanceof AppError) {
      if (err.status >= 500) {
        await logSystemError(`api:${def.method} ${def.path}`, err.message, { ip, code: err.code, requestId: err.requestId });
      }
      return errorResponse(err);
    }
    const requestId = newRequestId();
    const internal = fail("SYS_INTERNAL", { details: { requestId } });
    await logSystemError(`api:${def.method} ${def.path}`, safeErrorMessage(err), { ip, code: internal.code, requestId: internal.requestId });
    return errorResponse(internal);
  }
}

async function logSystemError(scope: string, message: string, meta: Record<string, unknown>) {
  try {
    await db.insert(systemLogs).values({ level: "error", scope, message: message.slice(0, 500), meta });
  } catch {
    /* logging must never break the response */
  }
}

/* ------------------------------------------------------- shared zod */

export const zSubject = z.string().min(1).max(20);
export const zText = (max = 5000) => z.string().max(max);
export const zUuid = z.string().uuid();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD");
