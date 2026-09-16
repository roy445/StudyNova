import { and, eq, lte, lt, sql, desc, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  jobQueue,
  users,
  wrongQuestions,
  memberships,
  weeklyExamWeeks,
  activities,
  announcements,
  studyRecords,
  focusSessions,
  notifications,
  userSettings,
  questionAnalysisBatches,
  questionAnalysisJobs,
  questions,
  sessions,
  deletedAccounts,
  aiMemory,
  aiConversations,
  aiMessages,
  fileContexts,
  dailyKnowledgeItems,
} from "@/db/schema";
import { ensureDailyTasks } from "./economy";
import { notify } from "./notify";
import { sendAccountEmail, systemAnnouncementEmailTemplate } from "./email";
import { addDaysStr, isoWeekCode, todayStr, localWeekday, localHm } from "./core";
import { analyzeQuestionWithAi } from "./question-analysis";
import { checkDisplayName } from "./name-moderation";
import { processAiBackgroundBatch } from "./ai-background";
import { DAILY_KNOWLEDGE_SUBJECTS, generateDailyKnowledge, fingerprint } from "./daily-knowledge";

export type JobName =
  | "daily_tasks_refresh"
  | "daily_knowledge_refresh"
  | "review_reminder"
  | "weekly_exam_open"
  | "weekly_report"
  | "membership_expiry"
  | "activity_reminder"
  | "inactive_reminder"
  | "session_cleanup"
  | "study_reminder"
  | "compression_process"
  | "compression_batch"
  | "announcement_publish"
  | "activity_promote"
  | "question_analysis_batch"
  | "ai_background_batch"
  | "data_retention"
  | "name_moderation_scan";


export type JobPayload = Record<string, unknown>;

export interface QueueAdapter {
  readonly name: string;
  enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }): Promise<{ queued: boolean }>;
  drain(limit?: number): Promise<{ processed: number; failed: number; results: Array<{ name: string; ok: boolean; detail: string }> }>;
  health(): Promise<{ status: "healthy" | "warning" | "error"; detail: string; pending: number }>;
}

/* ------------------------------------------------------- job handlers */

const handlers: Record<JobName, (payload: JobPayload) => Promise<string>> = {
  async daily_tasks_refresh() {
    const rows = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    for (const r of rows) await ensureDailyTasks(r.userId);
    return `已為 ${rows.length} 位使用者建立今日任務`;
  },

  async daily_knowledge_refresh() {
    const date = todayStr();
    let published = 0; let skipped = 0;
    for (const subject of DAILY_KNOWLEDGE_SUBJECTS) {
      const existing = await db.select({ id: dailyKnowledgeItems.id }).from(dailyKnowledgeItems).where(and(eq(dailyKnowledgeItems.scheduledDate, date), eq(dailyKnowledgeItems.subject, subject))).limit(1);
      if (existing.length) { skipped += 1; continue; }
      try {
        const result = await generateDailyKnowledge({ subject, date });
        if (result.duplicate.duplicate || !result.source.verified) { skipped += 1; continue; }
        const row = await db.insert(dailyKnowledgeItems).values({ ...result.draft, sourceUrl: result.draft.sourceUrl || "", sourceType: result.draft.sourceType ?? "unknown", sourceId: result.draft.sourceId ?? "", licenseInfo: result.draft.licenseInfo ?? "", originalTitle: result.draft.originalTitle ?? result.draft.title, fetchedAt: new Date(), status: "published", scheduledDate: date, verifiedAt: new Date(), publishedAt: new Date(), verificationNote: result.source.note, titleFingerprint: fingerprint(result.draft.title), contentFingerprint: fingerprint(result.draft.content), generationMetadata: { provider: result.meta.provider, model: result.meta.model, automation: "approved_by_automation", source: result.source } }).onConflictDoNothing().returning({ id: dailyKnowledgeItems.id });
        if (row.length) published += 1; else skipped += 1;
      } catch { skipped += 1; }
    }
    return `每日知識自動化完成：發布 ${published} 科，略過或等待重試 ${skipped} 科`;
  },

  async study_reminder() {
    const today = todayStr();
    const students = await db.select({ userId: users.userId, displayName: users.displayName, goal: userSettings.dailyGoalMinutes }).from(users).leftJoin(userSettings, eq(userSettings.userId, users.userId)).where(and(eq(users.status, "active"), eq(users.role, "student")));
    let sent = 0;
    for (const student of students) {
      const [progress] = await db.select({ minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` }).from(studyRecords).where(and(eq(studyRecords.userId, student.userId), eq(studyRecords.recordDate, today)));
      const goal = student.goal ?? 45;
      if ((progress?.minutes ?? 0) >= goal) continue;
      const created = await notify({ userId: student.userId, kind: "study_reminder", title: "📚 記得今天讀書", body: `${student.displayName}，今天已學習 ${progress?.minutes ?? 0} 分鐘，距離目標還有 ${Math.max(0, goal - (progress?.minutes ?? 0))} 分鐘。`, link: "/dashboard", dedupeKey: `study:${student.userId}:${today}`, push: true });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則每日讀書提醒`;
  },

  async review_reminder() {
    const due = await db
      .select({ userId: wrongQuestions.userId, count: sql<number>`count(*)::int` })
      .from(wrongQuestions)
      .where(and(lte(wrongQuestions.nextReviewAt, new Date()), sql`${wrongQuestions.resolvedAt} is null`))
      .groupBy(wrongQuestions.userId);
    let sent = 0;
    for (const row of due) {
      const created = await notify({
        userId: row.userId,
        kind: "review",
        title: "🧠 今天有錯題等你複習",
        body: `你有 ${row.count} 題待複習，10 分鐘就能完成。`,
        link: "/study?tab=wrong",
        dedupeKey: `review:${row.userId}:${todayStr()}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則複習提醒`;
  },

  async weekly_exam_open() {
    const weeks = await db.select().from(weeklyExamWeeks).where(eq(weeklyExamWeeks.status, "published"));
    const open = weeks.filter((w) => isWeekOpen(w));
    if (!open.length) return "目前沒有開放中的每週小考";
    const students = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    let sent = 0;
    for (const week of open) {
      for (const s of students) {
        const created = await notify({
          userId: s.userId,
          kind: "weekly_exam",
          title: `📚 ${week.title} 已開放`,
          body: "本週補習小考開放中，快去完成快速背誦與測驗！",
          link: "/weekly",
          dedupeKey: `weekopen:${week.id}:${s.userId}:${todayStr()}`,
          push: true,
        });
        if (created) sent += 1;
      }
    }
    return `通知 ${sent} 位學生本週小考開放`;
  },

  async weekly_report() {
    const from = addDaysStr(todayStr(), -7);
    const rows = await db
      .select({ userId: studyRecords.userId, minutes: sql<number>`coalesce(sum(${studyRecords.minutes}),0)::int` })
      .from(studyRecords)
      .where(gte(studyRecords.recordDate, from))
      .groupBy(studyRecords.userId);
    let sent = 0;
    for (const r of rows) {
      const created = await notify({
        userId: r.userId,
        kind: "report",
        title: "📈 你的每週學習報告出爐了",
        body: `過去 7 天你累積學習 ${r.minutes} 分鐘，來看看完整分析。`,
        link: "/report",
        dedupeKey: `report:${r.userId}:${isoWeekCode()}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 份週報通知`;
  },

  async membership_expiry() {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 86_400_000);
    const threeDayWindowStart = new Date(now.getTime() + 2 * 86_400_000);
    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.tier, "pro"), sql`${memberships.expiresAt} is not null`, gte(memberships.expiresAt, threeDayWindowStart), lte(memberships.expiresAt, soon)));
    let sent = 0;
    for (const m of rows) {
      const created = await notify({
        userId: m.userId,
        kind: "membership",
        title: "⏳ Nova Pro 即將到期",
        body: `你的 Nova Pro 還有約 3 天到期（${m.expiresAt?.toISOString().slice(0, 10)}），如果希望續約，請填寫續約意願。`,
        link: "/profile?tab=pass",
        dedupeKey: `proexp:${m.userId}:${m.expiresAt?.toISOString().slice(0, 10)}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則會員到期提醒`;
  },

  async activity_reminder() {
    const now = new Date();
    const live = await db
      .select()
      .from(activities)
      .where(and(eq(activities.published, true), lte(activities.startsAt, now), gte(activities.endsAt, now)));
    if (!live.length) return "沒有進行中的活動";
    const students = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    let sent = 0;
    for (const act of live) {
      for (const s of students) {
        const created = await notify({
          userId: s.userId,
          kind: "activity",
          title: `${act.cover} ${act.title} 進行中`,
          body: act.description.slice(0, 120),
          link: "/challenge?tab=activity",
          dedupeKey: `act:${act.id}:${s.userId}:${todayStr()}`,
        });
        if (created) sent += 1;
      }
    }
    return `通知 ${sent} 位學生活動進行中`;
  },

  async inactive_reminder() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60_000);
    const rows = await db.select({ userId: users.userId, displayName: users.displayName }).from(users).where(and(eq(users.status, "active"), eq(users.role, "student")));
    const messages = [
      { title: "🐦 Novi 的小提醒", body: "你再不來複習，我就要拿望遠鏡找你啦 🔭", link: "/dashboard" },
      { title: "🪶 小鳥飛來報到", body: "今天還沒看到你，來做 10 個單字，讓記憶不要飛走吧！", link: "/study" },
      { title: "😴 Novi 正在等你", body: "只要 5 分鐘也很棒，先從一題錯題開始吧。", link: "/study?tab=wrong" },
      { title: "🎒 書包空位提醒", body: "今天的學習進度還在等你簽到，完成一小步就算勝利！", link: "/dashboard" },
      { title: "✨ 你的連續學習在呼喚你", body: "別讓昨天的努力斷線，Novi 幫你把今天安排得剛剛好。", link: "/report" },
    ];
    let sent = 0;
    for (const row of rows) {
      const current = (await db.select({ count: users.inactiveReminderCount, first: users.inactiveFirstNotifiedAt, second: users.inactiveSecondNotifiedAt, lastLogin: users.lastLoginAt, created: users.createdAt }).from(users).where(eq(users.userId, row.userId)).limit(1))[0];
      const inactiveSince = current?.lastLogin ?? current?.created ?? new Date(0);
      if (inactiveSince > cutoff) continue;
      const now = new Date();
      if ((current?.count ?? 0) === 0) {
        await db.update(users).set({ inactiveReminderCount: 1, inactiveFirstNotifiedAt: now, updatedAt: now }).where(eq(users.userId, row.userId));
      } else if ((current?.count ?? 0) === 1 && current?.first && now.getTime() - current.first.getTime() >= 30 * 86400000) {
        await db.update(users).set({ inactiveReminderCount: 2, inactiveSecondNotifiedAt: now, updatedAt: now }).where(eq(users.userId, row.userId));
      } else if ((current?.count ?? 0) >= 2 && current?.second && now.getTime() - current.second.getTime() >= 30 * 86400000) {
        const reason = "帳號超過一年未使用，經兩次通知後依 StudyNova 非活躍帳號政策刪除。";
        const account = await db.select({ email: users.email, novaId: users.novaId }).from(users).where(eq(users.userId, row.userId)).limit(1);
        if (account[0]) await db.insert(deletedAccounts).values([{ identifierType: "email", identifier: account[0].email.toLowerCase(), reason }, { identifierType: "nova_id", identifier: account[0].novaId.toUpperCase(), reason }]).onConflictDoUpdate({ target: [deletedAccounts.identifierType, deletedAccounts.identifier], set: { reason, deletedAt: now } });
        await db.delete(users).where(eq(users.userId, row.userId));
        sent += 1;
        continue;
      } else continue;
      const message = messages[Math.abs(row.userId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % messages.length];
      const created = await notify({
        userId: row.userId,
        kind: "reminder",
        title: message.title,
        body: `${row.displayName}，${message.body}`,
        link: message.link,
        dedupeKey: `inactive:${row.userId}:${todayStr()}`,
        push: true,
      });
      if (created) sent += 1;
    }
    return `寄出 ${sent} 則久未登入關懷提醒`;
  },

  async data_retention() {
    const now = new Date();
    const memoryCutoff = new Date(now.getTime() - 180 * 86400000);
    const deletedCutoff = new Date(now.getTime() - 30 * 86400000);
    const oldMemory = await db.delete(aiMemory).where(sql`${aiMemory.deletedAt} < ${deletedCutoff} OR (${aiMemory.scope} = 'episodic' AND ${aiMemory.confidence} < 70 AND coalesce(${aiMemory.lastUsedAt}, ${aiMemory.updatedAt}) < ${memoryCutoff})`).returning({ id: aiMemory.id });
    const archived = await db.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.archived, true), sql`${aiConversations.updatedAt} < ${memoryCutoff}`)).limit(500);
    for (const conversation of archived) await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversation.id));
    const contexts = await db.delete(fileContexts).where(sql`${fileContexts.createdAt} < now() - interval '90 days'`).returning({ id: fileContexts.id });
    return `保守清理完成：刪除 ${oldMemory.length} 筆低價值記憶、${contexts.length} 筆過期檔案分析，清理 ${archived.length} 個封存對話訊息`;
  },

  async name_moderation_scan() {
    const rows = await db.select({ userId: users.userId, displayName: users.displayName }).from(users).where(eq(users.status, "active"));
    let blocked = 0;
    for (const row of rows) {
      const check = checkDisplayName(row.displayName);
      if (check.ok) continue;
      const now = new Date();
      await notify({ userId: row.userId, kind: "admin_notice", title: "名稱違反 StudyNova 規範", body: `你的名稱「${row.displayName}」含有不適當內容，帳號已永久封鎖。原因：${check.reason}`, link: "/support", dedupeKey: `name-block:${row.userId}:${now.toISOString().slice(0, 10)}` });
      await db.update(users).set({ status: "blocked", blockedReason: `名稱審查違規：${check.reason}`, blockedAt: now, blockedUntil: null, nameModerationStatus: "blocked", nameModerationReason: check.reason, nameLastCheckedAt: now, updatedAt: now }).where(eq(users.userId, row.userId));
      await db.delete(sessions).where(eq(sessions.userId, row.userId));
      blocked += 1;
    }
    return `名稱巡檢完成：檢查 ${rows.length} 個帳號，永久封鎖 ${blocked} 個違規帳號`;
  },

  async session_cleanup() {
    const { purgeExpiredSessions } = await import("./auth");
    await purgeExpiredSessions();
    await db.delete(notifications).where(sql`${notifications.createdAt} < now() - interval '90 days'`);
    return "已清理過期 session 與 90 天前通知";
  },

  async compression_process(payload) {
    const { processCompressionJob } = await import("./compression");
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    if (!jobId) throw new Error("缺少壓縮工作 ID");
    await processCompressionJob(jobId, (payload.settings ?? {}) as Record<string, number>);
    return `已完成壓縮工作 ${jobId}`;
  },

  async compression_batch(payload) {
    const { processCompressionBatch } = await import("./compression");
    const batchId = typeof payload.batchId === "string" ? payload.batchId : "";
    if (!batchId) throw new Error("缺少批次 ID");
    await processCompressionBatch(batchId, (payload.settings ?? {}) as Record<string, number>);
    return `已完成批次 ZIP ${batchId}`;
  },

  async announcement_publish(payload) {
    const id = typeof payload.announcementId === "string" ? payload.announcementId : "";
    const announcement = id ? (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0] : null;
    if (!announcement) throw new Error("找不到排程公告");
    if (announcement.status === "archived" || announcement.status === "draft") return `公告 ${announcement.title} 仍為${announcement.status === "draft" ? "草稿" : "封存"}，未發布`;
    if (announcement.status !== "published") await db.update(announcements).set({ status: "published" }).where(eq(announcements.id, announcement.id));
    const allUsers = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    const proUsers = await db.select({ userId: memberships.userId, expiresAt: memberships.expiresAt }).from(memberships).where(eq(memberships.tier, "pro"));
    const proIds = new Set(proUsers.filter((row) => !row.expiresAt || new Date(row.expiresAt) > new Date()).map((row) => row.userId));
    const audienceIds = new Set(Array.isArray(announcement.audienceIds) ? announcement.audienceIds : []);
    const targets = allUsers.filter((row) => announcement.audience === "all" || (announcement.audience === "pro" && proIds.has(row.userId)) || (announcement.audience === "users" && audienceIds.has(row.userId)) || (announcement.audience === "group" && audienceIds.has(row.userId)));
    let sent = 0;
    for (const target of targets) {
      const created = await notify({ userId: target.userId, kind: "announcement", title: `📢 ${announcement.title}`, body: announcement.body.slice(0, 200), link: announcement.link, dedupeKey: `ann:${announcement.id}:${target.userId}`, push: announcement.push });
      if (created) sent += 1;
      if (announcement.email) {
        const profile = (await db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.userId, target.userId)).limit(1))[0];
        if (profile?.email) await sendAccountEmail(profile.email, systemAnnouncementEmailTemplate({ displayName: profile.displayName, title: announcement.title, body: announcement.body, link: announcement.link, category: announcement.category, tags: announcement.tags }));
      }
    }
    return `已推播公告 ${announcement.title}，通知 ${sent} 位使用者`;
  },

  async activity_promote(payload) {
    const id = typeof payload.activityId === "string" ? payload.activityId : "";
    const activity = id ? (await db.select().from(activities).where(eq(activities.id, id)).limit(1))[0] : null;
    if (!activity) throw new Error("找不到排程活動");
    if (!activity.notifyOnStart) return `活動 ${activity.title} 已設定不發送開始推播`;
    const allUsers = await db.select({ userId: users.userId }).from(users).where(eq(users.status, "active"));
    let sent = 0;
    for (const target of allUsers) {
      const created = await notify({ userId: target.userId, kind: "activity", title: `◇ 活動開始：${activity.title}`, body: activity.description || "新的學習活動已開始，快來參加吧！", link: "/activities", dedupeKey: `activity-start:${activity.id}:${target.userId}`, push: true });
      if (created) sent += 1;
    }
    return `已推播活動 ${activity.title}，通知 ${sent} 位使用者`;
  },

  async ai_background_batch(payload) {
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    if (!jobId) throw new Error("缺少 AI 背景工作 ID");
    const progress = await processAiBackgroundBatch(jobId);
    if (progress && progress.remainingItems > 0 && ["queued", "processing"].includes(progress.status)) {
      await queue().enqueue({
        name: "ai_background_batch",
        payload: { jobId },
        uniqueKey: `ai-background:${jobId}:continue:${progress.nextRunAt?.getTime() ?? Date.now()}`,
        runAt: progress.nextRunAt ?? new Date(),
      });
    }
    return progress ? `AI 背景工作進度 ${progress.completedItems}/${progress.totalItems}` : "AI 背景工作不存在";
  },

  async question_analysis_batch(payload) {
    const batchId = typeof payload.batchId === "string" ? payload.batchId : "";
    if (!batchId) throw new Error("缺少批次分析 ID");
    const batch = (await db.select().from(questionAnalysisBatches).where(eq(questionAnalysisBatches.id, batchId)).limit(1))[0];
    if (!batch) throw new Error("找不到批次分析");
    if (["completed", "partial", "cancelled"].includes(batch.status)) return `批次 ${batchId} 已完成`;
    await db.update(questionAnalysisBatches).set({ status: "running", updatedAt: new Date() }).where(eq(questionAnalysisBatches.id, batchId));
    let processed = batch.processed;
    let succeeded = batch.succeeded;
    let failed = batch.failed;
    let qualityFailed = batch.qualityFailed;
    for (const questionId of batch.questionIds.slice(batch.processed)) {
      const current = (await db.select({ status: questionAnalysisBatches.status }).from(questionAnalysisBatches).where(eq(questionAnalysisBatches.id, batchId)).limit(1))[0];
      if (current?.status === "cancelled") break;
      const question = (await db.select().from(questions).where(eq(questions.id, questionId)).limit(1))[0];
      try {
        if (!question) throw new Error("題目不存在");
        const existing = (await db.insert(questionAnalysisJobs).values({ questionId, requestedBy: batch.requestedBy, status: "analyzing", attempts: 1 }).returning())[0];
        const analysis = await analyzeQuestionWithAi(question, batch.requestedBy ?? "system");
        await db.update(questionAnalysisJobs).set({ status: analysis.status, result: analysis.result, quality: analysis.quality, updatedAt: new Date() }).where(eq(questionAnalysisJobs.id, existing.id));
        succeeded += 1;
        if (!analysis.quality.passed) qualityFailed += 1;
      } catch (error) {
        failed += 1;
        console.error("[question-analysis-batch] item failed", { batchId, questionId, error });
      }
      processed += 1;
      await db.update(questionAnalysisBatches).set({ processed, succeeded, failed, qualityFailed, updatedAt: new Date() }).where(eq(questionAnalysisBatches.id, batchId));
    }
    const finalStatus = processed >= batch.total ? (failed ? "partial" : "completed") : "cancelled";
    await db.update(questionAnalysisBatches).set({ status: finalStatus, processed, succeeded, failed, qualityFailed, completedAt: new Date(), updatedAt: new Date() }).where(eq(questionAnalysisBatches.id, batchId));
    return `批次分析完成：${succeeded} 成功、${qualityFailed} 品質待審核、${failed} 失敗`;
  },
};

/* ------------------------------------------------------------ helpers */

export function isWeekOpen(week: {
  status: string;
  openMode: string;
  openDays: number[];
  openTime: string;
  closeTime: string;
  openFrom: Date | null;
  openUntil: Date | null;
}): boolean {
  if (week.status !== "published") return false;
  if (week.openMode === "manual_close") return false;
  if (week.openMode === "manual_open") {
    const now = new Date();
    if (week.openFrom && now < new Date(week.openFrom)) return false;
    if (week.openUntil && now > new Date(week.openUntil)) return false;
    return true;
  }
  const day = localWeekday();
  if (!week.openDays.includes(day)) return false;
  const hm = localHm();
  return hm >= week.openTime && hm <= week.closeTime;
}

/* ------------------------------------------------------ pg adapter */

class PostgresQueue implements QueueAdapter {
  readonly name = "postgres";

  async enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }) {
    const rows = await db
      .insert(jobQueue)
      .values({ name: job.name, payload: job.payload ?? {}, uniqueKey: job.uniqueKey, runAt: job.runAt ?? new Date() })
      .onConflictDoNothing()
      .returning({ id: jobQueue.id });
    return { queued: Boolean(rows[0]) };
  }

  async drain(limit = 20) {
    const due = await db
      .select()
      .from(jobQueue)
      .where(and(eq(jobQueue.status, "pending"), lte(jobQueue.runAt, new Date())))
      .orderBy(jobQueue.runAt)
      .limit(limit);
    const results: Array<{ name: string; ok: boolean; detail: string }> = [];
    let processed = 0;
    let failed = 0;
    for (const job of due) {
      const claimed = await db
        .update(jobQueue)
        .set({ status: "running", attempts: sql`${jobQueue.attempts} + 1` })
        .where(and(eq(jobQueue.id, job.id), eq(jobQueue.status, "pending")))
        .returning({ id: jobQueue.id });
      if (!claimed[0]) continue;
      try {
        const handler = handlers[job.name as JobName];
        if (!handler) throw new Error(`unknown job ${job.name}`);
        const detail = await handler(job.payload ?? {});
        await db.update(jobQueue).set({ status: "done", finishedAt: new Date(), lastError: "" }).where(eq(jobQueue.id, job.id));
        results.push({ name: job.name, ok: true, detail });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : "unknown";
        await db.update(jobQueue).set({ status: "failed", lastError: message, finishedAt: new Date() }).where(eq(jobQueue.id, job.id));
        results.push({ name: job.name, ok: false, detail: message });
        failed += 1;
      }
    }
    return { processed, failed, results };
  }

  async health() {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobQueue)
      .where(eq(jobQueue.status, "pending"));
    return { status: "healthy" as const, detail: "PostgreSQL job queue", pending: rows[0]?.count ?? 0 };
  }
}

/* --------------------------------------------------- redis adapter */

class RedisQueue implements QueueAdapter {
  readonly name = "bullmq";
  private fallback = new PostgresQueue();

  async enqueue(job: { name: JobName; payload?: JobPayload; uniqueKey: string; runAt?: Date }) {
    // 沒有明確啟用常駐 BullMQ worker 時，不能只把任務放進 Redis；改走可由 Cron drain 的 PostgreSQL queue。
    if (process.env.STUDYNOVA_BULLMQ_WORKER !== "1") return this.fallback.enqueue(job);
    try {
      const { Queue } = await import("bullmq");
      const queue = new Queue("studynova", { connection: { url: process.env.REDIS_URL! } as never });
      await queue.add(job.name, job.payload ?? {}, {
        jobId: job.uniqueKey,
        delay: job.runAt ? Math.max(0, job.runAt.getTime() - Date.now()) : 0,
        removeOnComplete: 200,
        removeOnFail: 200,
      });
      await queue.close();
      return { queued: true };
    } catch {
      return this.fallback.enqueue(job);
    }
  }

  /** Workers pull from BullMQ (see scripts/worker.ts); drain also flushes the pg mirror. */
  async drain(limit = 20) {
    return this.fallback.drain(limit);
  }

  async health() {
    try {
      const IORedis = (await import("ioredis")).default;
      const client = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, lazyConnect: true });
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      const pg = await this.fallback.health();
      return { status: pong === "PONG" ? ("healthy" as const) : ("warning" as const), detail: "Redis + BullMQ", pending: pg.pending };
    } catch {
      const pg = await this.fallback.health();
      return { status: "warning" as const, detail: "Redis 無法連線，已降級為 PostgreSQL queue", pending: pg.pending };
    }
  }
}

let adapter: QueueAdapter | null = null;
export function queue(): QueueAdapter {
  if (!adapter) adapter = process.env.REDIS_URL ? new RedisQueue() : new PostgresQueue();
  return adapter;
}

export const CRON_TASKS: Array<{ task: JobName; label: string; schedule: string }> = [
  { task: "daily_tasks_refresh", label: "重建每日任務", schedule: "每日 00:05" },
  { task: "daily_knowledge_refresh", label: "每日知識生成與驗證", schedule: "每日 00:10" },
  { task: "review_reminder", label: "錯題複習提醒", schedule: "每日 19:00" },
  { task: "weekly_exam_open", label: "每週小考開放通知", schedule: "每 30 分鐘" },
  { task: "weekly_report", label: "每週學習報告", schedule: "每週一 09:00" },
  { task: "membership_expiry", label: "Nova Pro 到期提醒", schedule: "每日 10:00" },
  { task: "activity_reminder", label: "活動提醒", schedule: "每日 12:00" },
  { task: "inactive_reminder", label: "久未登入關懷提醒", schedule: "每日 18:30" },
  { task: "session_cleanup", label: "Session / 通知清理", schedule: "每日 03:00" },
  { task: "data_retention", label: "保守資料保留清理", schedule: "每日 03:30" },
  { task: "name_moderation_scan", label: "使用者名稱巡檢", schedule: "每 6 小時" },
  { task: "study_reminder", label: "每日讀書提醒", schedule: "每日 20:00" },
];

export async function runCronTask(task: JobName, taskUid: string) {
  const q = queue();
  const { queued } = await q.enqueue({ name: task, uniqueKey: `${task}:${taskUid}` });
  if (!queued) return { deduped: true, processed: 0, failed: 0, results: [] as Array<{ name: string; ok: boolean; detail: string }> };
  const out = await q.drain(50);
  return { deduped: false, ...out };
}

export async function recentJobs(limit = 25) {
  return db.select().from(jobQueue).orderBy(desc(jobQueue.createdAt)).limit(limit);
}

export async function focusMinutesToday(userId: string) {
  const rows = await db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.minutes}),0)::int` })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), sql`${focusSessions.completedAt} >= current_date`));
  return rows[0]?.minutes ?? 0;
}
