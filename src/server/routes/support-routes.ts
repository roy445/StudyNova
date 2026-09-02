import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { issueReports, faqEntries, legalDocuments, users, storageObjects } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, sanitizeText } from "../core";
import { CATALOG_LIST, lookupErrorCode } from "../errors";
import { putObject, signObjectUrl } from "../storage";
import { adminLog } from "../economy";
import { notify } from "../notify";

const CATEGORIES = ["bug", "ai", "account", "weekly", "content", "membership", "suggestion", "other"] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  bug: "功能異常 / Bug",
  ai: "AI 回應問題",
  account: "帳號與登入",
  weekly: "每週補習小考",
  content: "教材／題目內容錯誤",
  membership: "Nova / 會員 / 點數",
  suggestion: "功能建議",
  other: "其他",
};

export const STATUS_LABEL: Record<string, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  rejected: "不受理",
  duplicate: "重複回報",
};

function ticketNumber() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SN-T-${stamp}-${rand}`;
}

export const routes: RouteDef[] = [
  /* --------------------------------------------------------- error codes */
  route({
    method: "GET",
    path: "/support/error-codes",
    auth: "none",
    handler: async (ctx) => {
      const code = ctx.query.get("code");
      if (code) {
        const found = lookupErrorCode(code.toUpperCase().trim());
        return { code: code.toUpperCase().trim(), definition: found, documented: Boolean(found) };
      }
      const q = (ctx.query.get("q") ?? "").toLowerCase();
      const list = q
        ? CATALOG_LIST.filter((d) => d.code.toLowerCase().includes(q) || d.message.includes(q) || d.hint.includes(q))
        : CATALOG_LIST;
      return {
        total: CATALOG_LIST.length,
        categories: [...new Set(CATALOG_LIST.map((d) => d.category))],
        codes: list,
      };
    },
  }),

  /* ------------------------------------------------------------- faq */
  route({
    method: "GET",
    path: "/support/faq",
    auth: "none",
    handler: async (ctx) => {
      const q = (ctx.query.get("q") ?? "").trim();
      const like = `%${q}%`;
      const rows = await db
        .select()
        .from(faqEntries)
        .where(and(eq(faqEntries.published, true), q ? or(ilike(faqEntries.question, like), ilike(faqEntries.answer, like)) : sql`true`))
        .orderBy(asc(faqEntries.category), asc(faqEntries.sortOrder));
      return { faq: rows, categories: [...new Set(rows.map((r) => r.category))] };
    },
  }),

  route({
    method: "POST",
    path: "/support/faq/:slug/helpful",
    auth: "none",
    rate: { limit: 30, windowSec: 3600, key: "faq-helpful" },
    handler: async (ctx) => {
      const rows = await db
        .update(faqEntries)
        .set({ helpfulCount: sql`${faqEntries.helpfulCount} + 1` })
        .where(eq(faqEntries.slug, ctx.params.slug))
        .returning({ helpfulCount: faqEntries.helpfulCount });
      if (!rows[0]) throw fail("SYS_NOT_FOUND", { message: "找不到這個問題" });
      return { helpfulCount: rows[0].helpfulCount };
    },
  }),

  /* ----------------------------------------------------------- legal */
  route({
    method: "GET",
    path: "/support/legal/:slug",
    auth: "none",
    handler: async (ctx) => {
      const rows = await db.select().from(legalDocuments).where(eq(legalDocuments.slug, ctx.params.slug)).limit(1);
      if (!rows[0]) throw fail("SYS_NOT_FOUND", { message: "找不到這份文件" });
      return { document: rows[0] };
    },
  }),

  /* ---------------------------------------------------------- issues */
  route({
    method: "POST",
    path: "/support/issues",
    auth: "optional",
    rate: { limit: 8, windowSec: 3600, key: "issue-create" },
    handler: async (ctx) => {
      const form = await ctx.formData().catch(() => null);
      let payload: Record<string, unknown>;
      let file: File | null = null;

      if (form) {
        payload = Object.fromEntries(
          [...form.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]),
        );
        const f = form.get("attachment");
        if (f instanceof File && f.size > 0) file = f;
      } else {
        payload = {};
      }

      const parsed = z
        .object({
          category: z.enum(CATEGORIES).default("bug"),
          severity: z.enum(["low", "normal", "high", "blocker"]).default("normal"),
          title: z.string().min(4, "標題至少 4 個字").max(120),
          description: z.string().min(10, "請描述問題發生的步驟（至少 10 個字）").max(4000),
          errorCode: z.string().max(40).optional(),
          requestId: z.string().max(40).optional(),
          pageUrl: z.string().max(300).optional(),
          contactEmail: z.string().email("Email 格式不正確").max(180).optional().or(z.literal("")),
        })
        .safeParse(payload);

      if (!parsed.success) {
        throw fail("REQ_VALIDATION", {
          message: parsed.error.issues.map((i) => `${i.path.join(".") || "欄位"}：${i.message}`).join("；"),
          details: parsed.error.issues.map((i) => ({ field: i.path.join(".") || "root", message: i.message })),
        });
      }
      const body = parsed.data;
      if (!ctx.user && !body.contactEmail) {
        throw fail("REQ_VALIDATION", { message: "未登入時請提供聯絡 Email，我們才能回覆你" });
      }

      let attachmentId: string | null = null;
      if (file) {
        const buf = Buffer.from(await file.arrayBuffer());
        const stored = await putObject({
          userId: ctx.user?.userId ?? null,
          filename: file.name,
          mimeType: file.type,
          data: buf,
          allow: ["image", "text"],
        });
        attachmentId = stored.id;
      }

      const rows = await db
        .insert(issueReports)
        .values({
          ticketNo: ticketNumber(),
          userId: ctx.user?.userId ?? null,
          contactEmail: body.contactEmail ?? "",
          category: body.category,
          severity: body.severity,
          title: sanitizeText(body.title, 120),
          description: sanitizeText(body.description, 4000),
          errorCode: (body.errorCode ?? "").toUpperCase().slice(0, 40),
          requestId: (body.requestId ?? "").slice(0, 40),
          pageUrl: (body.pageUrl ?? "").slice(0, 300),
          userAgent: (ctx.req.headers.get("user-agent") ?? "").slice(0, 300),
          appVersion: process.env.APP_VERSION || "1.0.0",
          attachmentId,
        })
        .returning();

      if (ctx.user) {
        await notify({
          userId: ctx.user.userId,
          kind: "support",
          title: `📮 已收到你的回報 ${rows[0].ticketNo}`,
          body: `「${rows[0].title}」已送出，管理員處理後會通知你。`,
          link: "/support?tab=mine",
          dedupeKey: `issue:${rows[0].id}`,
        });
      }

      // Notify every admin so nothing is missed.
      const admins = await db.select({ userId: users.userId }).from(users).where(or(eq(users.role, "admin"), eq(users.role, "owner")));
      for (const a of admins) {
        await notify({
          userId: a.userId,
          kind: "support",
          title: `🛠️ 新問題回報 ${rows[0].ticketNo}`,
          body: `[${CATEGORY_LABEL[rows[0].category]}] ${rows[0].title}`,
          link: "/admin/support",
          dedupeKey: `issue-admin:${rows[0].id}:${a.userId}`,
        });
      }

      return { ticketNo: rows[0].ticketNo, id: rows[0].id, status: rows[0].status };
    },
  }),

  route({
    method: "GET",
    path: "/support/issues",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(issueReports).where(eq(issueReports.userId, user.userId)).orderBy(desc(issueReports.createdAt)).limit(50);
      return {
        issues: rows.map((r) => ({
          id: r.id,
          ticketNo: r.ticketNo,
          category: r.category,
          categoryLabel: CATEGORY_LABEL[r.category] ?? r.category,
          severity: r.severity,
          title: r.title,
          description: r.description,
          errorCode: r.errorCode,
          status: r.status,
          statusLabel: STATUS_LABEL[r.status] ?? r.status,
          adminNote: r.adminNote,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
        })),
      };
    },
  }),

  route({
    method: "GET",
    path: "/support/issues/:ticketNo",
    auth: "optional",
    handler: async (ctx) => {
      const rows = await db.select().from(issueReports).where(eq(issueReports.ticketNo, ctx.params.ticketNo.toUpperCase())).limit(1);
      const r = rows[0];
      if (!r) throw fail("SYS_NOT_FOUND", { message: "找不到這個回報單號" });
      const isOwner = ctx.user && r.userId === ctx.user.userId;
      const isAdmin = ctx.user && (ctx.user.role === "admin" || ctx.user.role === "owner");
      if (!isOwner && !isAdmin) throw fail("PERM_NOT_OWNER", { message: "這不是你的回報單" });
      return {
        issue: {
          ...r,
          categoryLabel: CATEGORY_LABEL[r.category] ?? r.category,
          statusLabel: STATUS_LABEL[r.status] ?? r.status,
          attachmentUrl: r.attachmentId && ctx.user ? signObjectUrl(r.attachmentId, ctx.user.userId) : null,
        },
      };
    },
  }),

  /* ----------------------------------------------------- admin triage */
  route({
    method: "GET",
    path: "/admin/support/issues",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const status = ctx.query.get("status");
      const rows = await db
        .select({
          id: issueReports.id,
          ticketNo: issueReports.ticketNo,
          category: issueReports.category,
          severity: issueReports.severity,
          title: issueReports.title,
          description: issueReports.description,
          errorCode: issueReports.errorCode,
          requestId: issueReports.requestId,
          pageUrl: issueReports.pageUrl,
          userAgent: issueReports.userAgent,
          status: issueReports.status,
          adminNote: issueReports.adminNote,
          contactEmail: issueReports.contactEmail,
          attachmentId: issueReports.attachmentId,
          createdAt: issueReports.createdAt,
          resolvedAt: issueReports.resolvedAt,
          reporter: users.displayName,
          reporterNovaId: users.novaId,
        })
        .from(issueReports)
        .leftJoin(users, eq(users.userId, issueReports.userId))
        .where(status && status !== "all" ? eq(issueReports.status, status) : sql`true`)
        .orderBy(desc(issueReports.createdAt))
        .limit(200);

      const counts = await db
        .select({ status: issueReports.status, c: sql<number>`count(*)::int` })
        .from(issueReports)
        .groupBy(issueReports.status);

      const topCodes = await db
        .select({ errorCode: issueReports.errorCode, c: sql<number>`count(*)::int` })
        .from(issueReports)
        .where(sql`${issueReports.errorCode} <> ''`)
        .groupBy(issueReports.errorCode)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      return {
        issues: rows.map((r) => ({
          ...r,
          categoryLabel: CATEGORY_LABEL[r.category] ?? r.category,
          statusLabel: STATUS_LABEL[r.status] ?? r.status,
          attachmentUrl: r.attachmentId ? signObjectUrl(r.attachmentId, admin.userId) : null,
        })),
        counts,
        topCodes,
      };
    },
  }),

  route({
    method: "PATCH",
    path: "/admin/support/issues/:id",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          status: z.enum(["open", "in_progress", "resolved", "rejected", "duplicate"]).optional(),
          severity: z.enum(["low", "normal", "high", "blocker"]).optional(),
          adminNote: z.string().max(2000).optional(),
        }),
      );
      const before = (await db.select().from(issueReports).where(eq(issueReports.id, ctx.params.id)).limit(1))[0];
      if (!before) throw fail("SYS_NOT_FOUND", { message: "找不到這筆回報" });

      const rows = await db
        .update(issueReports)
        .set({
          ...body,
          handledBy: admin.userId,
          resolvedAt: body.status === "resolved" ? new Date() : body.status ? null : before.resolvedAt,
          updatedAt: new Date(),
        })
        .where(eq(issueReports.id, ctx.params.id))
        .returning();

      if (before.userId && body.status && body.status !== before.status) {
        await notify({
          userId: before.userId,
          kind: "support",
          title: `📮 回報 ${before.ticketNo} 狀態更新：${STATUS_LABEL[body.status]}`,
          body: body.adminNote?.slice(0, 200) || `你的問題「${before.title}」已更新為 ${STATUS_LABEL[body.status]}。`,
          link: "/support?tab=mine",
          dedupeKey: `issue-status:${before.id}:${body.status}`,
          push: true,
        });
      }

      await adminLog({
        actorId: admin.userId,
        action: "support.issue.update",
        targetType: "issue",
        targetId: before.ticketNo,
        reason: body.adminNote ?? "",
        before: { status: before.status, severity: before.severity },
        after: { status: rows[0].status, severity: rows[0].severity },
        ip: ctx.ip,
      });
      return { issue: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/admin/support/storage",
    auth: "admin",
    handler: async () => {
      const rows = await db
        .select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${storageObjects.sizeBytes}),0)::int` })
        .from(storageObjects);
      return { attachments: rows[0] };
    },
  }),
];
