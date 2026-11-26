import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { learningVideoAuthorizations, learningVideoRedemptions, learningVideoTrialCodes, learningVideoWatchLogs, learningVideos, memberships } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { fail, notFound } from "../core";
import { isProUser } from "../economy";
import { deleteObject, putObject, readObject } from "../storage";

const idSchema = z.string().uuid();
const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
const publicVideo = (row: typeof learningVideos.$inferSelect) => ({ id: row.id, title: row.title, description: row.description, subject: row.subject, chapter: row.chapter, status: row.status, proOnly: row.proOnly, publishedAt: row.publishedAt, hasVideo: Boolean(row.videoObjectId), coverObjectId: row.coverObjectId });

async function getPublished(videoId: string) {
  const row = (await db.select().from(learningVideos).where(and(eq(learningVideos.id, videoId), eq(learningVideos.status, "published"))).limit(1))[0];
  if (!row || !row.videoObjectId) throw notFound("影片目前尚未發布或檔案不存在");
  return row;
}

async function authorize(videoId: string, userId: string) {
  const video = await getPublished(videoId);
  const pro = await isProUser(userId);
  if (pro && video.proOnly) return { video, source: "pro" as const };
  const grant = (await db.select({ source: learningVideoAuthorizations.source }).from(learningVideoAuthorizations).where(and(eq(learningVideoAuthorizations.videoId, videoId), eq(learningVideoAuthorizations.userId, userId))).limit(1))[0];
  if (!video.proOnly || grant) return { video, source: (grant?.source ?? "open") as "trial" | "open" };
  throw fail("QUOTA_PRO_REQUIRED", { message: "這部段考重點影片需要 Nova Pro，或先輸入有效試看碼解鎖。" });
}

export const routes: RouteDef[] = [
  route({ method: "GET", path: "/learning/videos", auth: "user", handler: async () => {
    const rows = await db.select().from(learningVideos).where(eq(learningVideos.status, "published")).orderBy(desc(learningVideos.publishedAt), desc(learningVideos.createdAt));
    return { videos: rows.map(publicVideo), protection: { noPermanentUrl: true, downloadsDisabled: true, note: "瀏覽器播放無法阻止外部錄影；平台不提供下載管道。" } };
  }}),
  route({ method: "POST", path: "/learning/videos/:id/redeem", auth: "user", rate: { limit: 8, windowSec: 3600, key: "video-trial-redeem" }, handler: async (ctx) => {
    const user = ctx.requireUser(); const body = await ctx.json(z.object({ code: z.string().trim().min(4).max(80) })); const video = await getPublished(ctx.params.id); const codeHash = hashCode(body.code);
    const result = await db.transaction(async (tx) => {
      const trial = (await tx.select().from(learningVideoTrialCodes).where(and(eq(learningVideoTrialCodes.videoId, video.id), eq(learningVideoTrialCodes.codeHash, codeHash), eq(learningVideoTrialCodes.enabled, true))).limit(1))[0];
      if (!trial || (trial.expiresAt && trial.expiresAt <= new Date()) || trial.usedCount >= trial.maxUses) throw fail("COUPON_INVALID", { message: "試看碼無效、已過期或已達使用次數。" });
      const existing = (await tx.select({ id: learningVideoRedemptions.id }).from(learningVideoRedemptions).where(and(eq(learningVideoRedemptions.codeId, trial.id), eq(learningVideoRedemptions.userId, user.userId))).limit(1))[0];
      if (existing) return { already: true };
      const consumed = await tx.update(learningVideoTrialCodes).set({ usedCount: sql`${learningVideoTrialCodes.usedCount} + 1` }).where(and(eq(learningVideoTrialCodes.id, trial.id), sql`${learningVideoTrialCodes.usedCount} < ${learningVideoTrialCodes.maxUses}`)).returning({ id: learningVideoTrialCodes.id });
      if (!consumed.length) throw fail("COUPON_LIMIT_REACHED", { message: "這組試看碼剛剛已達使用次數上限。" });
      await tx.insert(learningVideoRedemptions).values({ codeId: trial.id, videoId: video.id, userId: user.userId });
      await tx.insert(learningVideoAuthorizations).values({ videoId: video.id, userId: user.userId, source: "trial" }).onConflictDoUpdate({ target: [learningVideoAuthorizations.userId, learningVideoAuthorizations.videoId], set: { source: "trial", lastAuthorizedAt: new Date() } });
      return { already: false };
    });
    return { videoId: video.id, unlocked: true, alreadyRedeemed: result.already, message: result.already ? "你已經解鎖這部影片。" : "試看碼兌換成功，現在可以觀看這部影片。" };
  }}),
  route({ method: "GET", path: "/learning/videos/:id/access", auth: "user", handler: async (ctx) => {
    const user = ctx.requireUser(); await authorize(ctx.params.id, user.userId); return { canWatch: true };
  }}),
  route({ method: "GET", path: "/learning/videos/:id/stream", auth: "user", rate: { limit: 120, windowSec: 3600, key: "video-stream" }, handler: async (ctx) => {
    const user = ctx.requireUser(); const { video } = await authorize(ctx.params.id, user.userId); const object = await readObject(video.videoObjectId!);
    await db.insert(learningVideoWatchLogs).values({ videoId: video.id, userId: user.userId });
    return new Response(object.data as unknown as BodyInit, { status: 200, headers: { "Content-Type": object.mimeType, "Content-Length": String(object.data.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Accept-Ranges": "none" } });
  }}),
  route({ method: "POST", path: "/learning/videos/:id/heartbeat", auth: "user", rate: { limit: 240, windowSec: 3600, key: "video-heartbeat" }, handler: async (ctx) => {
    const user = ctx.requireUser(); await authorize(ctx.params.id, user.userId); const body = await ctx.json(z.object({ watchedSeconds: z.number().int().min(0).max(86400), completed: z.boolean().optional() }));
    const log = (await db.select({ id: learningVideoWatchLogs.id }).from(learningVideoWatchLogs).where(and(eq(learningVideoWatchLogs.videoId, ctx.params.id), eq(learningVideoWatchLogs.userId, user.userId))).orderBy(desc(learningVideoWatchLogs.startedAt)).limit(1))[0];
    if (log) await db.update(learningVideoWatchLogs).set({ watchedSeconds: body.watchedSeconds, completed: body.completed ?? false, lastHeartbeatAt: new Date() }).where(eq(learningVideoWatchLogs.id, log.id));
    return { saved: true };
  }}),
  route({ method: "GET", path: "/admin/learning/videos", auth: "admin", handler: async () => {
    const rows = await db.select().from(learningVideos).orderBy(desc(learningVideos.updatedAt)); return { videos: rows.map(publicVideo) };
  }}),
  route({ method: "POST", path: "/admin/learning/videos", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser(); const form = await ctx.formData(); const title = String(form.get("title") ?? "").trim(); if (!title) throw fail("REQ_VALIDATION", { message: "請填寫影片標題" });
    const videoFile = form.get("video"); const coverFile = form.get("cover"); let videoObjectId: string | undefined; let coverObjectId: string | undefined;
    if (videoFile instanceof File) { const mime = videoFile.type.split(";")[0].toLowerCase(); if (!mime.startsWith("video/")) throw fail("FILE_MIME_UNSUPPORTED", { message: "影片檔案格式不支援" }); videoObjectId = (await putObject({ userId: admin.userId, filename: videoFile.name, mimeType: mime, data: Buffer.from(await videoFile.arrayBuffer()), allow: ["video"] })).id; }
    if (coverFile instanceof File) { coverObjectId = (await putObject({ userId: admin.userId, filename: coverFile.name, mimeType: coverFile.type || "image/jpeg", data: Buffer.from(await coverFile.arrayBuffer()), allow: ["image"] })).id; }
    const row = (await db.insert(learningVideos).values({ title, description: String(form.get("description") ?? ""), subject: String(form.get("subject") ?? "英文"), chapter: String(form.get("chapter") ?? ""), proOnly: String(form.get("proOnly") ?? "true") !== "false", videoObjectId, coverObjectId, createdBy: admin.userId }).returning())[0]; return { video: publicVideo(row) };
  }}),
  route({ method: "PATCH", path: "/admin/learning/videos/:id", auth: "admin", handler: async (ctx) => {
    const body = await ctx.json(z.object({ status: z.enum(["draft", "published", "disabled"]).optional(), proOnly: z.boolean().optional(), title: z.string().trim().min(1).optional(), description: z.string().optional(), subject: z.string().optional(), chapter: z.string().optional() }));
    const patch = { ...body, publishedAt: body.status === "published" ? new Date() : undefined, updatedAt: new Date() }; const row = (await db.update(learningVideos).set(patch).where(eq(learningVideos.id, ctx.params.id)).returning())[0]; if (!row) throw notFound("找不到影片"); return { video: publicVideo(row) };
  }}),
  route({ method: "POST", path: "/admin/learning/videos/:id/trial-codes", auth: "admin", handler: async (ctx) => {
    const admin = ctx.requireUser(); const video = (await db.select({ id: learningVideos.id }).from(learningVideos).where(eq(learningVideos.id, ctx.params.id)).limit(1))[0]; if (!video) throw notFound("找不到影片"); const body = await ctx.json(z.object({ expiresAt: z.string().datetime().nullable().optional(), maxUses: z.number().int().min(1).max(100000).default(1) }));
    const code = `SN-${randomBytes(5).toString("hex").toUpperCase()}`; const row = (await db.insert(learningVideoTrialCodes).values({ videoId: ctx.params.id, codeHash: hashCode(code), codeLast4: code.slice(-4), expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, maxUses: body.maxUses, createdBy: admin.userId }).returning({ id: learningVideoTrialCodes.id, expiresAt: learningVideoTrialCodes.expiresAt, maxUses: learningVideoTrialCodes.maxUses }))[0]; return { code, ...row };
  }}),
  route({ method: "GET", path: "/admin/learning/videos/:id/trial-codes", auth: "admin", handler: async (ctx) => {
    const codes = await db.select({ id: learningVideoTrialCodes.id, codeLast4: learningVideoTrialCodes.codeLast4, expiresAt: learningVideoTrialCodes.expiresAt, maxUses: learningVideoTrialCodes.maxUses, usedCount: learningVideoTrialCodes.usedCount, enabled: learningVideoTrialCodes.enabled, createdAt: learningVideoTrialCodes.createdAt }).from(learningVideoTrialCodes).where(eq(learningVideoTrialCodes.videoId, ctx.params.id)).orderBy(desc(learningVideoTrialCodes.createdAt)); return { codes };
  }}),
];
