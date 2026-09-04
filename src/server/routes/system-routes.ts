import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, notifications, users, novaTransactions, questions, jobQueue, weeklyExamWeeks, storageObjects, featurePermissions } from "@/db/schema";
import { route, type Ctx, type RouteDef } from "../router";
import { badRequest, fail, hashPassword, verifyPassword, generateNovaId, toCsv, todayStr } from "../core";
import { listNotifications, markRead, unreadCount, pushConfigured, sendPush } from "../notify";
import { CRON_TASKS, queue, runCronTask, isWeekOpen, type JobName } from "../queue";
import { storageHealth, activeDriver, putObject, readObject, deleteObject } from "../storage";
import { aiConfigured, providerConfigs, providerMetrics, runAi } from "../ai";
import { grantNova, allFeatureStates, ensureDailyTasks } from "../economy";

type TestResult = { name: string; group: string; status: "PASS" | "FAIL" | "SKIP"; durationMs: number; detail: string };

async function timed(name: string, group: string, fn: () => Promise<string>): Promise<TestResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, group, status: "PASS", durationMs: Date.now() - start, detail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("SKIP:")) return { name, group, status: "SKIP", durationMs: Date.now() - start, detail: msg.slice(5) };
    return { name, group, status: "FAIL", durationMs: Date.now() - start, detail: msg.slice(0, 300) };
  }
}

async function handleCron(ctx: Ctx) {
  const secret = process.env.CRON_SECRET;
  const authorization = ctx.req.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const provided = ctx.req.headers.get("x-cron-secret") ?? ctx.query.get("secret") ?? bearer;
  if (!secret) throw fail("ADMIN_CRON_SECRET_MISSING");
  if (provided !== secret) throw fail("ADMIN_CRON_SECRET_INVALID");
  const task = (ctx.query.get("task") ?? "daily_tasks_refresh") as JobName;
  if (!CRON_TASKS.some((t) => t.task === task)) throw fail("ADMIN_CRON_TASK_UNKNOWN");
  const requestedUid = ctx.query.get("uid") ?? "";
  const taskUid = requestedUid && !requestedUid.includes("%") ? requestedUid : `${todayStr()}:${new Date().getUTCHours()}`;
  return runCronTask(task, taskUid);
}

export const routes: RouteDef[] = [
  /* ------------------------------------------------- notifications */
  route({
    method: "GET",
    path: "/notifications",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { notifications: await listNotifications(user.userId), unread: await unreadCount(user.userId) };
    },
  }),

  route({
    method: "POST",
    path: "/notifications/read",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ id: z.string().uuid().optional() }));
      await markRead(user.userId, body.id);
      return { unread: await unreadCount(user.userId) };
    },
  }),

  route({
    method: "DELETE",
    path: "/notifications/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(notifications).where(and(eq(notifications.id, ctx.params.id), eq(notifications.userId, user.userId)));
      return { deleted: true };
    },
  }),

  /* ---------------------------------------------------------- push */
  route({
    method: "GET",
    path: "/push/config",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.userId));
      return { configured: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? "", subscriptions: subs.length };
    },
  }),

  route({
    method: "POST",
    path: "/push/subscribe",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({ endpoint: z.string().url().max(600), keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }) }),
      );
      if (!pushConfigured()) throw fail("ADMIN_PUSH_NOT_CONFIGURED");
      await db
        .insert(pushSubscriptions)
        .values({ userId: user.userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.userId, p256dh: body.keys.p256dh, auth: body.keys.auth } });
      return { subscribed: true };
    },
  }),

  route({
    method: "POST",
    path: "/push/unsubscribe",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ endpoint: z.string().url().max(600) }));
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.userId), eq(pushSubscriptions.endpoint, body.endpoint)));
      return { unsubscribed: true };
    },
  }),

  route({
    method: "POST",
    path: "/push/test",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return sendPush(user.userId, { title: "StudyNova 測試推播", body: "推播已成功啟用 ✅", link: "/dashboard" });
    },
  }),

  /* ---------------------------------------------------------- cron */
  route({ method: "GET", path: "/system/cron", auth: "none", handler: handleCron }),
  route({ method: "POST", path: "/system/cron", auth: "none", handler: handleCron }),

  route({
    method: "GET",
    path: "/admin/cron",
    auth: "admin",
    handler: async () => {
      const jobs = await db.select().from(jobQueue).orderBy(desc(jobQueue.createdAt)).limit(30);
      const q = queue();
      return { tasks: CRON_TASKS, jobs, adapter: q.name, health: await q.health(), secretConfigured: Boolean(process.env.CRON_SECRET) };
    },
  }),

  route({
    method: "POST",
    path: "/admin/cron/run",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(z.object({ task: z.string().max(60) }));
      if (!CRON_TASKS.some((t) => t.task === body.task)) throw fail("ADMIN_CRON_TASK_UNKNOWN");
      return runCronTask(body.task as JobName, `manual:${Date.now()}`);
    },
  }),

  /* -------------------------------------------------------- health */
  route({
    method: "GET",
    path: "/admin/system/health",
    auth: "admin",
    handler: async () => {
      const out: Array<{ name: string; status: "healthy" | "warning" | "error"; detail: string }> = [];
      const t0 = Date.now();
      try {
        await db.execute(sql`select 1`);
        out.push({ name: "Database", status: "healthy", detail: `PostgreSQL 連線正常（${Date.now() - t0}ms）` });
      } catch {
        out.push({ name: "Database", status: "error", detail: "無法連線資料庫" });
      }
      const q = queue();
      const qh = await q.health();
      out.push({ name: "Queue / Worker", status: qh.status, detail: `${q.name}｜待處理 ${qh.pending}` });
      out.push({
        name: "Redis",
        status: process.env.REDIS_URL ? qh.status : "warning",
        detail: process.env.REDIS_URL ? qh.detail : "未設定 REDIS_URL，使用 PostgreSQL Queue Adapter",
      });
      const sh = await storageHealth();
      out.push({ name: "Storage", status: sh.status, detail: sh.detail });
      const providers = await providerMetrics();
      const okProvider = providers.find((p) => p.configured && p.enabled && !p.cooldownUntil);
      out.push({
        name: "AI Provider",
        status: !aiConfigured() ? "error" : okProvider ? "healthy" : "warning",
        detail: aiConfigured() ? `可用：${providers.filter((p) => p.configured).map((p) => p.provider).join(", ")}` : "未設定任何 AI API Key",
      });
      out.push({ name: "OCR / TTS", status: aiConfigured() ? "healthy" : "warning", detail: aiConfigured() ? "使用 AI Provider 視覺與語音能力" : "需要 AI Provider" });
      out.push({ name: "Push", status: pushConfigured() ? "healthy" : "warning", detail: pushConfigured() ? "VAPID 已設定" : "未設定 VAPID 金鑰" });
      out.push({ name: "Cron", status: process.env.CRON_SECRET ? "healthy" : "warning", detail: process.env.CRON_SECRET ? "CRON_SECRET 已設定" : "未設定 CRON_SECRET" });
      const [obj] = await db.select({ c: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${storageObjects.sizeBytes}),0)::int` }).from(storageObjects);
      out.push({ name: "Object Usage", status: "healthy", detail: `${obj?.c ?? 0} 個檔案／${Math.round((obj?.bytes ?? 0) / 1024)} KB（driver: ${activeDriver()}）` });
      return { services: out, checkedAt: new Date().toISOString() };
    },
  }),

  /* --------------------------------------------------- test center */
  route({
    method: "POST",
    path: "/admin/tests/run",
    auth: "admin",
    rate: { limit: 20, windowSec: 600 },
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const results: TestResult[] = [];

      results.push(await timed("資料庫連線", "core", async () => {
        const r = await db.execute(sql`select now() as now`);
        return `now = ${(r.rows[0] as { now: string }).now}`;
      }));

      results.push(await timed("密碼雜湊 / 驗證", "auth", async () => {
        const hash = hashPassword("Test#12345");
        if (!verifyPassword("Test#12345", hash)) throw new Error("正確密碼驗證失敗");
        if (verifyPassword("wrong", hash)) throw new Error("錯誤密碼竟然通過");
        return "scrypt 雜湊與驗證正常";
      }));

      results.push(await timed("NOVA ID 產生唯一性", "auth", async () => {
        const set = new Set<string>();
        for (let i = 0; i < 500; i += 1) set.add(generateNovaId());
        if (set.size !== 500) throw new Error("產生重複 NOVA ID");
        return "500 組皆唯一";
      }));

      results.push(await timed("Session / RBAC", "auth", async () => {
        if (admin.role !== "admin" && admin.role !== "owner") throw new Error("RBAC 判斷錯誤");
        const [count] = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(eq(users.status, "active"));
        return `目前登入者角色 ${admin.role}，活躍使用者 ${count?.c ?? 0}`;
      }));

      results.push(await timed("Nova 交易冪等性", "economy", async () => {
        const key = `selftest:${admin.userId}:${Date.now()}`;
        const first = await grantNova({ userId: admin.userId, amount: 1, reason: "系統自我測試", source: "test", idempotencyKey: key });
        const second = await grantNova({ userId: admin.userId, amount: 1, reason: "系統自我測試", source: "test", idempotencyKey: key });
        if (second.applied) throw new Error("重複交易未被阻擋");
        await grantNova({ userId: admin.userId, amount: -1, reason: "系統自我測試回收", source: "test", idempotencyKey: `${key}:revert` });
        return `第一次餘額 ${first.balance}，重複請求已阻擋`;
      }));

      results.push(await timed("Nova 餘額不足保護", "economy", async () => {
        try {
          await grantNova({ userId: admin.userId, amount: -999_999_999, reason: "系統自我測試（應失敗）", source: "test", idempotencyKey: `selftest-neg:${Date.now()}` });
        } catch {
          return "餘額不足時正確拒絕";
        }
        throw new Error("餘額不足竟然成功扣款");
      }));

      results.push(await timed("功能額度設定", "economy", async () => {
        const states = await allFeatureStates(admin.userId);
        if (!states.length) throw new Error("尚未建立 feature_permissions");
        return `${states.length} 個功能已設定額度`;
      }));

      results.push(await timed("每日任務建立", "learning", async () => {
        const tasks = await ensureDailyTasks(admin.userId);
        return `今日任務 ${tasks.length} 項`;
      }));

      results.push(await timed("題庫與去重", "content", async () => {
        const [c] = await db.select({ c: sql<number>`count(*)::int` }).from(questions);
        const [dupes] = await db.execute(sql`select count(*)::int as c from (select fingerprint from questions group by fingerprint having count(*) > 1) t`).then((r) => r.rows as Array<{ c: number }>);
        if ((dupes?.c ?? 0) > 0) throw new Error("題庫存在重複指紋");
        return `題庫 ${c?.c ?? 0} 題，無重複`;
      }));

      results.push(await timed("Storage 寫入 / 讀取 / 刪除", "storage", async () => {
        const payload = Buffer.from(`studynova-selftest-${Date.now()}`);
        const obj = await putObject({ userId: admin.userId, filename: "selftest.txt", mimeType: "text/plain", data: payload, allow: ["text"] });
        const read = await readObject(obj.id);
        if (read.data.toString() !== payload.toString()) throw new Error("讀回內容不一致");
        await deleteObject(obj.id, admin.userId, true);
        return `driver=${activeDriver()}，往返一致`;
      }));

      results.push(await timed("Queue / Cron", "infra", async () => {
        const res = await runCronTask("session_cleanup", `selftest:${Date.now()}`);
        return `處理 ${res.processed} 個工作，失敗 ${res.failed}`;
      }));

      results.push(await timed("Web Push 設定", "infra", async () => {
        if (!pushConfigured()) throw new Error("SKIP:未設定 VAPID 金鑰");
        const [subs] = await db.select({ c: sql<number>`count(*)::int` }).from(pushSubscriptions);
        return `VAPID 已設定，訂閱數 ${subs?.c ?? 0}`;
      }));

      results.push(await timed("AI Provider 連線", "ai", async () => {
        if (!aiConfigured()) throw new Error("SKIP:未設定任何 AI API Key");
        const res = await runAi({ feature: "selftest", userId: admin.userId, parts: [{ kind: "text", text: "回覆兩個字：正常" }], maxOutputTokens: 20, temperature: 0 });
        return `${res.provider}/${res.model} 回應 ${res.latencyMs}ms`;
      }));

      results.push(await timed("AI Fallback 設定鏈", "ai", async () => {
        const configured = providerConfigs().filter((p) => p.apiKey);
        if (!configured.length) throw new Error("SKIP:未設定任何 AI API Key");
        return `順序：${providerConfigs().map((p) => `${p.priority}.${p.name}${p.apiKey ? "✓" : "✗"}`).join(" → ")}`;
      }));

      results.push(await timed("每週小考開放判斷", "weekly", async () => {
        const weeks = await db.select().from(weeklyExamWeeks).limit(20);
        const open = weeks.filter((w) => isWeekOpen(w)).length;
        return `${weeks.length} 個週次，${open} 個開放中`;
      }));

      results.push(await timed("CSV 匯出（UTF-8 BOM）", "export", async () => {
        const csv = toCsv([{ novaId: "NV-TEST", 名稱: "測試" }]);
        if (!csv.startsWith("\uFEFF")) throw new Error("缺少 BOM");
        return "CSV 產生正常";
      }));

      results.push(await timed("Nova Ledger 完整性", "economy", async () => {
        const bad = await db.execute(sql`
          select count(*)::int as c from (
            select user_id, sum(amount) as s from nova_transactions group by user_id
          ) t join nova_accounts a on a.user_id = t.user_id where a.balance <> t.s`);
        const c = (bad.rows[0] as { c: number }).c;
        if (c > 0) throw new Error(`${c} 個帳戶餘額與 ledger 不一致`);
        return "所有帳戶餘額與交易紀錄一致";
      }));

      const summary = {
        total: results.length,
        pass: results.filter((r) => r.status === "PASS").length,
        fail: results.filter((r) => r.status === "FAIL").length,
        skip: results.filter((r) => r.status === "SKIP").length,
        durationMs: results.reduce((a, b) => a + b.durationMs, 0),
      };
      return { results, summary, ranAt: new Date().toISOString() };
    },
  }),

  route({
    method: "GET",
    path: "/admin/usage",
    auth: "admin",
    handler: async () => {
      const perms = await db.select().from(featurePermissions).orderBy(featurePermissions.feature);
      const usage = await db.execute(sql`
        select feature, sum(count)::int as total, count(distinct user_id)::int as users
        from feature_usage where usage_date >= (current_date - interval '30 days')::text
        group by feature order by total desc`);
      return { permissions: perms, usage: usage.rows };
    },
  }),

  route({
    method: "GET",
    path: "/system/status",
    auth: "none",
    handler: async () => {
      await db.execute(sql`select 1`);
      return {
        app: "StudyNova AI",
        status: "ok",
        ai: aiConfigured(),
        push: pushConfigured(),
        storage: activeDriver(),
        queue: queue().name,
        time: new Date().toISOString(),
      };
    },
  }),
];
