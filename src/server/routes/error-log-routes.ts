import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { assertCjkGlyphCoverage, embedCjkFont } from "../cjk-font";
import { runAiJson } from "../ai";
import { notFound } from "../core";

function buildConditions(ctx: Parameters<NonNullable<RouteDef["handler"]>>[0]) {
  const level = ctx.query.get("level") ?? "error";
  const scope = ctx.query.get("scope")?.trim();
  const q = ctx.query.get("q")?.trim();
  const from = ctx.query.get("from");
  const to = ctx.query.get("to");
  return {
    level,
    from,
    to,
    conditions: [
      level !== "all" ? eq(systemLogs.level, level) : undefined,
      scope ? ilike(systemLogs.scope, `%${scope}%`) : undefined,
      q ? or(ilike(systemLogs.message, `%${q}%`), ilike(systemLogs.scope, `%${q}%`)) : undefined,
      from ? gte(systemLogs.createdAt, new Date(from)) : undefined,
      to ? lte(systemLogs.createdAt, new Date(to)) : undefined,
    ].filter(Boolean),
  };
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/admin/error-logs",
    auth: "admin",
    handler: async (ctx) => {
      const page = Math.max(1, Number(ctx.query.get("page") ?? 1) || 1);
      const pageSize = Math.min(100, Math.max(10, Number(ctx.query.get("pageSize") ?? 50) || 50));
      const { conditions } = buildConditions(ctx);
      const rows = await db.select().from(systemLogs).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(systemLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
      return { logs: rows, page, pageSize, total: rows.length };
    },
  }),
  route({
    method: "GET",
    path: "/admin/error-logs/pdf",
    auth: "admin",
    handler: async (ctx) => {
      const { conditions, level, from, to } = buildConditions(ctx);
      const rows = await db.select().from(systemLogs).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(systemLogs.createdAt)).limit(5000);
      const pdf = await PDFDocument.create();
      const font = await embedCjkFont(pdf);
      let page = pdf.addPage([595, 842]);
      let y = 808;
      const add = (text: string, size = 9, color = rgb(0.12, 0.12, 0.16)) => {
        if (y < 45) { page = pdf.addPage([595, 842]); y = 808; }
        const visibleText = text.slice(0, 125);
        assertCjkGlyphCoverage(visibleText, "錯誤報告 PDF");
        page.drawText(visibleText, { x: 34, y, size, font, color });
        y -= size >= 14 ? 24 : 14;
      };
      add("StudyNova Error Log Report", 16, rgb(0.1, 0.35, 0.5));
      add(`Range: ${from || "all"} - ${to || "all"}; Level: ${level}; Rows: ${rows.length}`);
      y -= 8;
      for (const row of rows) {
        add(`${new Date(row.createdAt).toISOString()} [${row.level}] ${row.scope}`, 9, rgb(0.1, 0.35, 0.5));
        add(row.message);
        add(JSON.stringify(row.meta ?? {}));
        y -= 5;
      }
      const data = await pdf.save();
      return new Response(new Uint8Array(data) as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="StudyNova_Error_Logs_${new Date().toISOString().slice(0, 10)}.pdf"` } });
    },
  }),
  route({
    method: "POST",
    path: "/admin/error-logs/:id/auto-debug",
    auth: "admin",
    rate: { limit: 12, windowSec: 3600, key: "admin-auto-debug" },
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const log = (await db.select().from(systemLogs).where(eq(systemLogs.id, ctx.params.id)).limit(1))[0];
      if (!log) throw notFound("找不到指定錯誤日誌");
      const meta = (log.meta ?? {}) as Record<string, unknown>;
      const errorCode = typeof meta.code === "string" ? meta.code : "SN-SYS-9901";
      const requestId = typeof meta.requestId === "string" ? meta.requestId : "未提供";
      const source = JSON.stringify({ id: log.id, scope: log.scope, level: log.level, message: log.message, meta: { ...meta, ip: undefined } }).slice(0, 12000);
      const { data, meta: aiMeta } = await runAiJson<{
        summary: string;
        severity: "低" | "中" | "高" | "阻斷";
        probableCause: string;
        userSteps: string[];
        adminChecks: string[];
        repairPrompt: string;
        safeToRetry: boolean;
      }>({
        feature: "admin_auto_debug",
        userId: admin.userId,
        system: "你是 StudyNova 的資深 SRE 與 TypeScript/Next.js 維運工程師。請分析提供的已脫敏錯誤日誌。不可猜測秘密、API key、密碼或直接執行任何修改；只輸出 JSON。repairPrompt 必須是一段可以直接交給修復 AI 的繁體中文指令，明確包含錯誤代碼、requestId、可能根因、建議檢查檔案與驗證方式。",
        parts: [{ kind: "text", text: `請診斷這筆錯誤：\n${source}` }],
        temperature: 0.1,
        maxOutputTokens: 1800,
      }, {
        summary: "AI 無法完成自動診斷，請依錯誤代碼與 requestId 查詢。",
        severity: "中",
        probableCause: "需要人工查看完整錯誤上下文。",
        userSteps: ["重新整理後重試一次", "保留錯誤代碼與 requestId"],
        adminChecks: ["依錯誤代碼查閱 /faq", "依 requestId 查詢 System Log"],
        repairPrompt: `請分析 ${errorCode}（requestId: ${requestId}）並提出最小修復方案。`,
        safeToRetry: true,
      });
      const result = { ...data, errorCode, requestId, sourceLogId: log.id, aiLatencyMs: aiMeta.latencyMs ?? null, generatedAt: new Date().toISOString() };
      await db.insert(systemLogs).values({ userId: admin.userId, level: "error", scope: "auto-debug", message: `自動除錯完成：${errorCode}`, meta: { sourceLogId: log.id, errorCode, requestId, result } });
      return result;
    },
  }),
];
