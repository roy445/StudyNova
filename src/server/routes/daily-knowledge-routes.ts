import { and, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dailyKnowledgeItems, dailyKnowledgeViews } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound, todayStr } from "../core";
import { writeAudit } from "../audit";
import { DAILY_KNOWLEDGE_SUBJECTS, compareDailyKnowledge, fingerprint, generateDailyKnowledge, verifyDailyKnowledgeSource } from "../daily-knowledge";

const subject = z.enum(["國文", "英文", "數學", "自然", "歷史", "地理", "公民", "物理", "化學", "生物", "地球科學", "隨機"]);
const quiz = z.object({ question: z.string().min(1).max(1000), options: z.array(z.string().min(1).max(300)).length(4), answer: z.number().int().min(0).max(3), explanation: z.string().min(1).max(2000) });
const draftSchema = z.object({ title: z.string().min(8).max(240), content: z.string().min(80).max(8000), detail: z.string().min(80).max(12000), subject: subject.exclude(["隨機"]), topic: z.string().min(1).max(160), source: z.string().max(240), sourceUrl: z.string().url().or(z.literal("")), coreConcept: z.string().min(8).max(500), quiz: quiz.nullable().default(null), scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });

function dateFromQuery(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayStr(); }

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/daily-knowledge", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser();
    const date = dateFromQuery(ctx.query.get("date"));
    const requested = ctx.query.get("subject") ?? "隨機";
    const chosen = requested === "隨機" ? null : subject.safeParse(requested).success ? requested : null;
    const candidates = await db.select().from(dailyKnowledgeItems).where(and(eq(dailyKnowledgeItems.status, "published"), chosen ? eq(dailyKnowledgeItems.subject, chosen) : undefined, or(eq(dailyKnowledgeItems.scheduledDate, date), isNull(dailyKnowledgeItems.scheduledDate)))).orderBy(desc(dailyKnowledgeItems.scheduledDate), desc(dailyKnowledgeItems.publishedAt));
    const seen = await db.select({ itemId: dailyKnowledgeViews.itemId }).from(dailyKnowledgeViews).where(eq(dailyKnowledgeViews.userId, user.userId));
    const seenIds = new Set(seen.map((row) => row.itemId));
    const fresh = candidates.find((item) => !seenIds.has(item.id)) ?? candidates[0];
    if (!fresh) return { item: null, subject: chosen ?? "隨機", date, availableSubjects: DAILY_KNOWLEDGE_SUBJECTS };
    await db.insert(dailyKnowledgeViews).values({ itemId: fresh.id, userId: user.userId }).onConflictDoNothing();
    return { item: fresh, subject: chosen ?? fresh.subject, date, availableSubjects: DAILY_KNOWLEDGE_SUBJECTS };
  }}),
  route({ method: "GET", path: "/admin/daily-knowledge", auth: "admin", handler: async (ctx) => {
    const q = ctx.query.get("q")?.trim() ?? "";
    const status = ctx.query.get("status") ?? "";
    const rows = await db.select().from(dailyKnowledgeItems).where(and(status ? eq(dailyKnowledgeItems.status, status) : undefined, q ? or(ilike(dailyKnowledgeItems.title, `%${q}%`), ilike(dailyKnowledgeItems.content, `%${q}%`), ilike(dailyKnowledgeItems.coreConcept, `%${q}%`)) : undefined)).orderBy(desc(dailyKnowledgeItems.updatedAt)).limit(300);
    return { items: rows, subjects: DAILY_KNOWLEDGE_SUBJECTS };
  }}),
  route({ method: "POST", path: "/admin/daily-knowledge/generate", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser();
    const body = await ctx.json(z.object({ subject, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayStr()) }));
    const result = await generateDailyKnowledge({ subject: body.subject, date: body.date, userId: admin.userId });
    const status = result.duplicate.duplicate ? "rejected" : result.source.verified ? "approved" : "verifying";
    const row = (await db.insert(dailyKnowledgeItems).values({ ...result.draft, sourceUrl: result.draft.sourceUrl || "", status, scheduledDate: body.date, verifiedAt: result.source.verified ? new Date() : null, verificationNote: result.source.note, titleFingerprint: fingerprint(result.draft.title), contentFingerprint: fingerprint(result.draft.content), generationMetadata: { provider: result.meta.provider, model: result.meta.model, duplicate: result.duplicate, source: result.source }, createdBy: admin.userId, updatedBy: admin.userId }).returning())[0];
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "daily_knowledge", action: "generate", resourceId: row.id, metadata: { status: status === "rejected" ? result.duplicate.reason : result.source.note }, ip: ctx.ip });
    return { item: row, duplicate: result.duplicate, source: result.source };
  }}),
  route({ method: "POST", path: "/admin/daily-knowledge", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser(); const body = await ctx.json(draftSchema);
    const existing = await db.select({ title: dailyKnowledgeItems.title, content: dailyKnowledgeItems.content, coreConcept: dailyKnowledgeItems.coreConcept }).from(dailyKnowledgeItems).where(ne(dailyKnowledgeItems.status, "archived")).limit(500);
    const duplicate = compareDailyKnowledge(body, existing);
    if (duplicate.duplicate) throw fail("SYS_CONFLICT", { message: duplicate.reason, details: duplicate.highest });
    const source = await verifyDailyKnowledgeSource(body.sourceUrl);
    const row = (await db.insert(dailyKnowledgeItems).values({ ...body, status: source.verified ? "approved" : "verifying", scheduledDate: body.scheduledDate ?? null, verifiedAt: source.verified ? new Date() : null, verificationNote: source.note, titleFingerprint: fingerprint(body.title), contentFingerprint: fingerprint(body.content), createdBy: admin.userId, updatedBy: admin.userId }).returning())[0];
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "daily_knowledge", action: "create", resourceId: row.id, metadata: { status: source.note }, ip: ctx.ip });
    return { item: row, duplicate, source };
  }}),
  route({ method: "GET", path: "/admin/daily-knowledge/:id", auth: "admin", handler: async (ctx) => { const item = (await db.select().from(dailyKnowledgeItems).where(eq(dailyKnowledgeItems.id, ctx.params.id)).limit(1))[0]; if (!item) throw notFound("找不到每日知識"); return { item }; } }),
  route({ method: "PATCH", path: "/admin/daily-knowledge/:id", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser(); const body = await ctx.json(draftSchema.partial().extend({ status: z.enum(["draft", "verifying", "approved", "published", "rejected", "archived"]).optional(), verificationNote: z.string().max(2000).optional() }));
    const current = (await db.select().from(dailyKnowledgeItems).where(eq(dailyKnowledgeItems.id, ctx.params.id)).limit(1))[0]; if (!current) throw notFound("找不到每日知識");
    if (body.status === "published" && current.status !== "approved" && current.status !== "published") throw fail("SYS_CONFLICT", { message: "只有 approved 的每日知識可以發布。" });
    const source = body.sourceUrl !== undefined ? await verifyDailyKnowledgeSource(body.sourceUrl) : null;
    const patch = { ...body, ...(source ? { verifiedAt: source.verified ? new Date() : null, verificationNote: source.note, status: source.verified && !body.status ? "approved" : body.status } : {}), ...(body.title ? { titleFingerprint: fingerprint(body.title) } : {}), ...(body.content ? { contentFingerprint: fingerprint(body.content) } : {}), ...(body.status === "published" ? { publishedAt: new Date() } : {}), updatedBy: admin.userId, updatedAt: new Date() };
    const row = (await db.update(dailyKnowledgeItems).set(patch).where(eq(dailyKnowledgeItems.id, current.id)).returning())[0];
    await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "daily_knowledge", action: "update", resourceId: row.id, metadata: { status: body.status ?? "content edit" }, ip: ctx.ip });
    return { item: row };
  }}),
  route({ method: "POST", path: "/admin/daily-knowledge/:id/verify", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const item = (await db.select().from(dailyKnowledgeItems).where(eq(dailyKnowledgeItems.id, ctx.params.id)).limit(1))[0]; if (!item) throw notFound("找不到每日知識"); const source = await verifyDailyKnowledgeSource(item.sourceUrl); const row = (await db.update(dailyKnowledgeItems).set({ status: source.verified ? "approved" : "verifying", verifiedAt: source.verified ? new Date() : null, verificationNote: source.note, updatedBy: admin.userId, updatedAt: new Date() }).where(eq(dailyKnowledgeItems.id, item.id)).returning())[0]; await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "daily_knowledge", action: "verify", resourceId: item.id, metadata: { status: source.note }, ip: ctx.ip }); return { item: row, source }; } }),
  route({ method: "DELETE", path: "/admin/daily-knowledge/:id", auth: "admin", handler: async (ctx) => { const admin = ctx.requireUser(); const row = (await db.update(dailyKnowledgeItems).set({ status: "archived", updatedBy: admin.userId, updatedAt: new Date() }).where(eq(dailyKnowledgeItems.id, ctx.params.id)).returning())[0]; if (!row) throw notFound("找不到每日知識"); await writeAudit({ userId: admin.userId, eventType: "admin_operation", module: "daily_knowledge", action: "archive", resourceId: row.id, metadata: { status: "管理員封存每日知識" }, ip: ctx.ip }); return { archived: true }; } }),
];
