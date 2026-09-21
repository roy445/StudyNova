import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { route, type RouteDef } from "../router";

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
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let page = pdf.addPage([595, 842]);
      let y = 808;
      const add = (text: string, size = 9, color = rgb(0.12, 0.12, 0.16)) => {
        if (y < 45) { page = pdf.addPage([595, 842]); y = 808; }
        page.drawText(text.replace(/[^\x20-\x7E]/g, " ").slice(0, 125), { x: 34, y, size, font, color });
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
];
