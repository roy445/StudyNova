import { z } from "zod";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiConversations,
  aiMessages,
  aiMemory,
  studyMaterials,
  wrongQuestions,
  questions,
  studyPlans,
  tasks,
  notes,
  quizzes,
  gradeRecords,
  userSettings,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, todayStr } from "../core";
import { consumeFeature } from "../economy";
import { runAiJson, aiConfigured } from "../ai";
import { subjectStats, buildPlan } from "./learning-routes";
import { generateQuestions } from "./quiz-routes";

const MODES = {
  teacher: "學習教練模式：像一位有耐心的台灣國高中學習教練，先確認學生理解程度，再一步步教學。",
  solve: "解題模式：完整寫出解題步驟與最後答案，指出常見錯誤。",
  hint: "提示模式：絕對不要直接給答案，只給循序漸進的提示與引導問題。",
  exam: "考試模式：用考題口吻出題並在學生回答後給分與講評。",
  note: "筆記模式：把內容整理成結構化 markdown 筆記，重點條列。",
  wrong: "錯題模式：針對錯題找出錯誤原因、提供更簡單解法與類似題。",
  review: "複習模式：規劃複習順序，做間隔重複建議。",
  quick: "快速模式：用 3 句話內回答，直接給結論。",
} as const;

const CONTEXT_KEYS = ["grades", "wrong", "materials", "plan", "tasks", "settings"] as const;

async function buildContext(userId: string, allow: string[], materialId: string | null) {
  const parts: string[] = [];
  if (allow.includes("settings")) {
    const s = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
    if (s) parts.push(`【學習設定】${s.schoolLevel === "junior" ? "國中" : "高中"}${s.grade}年級，每日目標 ${s.dailyGoalMinutes} 分鐘，英文程度 ${s.englishLevel}，偏好科目：${s.favoriteSubjects.join("、") || "未設定"}`);
  }
  if (allow.includes("grades")) {
    const stats = await subjectStats(userId);
    if (stats.length) parts.push(`【成績趨勢】${stats.map((s) => `${s.subject}: ${s.series.map((x) => Math.round(x.percentage)).join("→")}（平均 ${s.average}）`).join("；")}`);
    const recent = await db.select().from(gradeRecords).where(eq(gradeRecords.userId, userId)).orderBy(desc(gradeRecords.examDate)).limit(5);
    if (recent.length) parts.push(`【最近成績】${recent.map((r) => `${r.examDate} ${r.subject} ${r.examName} ${r.score}/${r.fullScore}`).join("；")}`);
  }
  if (allow.includes("wrong")) {
    const rows = await db
      .select({ stem: questions.stem, subject: wrongQuestions.subject, answer: questions.answer, count: wrongQuestions.wrongCount })
      .from(wrongQuestions)
      .innerJoin(questions, eq(questions.id, wrongQuestions.questionId))
      .where(and(eq(wrongQuestions.userId, userId), isNull(wrongQuestions.resolvedAt)))
      .orderBy(desc(wrongQuestions.wrongCount))
      .limit(8);
    if (rows.length) parts.push(`【錯題】${rows.map((r) => `[${r.subject}] ${r.stem.slice(0, 60)}（錯 ${r.count} 次，正解 ${r.answer.join("/")}）`).join("；")}`);
  }
  if (allow.includes("plan")) {
    const p = (await db.select().from(studyPlans).where(and(eq(studyPlans.userId, userId), eq(studyPlans.planDate, todayStr()))).limit(1))[0];
    if (p) parts.push(`【今日計畫】共 ${p.totalMinutes} 分鐘：${p.blocks.map((b) => `${b.subject} ${b.minutes} 分（${b.focus}）${b.done ? "已完成" : ""}`).join("；")}`);
  }
  if (allow.includes("tasks")) {
    const rows = await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.done, false))).limit(10);
    if (rows.length) parts.push(`【待辦】${rows.map((t) => t.title).join("；")}`);
  }
  if (allow.includes("materials") && materialId) {
    const m = (await db.select().from(studyMaterials).where(eq(studyMaterials.id, materialId)).limit(1))[0];
    if (m && m.userId === userId) parts.push(`【教材：${m.title}】\n${m.content.slice(0, 8000)}`);
  }
  const mem = await db.select().from(aiMemory).where(eq(aiMemory.userId, userId)).limit(20);
  if (mem.length) parts.push(`【長期記憶】${mem.map((m) => `${m.key}: ${m.value}`).join("；")}`);
  return parts.join("\n\n");
}

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/ai/conversations",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, user.userId))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(60);
      return { conversations: rows, aiEnabled: aiConfigured() };
    },
  }),

  route({
    method: "POST",
    path: "/ai/conversations",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().max(80).optional(),
          mode: z.enum(["teacher", "solve", "hint", "exam", "note", "wrong", "review", "quick"]).default("teacher"),
          allowContext: z.array(z.enum(CONTEXT_KEYS)).max(6).default([]),
          contextMaterialId: z.string().uuid().nullable().optional(),
        }),
      );
      const rows = await db
        .insert(aiConversations)
        .values({
          userId: user.userId,
          title: body.title || "新的對話",
          mode: body.mode,
          allowContext: body.allowContext,
          contextMaterialId: body.contextMaterialId ?? null,
        })
        .returning();
      return { conversation: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/ai/conversations/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const conv = (await db.select().from(aiConversations).where(eq(aiConversations.id, ctx.params.id)).limit(1))[0];
      if (!conv) throw notFound("找不到對話");
      if (conv.userId !== user.userId) throw forbidden();
      const msgs = await db
        .select({
          id: aiMessages.id,
          conversationId: aiMessages.conversationId,
          role: aiMessages.role,
          content: aiMessages.content,
          action: aiMessages.action,
          actionStatus: aiMessages.actionStatus,
          createdAt: aiMessages.createdAt,
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conv.id))
        .orderBy(asc(aiMessages.createdAt))
        .limit(200);
      return { conversation: conv, messages: msgs };
    },
  }),

  route({
    method: "PATCH",
    path: "/ai/conversations/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(
        z.object({
          title: z.string().min(1).max(80).optional(),
          archived: z.boolean().optional(),
          mode: z.enum(["teacher", "solve", "hint", "exam", "note", "wrong", "review", "quick"]).optional(),
          allowContext: z.array(z.enum(CONTEXT_KEYS)).max(6).optional(),
          contextMaterialId: z.string().uuid().nullable().optional(),
        }),
      );
      const conv = (await db.select().from(aiConversations).where(eq(aiConversations.id, ctx.params.id)).limit(1))[0];
      if (!conv) throw notFound("找不到對話");
      if (conv.userId !== user.userId) throw forbidden();
      const rows = await db.update(aiConversations).set({ ...body, updatedAt: new Date() }).where(eq(aiConversations.id, conv.id)).returning();
      return { conversation: rows[0] };
    },
  }),

  route({
    method: "DELETE",
    path: "/ai/conversations/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db
        .delete(aiConversations)
        .where(and(eq(aiConversations.id, ctx.params.id), eq(aiConversations.userId, user.userId)))
        .returning({ id: aiConversations.id });
      if (!deleted[0]) throw notFound("找不到對話");
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/ai/conversations/:id/messages",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ content: z.string().min(1, "請輸入訊息").max(4000) }));
      const conv = (await db.select().from(aiConversations).where(eq(aiConversations.id, ctx.params.id)).limit(1))[0];
      if (!conv) throw notFound("找不到對話");
      if (conv.userId !== user.userId) throw forbidden();
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      await consumeFeature(user.userId, "ai_context");

      await db.insert(aiMessages).values({ conversationId: conv.id, role: "user", content: body.content });
      const history = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conv.id)).orderBy(asc(aiMessages.createdAt)).limit(30);
      const context = await buildContext(user.userId, conv.allowContext, conv.contextMaterialId);

      const { data, meta } = await runAiJson<{ reply?: string; action?: { type?: string; payload?: Record<string, unknown>; preview?: string } | null; memory?: Array<{ key: string; value: string }> }>(
        {
          feature: "ai_chat",
          userId: user.userId,
          system:
            `你是 StudyNova 的 AI 學習助理 Novi，服務台灣國高中學生。${MODES[conv.mode as keyof typeof MODES] ?? MODES.teacher}\n` +
            "你不能自行修改使用者資料。若需要建立任務／筆記／測驗或修改讀書計畫，請在 action 欄位提出建議，等使用者確認。\n" +
            '回傳 JSON：{"reply":"回覆內容（markdown）","action":{"type":"create_task|create_note|create_quiz|update_plan","payload":{...},"preview":"一句話說明將要做什麼"}|null,"memory":[{"key":"","value":""}]}\n' +
            "create_task payload：{title, detail}；create_note payload：{title, subject, body}；create_quiz payload：{subject, topic, count, difficulty, sourceText}；update_plan payload：{blocks:[{subject,minutes,focus}]}。\n" +
            "繁體中文回答。不得杜撰使用者資料。",
          parts: [
            { kind: "text", text: context ? `使用者已授權的學習資料：\n${context}` : "使用者未授權任何個人資料，只能根據對話內容回答。" },
            { kind: "text", text: `對話紀錄：\n${history.map((m) => `${m.role === "user" ? "學生" : "Novi"}：${m.content}`).join("\n").slice(-8000)}` },
          ],
          maxOutputTokens: 2200,
        },
        {},
      );

      const reply = (data.reply ?? "").trim() || "我這次沒有產生內容，請再說一次你的問題。";
      const actionTypes = ["create_task", "create_note", "create_quiz", "update_plan"];
      const action = data.action && actionTypes.includes(String(data.action.type)) ? data.action : null;

      const inserted = await db
        .insert(aiMessages)
        .values({
          conversationId: conv.id,
          role: "assistant",
          content: reply,
          provider: meta.provider,
          model: meta.model,
          action: action ? (action as Record<string, unknown>) : null,
          actionStatus: action ? "pending" : "none",
        })
        .returning();

      for (const m of (data.memory ?? []).slice(0, 5)) {
        if (!m?.key) continue;
        await db
          .insert(aiMemory)
          .values({ userId: user.userId, key: String(m.key).slice(0, 60), value: String(m.value ?? "").slice(0, 400) })
          .onConflictDoUpdate({ target: [aiMemory.userId, aiMemory.key], set: { value: String(m.value ?? "").slice(0, 400), updatedAt: new Date() } });
      }

      if (history.length <= 2) {
        await db.update(aiConversations).set({ title: body.content.slice(0, 30), updatedAt: new Date() }).where(eq(aiConversations.id, conv.id));
      } else {
        await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conv.id));
      }

      const message = inserted[0];
      return {
        message: {
          id: message.id,
          conversationId: message.conversationId,
          role: message.role,
          content: message.content,
          action: message.action,
          actionStatus: message.actionStatus,
          createdAt: message.createdAt,
        },
      };
    },
  }),

  route({
    method: "POST",
    path: "/ai/messages/:id/action",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ confirm: z.boolean() }));
      const msg = (await db.select().from(aiMessages).where(eq(aiMessages.id, ctx.params.id)).limit(1))[0];
      if (!msg) throw notFound("找不到訊息");
      const conv = (await db.select().from(aiConversations).where(eq(aiConversations.id, msg.conversationId)).limit(1))[0];
      if (!conv || conv.userId !== user.userId) throw forbidden();
      if (msg.actionStatus !== "pending" || !msg.action) throw fail("AI_ACTION_INVALID");

      if (!body.confirm) {
        await db.update(aiMessages).set({ actionStatus: "rejected" }).where(eq(aiMessages.id, msg.id));
        return { status: "rejected" };
      }

      const action = msg.action as { type: string; payload?: Record<string, unknown> };
      const payload = action.payload ?? {};
      let result: Record<string, unknown> = {};

      if (action.type === "create_task") {
        const parsed = z.object({ title: z.string().min(1).max(120), detail: z.string().max(1000).optional() }).parse(payload);
        const rows = await db.insert(tasks).values({ userId: user.userId, title: parsed.title, detail: parsed.detail ?? "", source: "ai" }).returning();
        result = { task: rows[0] };
      } else if (action.type === "create_note") {
        const parsed = z.object({ title: z.string().min(1).max(120), subject: z.string().max(20).default("其他"), body: z.string().max(20000) }).parse(payload);
        const rows = await db.insert(notes).values({ userId: user.userId, title: parsed.title, subject: parsed.subject, body: parsed.body, source: "ai" }).returning();
        result = { note: rows[0] };
      } else if (action.type === "create_quiz") {
        const parsed = z
          .object({
            subject: z.string().min(1).max(20),
            topic: z.string().max(80).default(""),
            count: z.number().int().min(1).max(10).default(5),
            difficulty: z.enum(["easy", "normal", "hard", "exam", "advanced"]).default("normal"),
            sourceText: z.string().max(12000).default(""),
          })
          .parse(payload);
        if (parsed.sourceText.trim().length < 20) throw fail("REQ_CONTENT_TOO_SHORT", { message: "Novi 提供的教材內容不足，無法建立測驗" });
        await consumeFeature(user.userId, "ai_practice");
        const ids = await generateQuestions({
          userId: user.userId,
          subject: parsed.subject,
          topic: parsed.topic,
          sourceText: parsed.sourceText,
          count: parsed.count,
          difficulty: parsed.difficulty,
          type: "single",
          level: "junior",
        });
        const rows = await db
          .insert(quizzes)
          .values({ userId: user.userId, title: `${parsed.subject} Novi 測驗`, subject: parsed.subject, difficulty: parsed.difficulty, source: "ai", timeLimitSec: ids.length * 90, questionIds: ids })
          .returning();
        result = { quiz: rows[0] };
      } else if (action.type === "update_plan") {
        const parsed = z
          .object({ blocks: z.array(z.object({ subject: z.string().min(1).max(20), minutes: z.number().int().min(5).max(240), focus: z.string().max(120).default("") })).min(1).max(6) })
          .parse(payload);
        const date = todayStr();
        const blocks = parsed.blocks.map((b) => ({ ...b, done: false }));
        const total = blocks.reduce((a, b) => a + b.minutes, 0);
        const rows = await db
          .insert(studyPlans)
          .values({ userId: user.userId, planDate: date, totalMinutes: total, blocks, rationale: "由 Novi 建議並經你確認後套用", generatedBy: "ai" })
          .onConflictDoUpdate({ target: [studyPlans.userId, studyPlans.planDate], set: { blocks, totalMinutes: total, rationale: "由 Novi 建議並經你確認後套用", generatedBy: "ai" } })
          .returning();
        result = { plan: rows[0] };
      } else {
        throw fail("AI_ACTION_UNSUPPORTED");
      }

      await db.update(aiMessages).set({ actionStatus: "applied" }).where(eq(aiMessages.id, msg.id));
      return { status: "applied", result };
    },
  }),

  route({
    method: "GET",
    path: "/ai/memory",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      return { memory: await db.select().from(aiMemory).where(eq(aiMemory.userId, user.userId)).orderBy(desc(aiMemory.updatedAt)) };
    },
  }),

  route({
    method: "DELETE",
    path: "/ai/memory/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      await db.delete(aiMemory).where(and(eq(aiMemory.id, ctx.params.id), eq(aiMemory.userId, user.userId)));
      return { deleted: true };
    },
  }),

  route({
    method: "POST",
    path: "/ai/quick",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ kind: z.enum(["today_advice", "weak_focus", "encourage"]) }));
      const stats = await subjectStats(user.userId);
      const plan = (await db.select().from(studyPlans).where(and(eq(studyPlans.userId, user.userId), eq(studyPlans.planDate, todayStr()))).limit(1))[0] ?? (await buildPlan(user.userId, todayStr()));
      const [dueWrong] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(wrongQuestions)
        .where(and(eq(wrongQuestions.userId, user.userId), isNull(wrongQuestions.resolvedAt)));

      if (!aiConfigured()) {
        const weakest = [...stats].sort((a, b) => a.average - b.average)[0];
        return {
          text:
            body.kind === "weak_focus" && weakest
              ? `目前 ${weakest.subject} 平均 ${weakest.average} 分最需要加強，先做 15 分鐘錯題複習。`
              : `今天的計畫是 ${plan.blocks.map((b) => `${b.subject} ${b.minutes} 分`).join("、")}，還有 ${dueWrong?.c ?? 0} 題錯題待處理。`,
          aiUsed: false,
        };
      }
      await consumeFeature(user.userId, "ai_context");
      const { data } = await runAiJson<{ text?: string }>(
        {
          feature: "novi_quick",
          userId: user.userId,
          system: '你是 Novi，用 2-3 句話給學生具體建議。回傳 JSON：{"text":""}。繁體中文，語氣正向但務實，必須引用提供的真實數據。',
          parts: [{ kind: "text", text: `類型：${body.kind}\n成績：${JSON.stringify(stats)}\n今日計畫：${JSON.stringify(plan.blocks)}\n未解決錯題：${dueWrong?.c ?? 0}` }],
          maxOutputTokens: 400,
        },
        {},
      );
      return { text: data.text ?? "先完成今天的第一個學習區塊吧！", aiUsed: true };
    },
  }),
];
