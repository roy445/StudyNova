import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newRequestId } from "./core";

export type AuditOutcome = "success" | "failure";
export type AuditMeta = Record<string, string | number | boolean | null>;

const SAFE_META = new Set(["status", "httpStatus", "durationMs", "errorCode", "route", "method", "queryKeys", "targetCount"]);
function whitelistMetadata(input: AuditMeta = {}): AuditMeta {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => SAFE_META.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)).slice(0, 20));
}

export async function writeAudit(input: {
  userId?: string | null;
  eventType: string;
  module: string;
  action: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  errorCategory?: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: AuditMeta;
}) {
  const correlationId = input.correlationId ?? newRequestId();
  try {
    await db.insert(auditLogs).values({
      userId: input.userId ?? null,
      eventType: input.eventType.slice(0, 80),
      module: input.module.slice(0, 80),
      action: input.action.slice(0, 160),
      resourceId: (input.resourceId ?? "").slice(0, 120),
      outcome: input.outcome ?? "success",
      errorCategory: (input.errorCategory ?? "").slice(0, 80),
      correlationId,
      ip: (input.ip ?? "").slice(0, 64),
      userAgent: (input.userAgent ?? "").slice(0, 200),
      metadata: whitelistMetadata(input.metadata),
    });
  } catch {
    // Diagnostics must never change the user's request outcome.
  }
  return correlationId;
}

export function classifyAuditPath(path: string) {
  const clean = path.replace(/^\//, "");
  const [module = "system", area = "operation"] = clean.split("/");
  const action = clean.split("/").slice(1).join(".") || "request";
  return { module: module === "admin" ? area || "admin" : module, eventType: module === "admin" ? "admin_operation" : area === "auth" ? "authentication" : "user_operation", action };
}
