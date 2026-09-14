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
  aiArtifacts,
  storageObjects,
  aiUsageLogs,
} from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, fail, forbidden, notFound, todayStr } from "../core";
import { consumeFeature, isProUser } from "../economy";
import { extractJson, runAiJson, aiConfigured } from "../ai";
import { subjectStats, buildPlan } from "./learning-routes";
import { generateQuestions } from "./quiz-routes";
import { putObject } from "../storage";
import { analysisScopes, fileContexts, solutionSessions } from "@/db/schema";
import { analyzeSolution, createFileContext } from "../unified-ai-engine";
import { AppError } from "../errors";
import { readObject } from "../storage";
import { SUBJECTS } from "../subject-strategies";
import { getAiPolicy, policyInstructions } from "../ai-policy";

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

/** The database query is ordered newest-first; restore chronological order after limiting. */
export function latestConversationMessages<T>(newestFirstRows: T[], limit = 16): T[] {
  return newestFirstRows.slice(0, limit).reverse();
}

export function normalizeChatReply(data: Record<string, unknown>, rawText: string): string {
  const readFields = (value: Record<string, unknown>): string =>
    [value.reply, value.text, value.content, value.message, value.answer]
      .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
      .find(Boolean) ?? "";
  const direct = readFields(data);
  if (direct) return direct;

  const parsed = extractJson<Record<string, unknown>>(rawText, {});
  const extracted = readFields(parsed);
  if (extracted) return extracted;

  const cleaned = rawText.trim().replace(/^```(?:json|markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!cleaned || cleaned.startsWith("{") || cleaned.startsWith("[")) return "";
  return cleaned;
}

async function buildContext(userId: string, allow: string[], materialId: string | null) {
  const parts: string[] = [];
  if (allow.includes("settings")) {
    const s = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
    if (s) parts.push(`【學習設定】稱呼：${s.preferredName || "未設定"}；${s.schoolLevel === "junior" ? "國中" : "高中"}${s.grade}年級；每日目標 ${s.dailyGoalMinutes} 分鐘；英文程度 ${s.englishLevel}；偏好科目：${s.favoriteSubjects.join("、") || "未設定"}；學習方式：${s.learningStyle || "未設定"}；解釋偏好：${s.explanationPreference}`);
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
  const mem = await db.select().from(aiMemory).where(and(eq(aiMemory.userId, userId), eq(aiMemory.consentStatus, "active"), isNull(aiMemory.deletedAt), sql`(${aiMemory.expiresAt} is null or ${aiMemory.expiresAt} > now())`)).orderBy(desc(aiMemory.confidence), desc(aiMemory.updatedAt)).limit(20);
  if (mem.length) parts.push(`【長期記憶】${mem.map((m) => `${m.key}: ${m.value}`).join("；")}`);
  return parts.join("\n\n");
}

async function createAiArtifact(params: { userId: string; conversationId: string; messageId: string; kind: string; title: string; body: string }) {
  const body = params.body.slice(0, 20000);
  let data: Buffer;
  let mimeType: string;
  let filename: string;
  if (params.kind === "pdf") {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const lines = body.replace(/\r/g, "").split("\n").flatMap((line) => line.match(/.{1,72}/g) ?? [""]);
    for (const line of [`StudyNova · ${params.title}`, "", ...lines]) {
      if (y < 48) { page = pdf.addPage([595, 842]); y = 800; }
      page.drawText(line, { x: 42, y, size: line.startsWith("StudyNova") ? 16 : 11, font, color: rgb(0.08, 0.12, 0.22) });
      y -= line.startsWith("StudyNova") ? 26 : 17;
    }
    data = Buffer.from(await pdf.save());
    mimeType = "application/pdf";
    filename = `${params.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "-").slice(0, 80)}.pdf`;
  } else {
    const items = body.split("\n").filter(Boolean).slice(0, 14);
    const isMindMap = params.kind === "mind_map";
    const svg = isMindMap
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900"><rect width="1400" height="900" fill="#fffdf5"/><g stroke="#8b6f47" stroke-width="5" fill="none" opacity=".75"><path d="M700 450 C480 220 260 180 120 150"/><path d="M700 450 C460 430 250 430 90 450"/><path d="M700 450 C470 650 250 720 120 760"/><path d="M700 450 C930 220 1130 190 1280 150"/><path d="M700 450 C930 430 1140 430 1310 450"/><path d="M700 450 C920 650 1130 720 1280 760"/></g><g font-family="Comic Sans MS, cursive" fill="#25324a"><ellipse cx="700" cy="450" rx="190" ry="70" fill="#ffe79a" stroke="#8b6f47" stroke-width="5"/><text x="700" y="460" text-anchor="middle" font-size="34">${escapeXml(params.title.slice(0, 22))}</text>${items.map((item, index) => { const coords = [[120,150],[90,450],[120,760],[1280,150],[1310,450],[1280,760]][index % 6]; return `<rect x="${coords[0] - 100}" y="${coords[1] - 32}" width="200" height="64" rx="18" fill="#d9f3ff" stroke="#6487a0" stroke-width="3"/><text x="${coords[0]}" y="${coords[1] + 8}" text-anchor="middle" font-size="20">${escapeXml(item.slice(0, 18))}</text>`; }).join("")}</g></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#fffef7"/><path d="M80 120 H1120 M80 220 H1120 M80 320 H1120 M80 420 H1120 M80 520 H1120 M80 620 H1120 M80 720 H1120 M80 820 H1120 M80 920 H1120 M80 1020 H1120 M80 1120 H1120 M80 1220 H1120 M80 1320 H1120 M80 1420 H1120" stroke="#b8d5e6" stroke-width="2"/><text x="80" y="80" font-family="Comic Sans MS, cursive" font-size="38" fill="#263b66">${escapeXml(params.title.slice(0, 32))}</text>${items.map((item, index) => `<text x="100" y="${155 + index * 100}" font-family="Comic Sans MS, cursive" font-size="28" fill="#263b66">${index + 1}. ${escapeXml(item.slice(0, 62))}</text>`).join("")}</svg>`;
    const sharp = (await import("sharp")).default;
    data = await sharp(Buffer.from(svg)).png().toBuffer();
    mimeType = "image/png";
    filename = `${params.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "-").slice(0, 80)}.png`;
  }
  const stored = await putObject({ userId: params.userId, filename, mimeType, data, allow: params.kind === "pdf" ? ["pdf"] : ["image"] });
  const rows = await db.insert(aiArtifacts).values({ userId: params.userId, conversationId: params.conversationId, messageId: params.messageId, kind: params.kind, title: params.title, objectId: stored.id, preview: body.slice(0, 500), metadata: { mimeType, filename } }).returning();
  return rows[0];
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
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
          importance: aiMessages.importance,
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
      const body = await ctx.json(z.object({ content: z.string().min(1, "請輸入訊息").max(4000), contextId: z.string().uuid().optional() }));
      const conv = (await db.select().from(aiConversations).where(eq(aiConversations.id, ctx.params.id)).limit(1))[0];
      if (!conv) throw notFound("找不到對話");
      if (conv.userId !== user.userId) throw forbidden();
      if (!aiConfigured()) throw fail("AI_NOT_CONFIGURED");
      await consumeFeature(user.userId, "ai_context");

      await db.insert(aiMessages).values({ conversationId: conv.id, role: "user", content: body.content });
        // 先取最新 16 筆，再恢復成時間順序；不能用 asc + limit，否則長聊天室會一直把最早的舊對話送給 AI。
        const historyRows = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conv.id)).orderBy(desc(aiMessages.createdAt)).limit(16);
        const history = latestConversationMessages(historyRows);
      const context = await buildContext(user.userId, conv.allowContext, conv.contextMaterialId);
      const policy = await getAiPolicy("ai_chat");
      const attachment = body.contextId
        ? (await db.select().from(fileContexts).where(and(eq(fileContexts.id, body.contextId), eq(fileContexts.userId, user.userId))).limit(1))[0]
        : null;
      const attachmentText = attachment && Array.isArray(attachment.detected)
        ? (attachment.detected as Array<{ kind?: string; text?: string }>).map((item) => `[${item.kind ?? "內容"}] ${item.text ?? ""}`).join("\n").slice(0, 16000)
        : "";
      const attachmentObject = attachment?.objectId ? await readObject(attachment.objectId) : null;
      const attachmentParts = attachmentObject?.mimeType.startsWith("image/")
        ? [{ kind: "image" as const, mimeType: attachmentObject.mimeType, base64: attachmentObject.data.toString("base64") }]
        : [];

      const { data, meta } = await runAiJson<{ reply?: string; importance?: string; action?: { type?: string; payload?: Record<string, unknown>; preview?: string } | null; memory?: Array<{ key: string; value: string }> }>(
        {
          feature: "ai_chat",
          userId: user.userId,
          system:
            `你是 StudyNova 的 AI 學習助理 Novi，服務台灣國高中學生。${MODES[conv.mode as keyof typeof MODES] ?? MODES.teacher}\n` +
            policyInstructions(policy, { examMode: conv.mode === "exam" || conv.mode === "hint" }) + "\n" +
            "你不能自行修改使用者資料。若需要建立任務／筆記／測驗或修改讀書計畫，請在 action 欄位提出建議，等使用者確認。\n" +
            '回傳 JSON：{"reply":"回覆內容（markdown）","importance":"normal|important|critical","action":{"type":"create_task|create_note|create_material|create_quiz|update_plan|create_artifact","payload":{...},"preview":"一句話說明將要做什麼"}|null,"memory":[{"key":"","value":""}]}\n' +
            "個人記憶規則：memory 只能保存使用者明確表達且對未來學習有必要的偏好，key 只能是 preferred_name、learning_style、explanation_preference、reminder_preference；不得保存身分證、地址、聯絡方式、健康、財務或其他不必要私人資訊。\n" +
            "importance 規則：normal 是一般說明；important 是考試重點、常見錯誤或需要特別注意的內容；critical 是安全、截止時間、明確答案或不可忽略的關鍵提醒。回答中請用 markdown 條列與粗體呈現重點。\n" +
            "朋友聊天語氣規則：像一位真誠、懂學習的朋友陪學生聊天，不要像制式客服或教科書。可以自然使用『欸、其實、你可以先、沒事、我們一起看』等口語，但不要過度裝熟或使用粗俗語言。每次回覆至少補充一點有用的解釋或下一步，不要只回一句空泛鼓勵。依情境加入 1 到 3 個自然的符號或表情，例如 🙂、👍、✨、💡、📌；不要每句都放，也不要讓表情取代內容。可以使用『哈哈』『懂你』等朋友式反應，但遇到錯誤、考試重點或重要提醒仍要清楚、準確、尊重。不要輸出貼圖網址、圖片 Markdown 或虛構貼圖代碼；若需要可用文字搭配表情呈現。\n" +
            "化學與數學公式規則：優先直接輸出 Unicode 化學式，例如 H₂O、CO₂、HCl、O₃、SO₄²⁻，不要輸出美元符號、LaTeX 分隔符或程式碼標記；元素名稱與元素符號要同時清楚顯示，例如 氫（H）、氧（O）、氯（Cl）。\n" +
            "產物規則：當學生要求把本次重點做成 PDF、手寫風格圖片、手繪重點或心智圖時，先在 reply 說明你要整理的內容，再提出 create_artifact action 等待確認。payload 必須是 {kind:'pdf'|'handwritten_note'|'mind_map',title,body}；body 只放本次對話已確認的重點，不可杜撰。確認後系統會直接在對話顯示可開啟的產物；只有 Nova Pro 可以下載檔案，免費使用者只能預覽並被引導到學習中心產物專區。\n" +
            "create_task payload：{title, detail}；create_note payload：{title, subject, body}；create_material payload：{title, subject, content, summary}；create_quiz payload：{subject, topic, count, difficulty, sourceText}；update_plan payload：{blocks:[{subject,minutes,focus}]}。使用者說加入教材或保存教材重點時，提出 create_material；使用者說保存重點、整理筆記時，提出 create_note。\n" +
            "繁體中文回答。不得杜撰使用者資料。若本次訊息附有圖片，必須實際查看圖片；圖片是主要證據，OCR 文字只是輔助。不要回答使用者沒有傳圖片。",
          parts: [
            { kind: "text", text: context ? `使用者已授權的學習資料：\n${context}` : "使用者未授權任何個人資料，只能根據對話內容回答。" },
            { kind: "text", text: `對話紀錄：\n${history.map((m) => `${m.role === "user" ? "學生" : "Novi"}：${m.content}`).join("\n").slice(-5000)}${attachmentText ? `\n\n本次訊息附圖辨識內容：\n${attachmentText}` : ""}` },
            ...attachmentParts,
          ],
          maxOutputTokens: 1200,
        },
        {},
      );

      const rawProviderText = meta.text.trim();
      const reply = normalizeChatReply(data as Record<string, unknown>, rawProviderText);
      if (!reply) {
        const diagnostic = { stage: "chat.reply", feature: "ai_chat", provider: meta.provider, model: meta.model, outputTokens: meta.outputTokens, responsePreview: rawProviderText.slice(0, 240) };
        console.error("[ai/chat] provider returned no usable reply", diagnostic);
        try {
          await db.insert(aiUsageLogs).values({ userId: user.userId, provider: meta.provider, model: meta.model, feature: "ai_chat", success: false, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens, latencyMs: meta.latencyMs, fallbackFrom: meta.fallbackFrom, failureCategory: "empty_response" });
        } catch (telemetryError) {
          console.error("[ai/chat] empty-response telemetry failed", telemetryError);
        }
        throw fail("AI_EMPTY_RESULT", { message: "AI 這次沒有回傳可用答案，系統已記錄診斷資訊，請重新送出；若持續發生請提供錯誤代碼。", details: diagnostic });
      }
      const actionTypes = ["create_task", "create_note", "create_material", "create_quiz", "update_plan", "create_artifact"];
      const actionAliases: Record<string, string> = { add_material: "create_material", add_to_materials: "create_material", save_note: "create_note", add_note: "create_note", save_highlight: "create_note" };
      const rawAction = data.action;
      const normalizedActionType = rawAction?.type ? (actionAliases[String(rawAction.type)] ?? String(rawAction.type)) : "";
      const action = rawAction && actionTypes.includes(normalizedActionType) ? { ...rawAction, type: normalizedActionType } : null;

      const inserted = await db
        .insert(aiMessages)
        .values({
          conversationId: conv.id,
          role: "assistant",
          content: reply,
          importance: ["normal", "important", "critical"].includes(String(data.importance)) ? String(data.importance) : "normal",
          provider: meta.provider,
          model: meta.model,
          action: action ? (action as Record<string, unknown>) : null,
          actionStatus: action ? "pending" : "none",
        })
        .returning();

      const allowedMemoryKeys = new Set(["preferred_name", "learning_style", "explanation_preference", "reminder_preference"]);
      for (const m of (data.memory ?? []).slice(0, 5)) {
        if (!m?.key || !allowedMemoryKeys.has(String(m.key))) continue;
        await db
          .insert(aiMemory)
          .values({ userId: user.userId, key: String(m.key).slice(0, 60), value: String(m.value ?? "").slice(0, 400), scope: "episodic", sourceType: "ai_conversation", sourceId: conv.id, confidence: 60, consentStatus: "active", lastUsedAt: new Date() })
          .onConflictDoUpdate({ target: [aiMemory.userId, aiMemory.key], set: { value: String(m.value ?? "").slice(0, 400), scope: "episodic", sourceType: "ai_conversation", sourceId: conv.id, confidence: 60, consentStatus: "active", deletedAt: null, lastUsedAt: new Date(), updatedAt: new Date() } });
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
          importance: message.importance,
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
        let notePolicy;
        try {
          notePolicy = await getAiPolicy("ai_note_creation");
        } catch (error) {
          console.error("[ai/action] note policy lookup failed; using safe Pro-only default", error);
          notePolicy = { proOnly: true, enabled: true } as { proOnly: boolean; enabled: boolean };
        }
        if (notePolicy?.enabled === false) throw fail("AI_ACTION_UNSUPPORTED", { message: "管理員目前停用 AI 建立筆記功能。" });
        if (notePolicy?.proOnly !== false && !(await isProUser(user.userId))) throw fail("QUOTA_PRO_REQUIRED", { message: "AI 建立筆記目前為 Nova Pro 專屬功能，請先升級或聯絡管理員調整後台權限。", details: { stage: "notes.entitlement", feature: "ai_note_creation", proOnly: true } });
        const parsedResult = z.object({ title: z.string().min(1).max(120).default("Novi 重點整理"), subject: z.string().max(20).default("其他"), body: z.string().max(20000).optional(), content: z.string().max(20000).optional() }).safeParse(payload);
        if (!parsedResult.success) throw fail("AI_NOTE_PAYLOAD_INVALID", { details: { stage: "notes.payload", actionType: action.type, payloadKeys: Object.keys(payload), issues: parsedResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } });
        const parsed = parsedResult.data;
        const noteBody = parsed.body?.trim() || parsed.content?.trim();
        if (!noteBody) throw fail("AI_NOTE_PAYLOAD_INVALID", { details: { stage: "notes.content", actionType: action.type, payloadKeys: Object.keys(payload), missing: "body|content" } });
        let rows;
        try {
          rows = await db.insert(notes).values({ userId: user.userId, title: parsed.title, subject: parsed.subject, body: noteBody, source: "ai" }).returning();
        } catch (error) {
          console.error("[ai/action] create_note database write failed", { actionType: action.type, payloadKeys: Object.keys(payload), error });
          throw fail("AI_NOTE_WRITE_FAILED", { details: { stage: "notes.insert", table: "notes", actionType: action.type, payloadKeys: Object.keys(payload), cause: error instanceof Error ? error.message.slice(0, 240) : "unknown" } });
        }
        result = { note: rows[0] };
      } else if (action.type === "create_material") {
        const parsedResult = z.object({ title: z.string().min(1).max(160).default("Novi 教材重點"), subject: z.string().max(30).default("其他"), content: z.string().max(30000).optional(), body: z.string().max(30000).optional(), summary: z.string().max(2000).default("") }).safeParse(payload);
        if (!parsedResult.success) throw fail("AI_MATERIAL_PAYLOAD_INVALID", { details: { stage: "materials.payload", actionType: action.type, payloadKeys: Object.keys(payload), issues: parsedResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } });
        const parsed = parsedResult.data;
        const materialContent = parsed.content?.trim() || parsed.body?.trim();
        if (!materialContent || materialContent.length < 5) throw fail("AI_MATERIAL_PAYLOAD_INVALID", { details: { stage: "materials.content", actionType: action.type, payloadKeys: Object.keys(payload), missing: "content|body" } });
        let rows;
        try {
          rows = await db.insert(studyMaterials).values({ userId: user.userId, title: parsed.title, subject: parsed.subject, kind: "text", status: "ready", content: materialContent, summary: parsed.summary }).returning();
        } catch (error) {
          console.error("[ai/action] create_material database write failed", { actionType: action.type, payloadKeys: Object.keys(payload), error });
          throw fail("AI_MATERIAL_WRITE_FAILED", { details: { stage: "materials.insert", table: "study_materials", actionType: action.type, payloadKeys: Object.keys(payload), cause: error instanceof Error ? error.message.slice(0, 240) : "unknown" } });
        }
        result = { material: rows[0] };
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
      } else if (action.type === "create_artifact") {
        const parsed = z.object({ kind: z.enum(["pdf", "handwritten_note", "mind_map"]), title: z.string().min(1).max(120), body: z.string().min(1).max(20000) }).parse(payload);
        let artifact;
        try {
          artifact = await createAiArtifact({ userId: user.userId, conversationId: conv.id, messageId: msg.id, ...parsed });
        } catch (error) {
          console.error("[ai/artifact] generation failed", error);
          throw fail("SYS_DB_UNAVAILABLE", { message: "產物服務目前尚未完成資料庫或檔案儲存設定，請先套用最新 migration 後再試。" });
        }
        result = { artifact, preview: artifact.preview, downloadable: await isProUser(user.userId), openUrl: artifact.objectId ? `/api/files/${artifact.objectId}` : null, studyCenterUrl: "/study?tab=visual-notes" };
      } else {
        throw fail("AI_ACTION_UNSUPPORTED");
      }

      try {
        await db.update(aiMessages).set({ actionStatus: "applied" }).where(eq(aiMessages.id, msg.id));
      } catch (error) {
        console.error("[ai/action] action status update failed", { actionType: action.type, messageId: msg.id, error });
        throw fail("AI_ACTION_DIAGNOSTIC", { details: { stage: "ai_messages.status_update", table: "ai_messages", actionType: action.type, messageId: msg.id, cause: error instanceof Error ? error.message.slice(0, 240) : "unknown" } });
      }
      return { status: "applied", result };
    },
  }),

  route({
    method: "GET",
    path: "/ai/memory",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      try {
        const memory = await db.select().from(aiMemory).where(and(eq(aiMemory.userId, user.userId), isNull(aiMemory.deletedAt))).orderBy(desc(aiMemory.updatedAt));
        return { memory, memoryEnabled: memory.some((item) => item.consentStatus === "active") };
      } catch (error) {
        console.error("[ai/memory] read failed; returning empty state", error);
        return { memory: [], memoryEnabled: false, degraded: true };
      }
    },
  }),

  route({
    method: "POST",
    path: "/ai/memory",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({
        key: z.string().min(1).max(60),
        value: z.string().min(1).max(400),
        scope: z.enum(["session", "task", "profile", "mastery", "episodic", "semantic"]).default("profile"),
        confidence: z.number().int().min(0).max(100).default(80),
        expiresAt: z.string().datetime().nullable().optional(),
      }));
      const rows = await db.insert(aiMemory).values({
        userId: user.userId,
        key: body.key,
        value: body.value,
        scope: body.scope,
        sourceType: "user",
        confidence: body.confidence,
        consentStatus: "active",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        lastUsedAt: new Date(),
      }).onConflictDoUpdate({ target: [aiMemory.userId, aiMemory.key], set: { value: body.value, scope: body.scope, confidence: body.confidence, consentStatus: "active", expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, deletedAt: null, lastUsedAt: new Date(), updatedAt: new Date() } }).returning();
      return { memory: rows[0] };
    },
  }),

  route({
    method: "PATCH",
    path: "/ai/memory/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({
        value: z.string().min(1).max(400).optional(),
        consentStatus: z.enum(["active", "paused", "revoked"]).optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
      }));
      const rows = await db.update(aiMemory).set({ ...body, expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null, updatedAt: new Date() }).where(and(eq(aiMemory.id, ctx.params.id), eq(aiMemory.userId, user.userId), isNull(aiMemory.deletedAt))).returning();
      if (!rows[0]) throw notFound("找不到這筆 Novi 記憶");
      return { memory: rows[0] };
    },
  }),

  route({
    method: "GET",
    path: "/ai/memory/export",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const memory = await db.select().from(aiMemory).where(and(eq(aiMemory.userId, user.userId), isNull(aiMemory.deletedAt))).orderBy(desc(aiMemory.updatedAt));
      return { exportedAt: new Date().toISOString(), memory };
    },
  }),

  route({
    method: "POST",
    path: "/ai/memory/settings",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ enabled: z.boolean() }));
      await db.update(aiMemory).set({ consentStatus: body.enabled ? "active" : "paused", updatedAt: new Date() }).where(and(eq(aiMemory.userId, user.userId), isNull(aiMemory.deletedAt)));
      return { enabled: body.enabled };
    },
  }),

  route({
    method: "DELETE",
    path: "/ai/memory/:id",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const deleted = await db.delete(aiMemory).where(and(eq(aiMemory.id, ctx.params.id), eq(aiMemory.userId, user.userId))).returning({ id: aiMemory.id });
      if (!deleted[0]) throw notFound("找不到這筆 Novi 記憶");
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
            system: '你是 Novi，用 2-3 句話像朋友一樣給學生具體建議。可以加入 1 個自然表情或符號，但內容必須有用、不可空泛。回傳 JSON：{"text":""}。繁體中文，口語、溫暖、正向但務實，必須引用提供的真實數據。',
          parts: [{ kind: "text", text: `類型：${body.kind}\n成績：${JSON.stringify(stats)}\n今日計畫：${JSON.stringify(plan.blocks)}\n未解決錯題：${dueWrong?.c ?? 0}` }],
          maxOutputTokens: 400,
        },
        {},
      );
      return { text: data.text ?? "先完成今天的第一個學習區塊吧！", aiUsed: true };
    },
  }),

  route({
    method: "POST",
    path: "/ai/solution/upload",
    auth: "user",
    rate: { limit: 12, windowSec: 3600, key: "ai-solution-upload" },
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const form = await ctx.formData();
      const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File);
      if (!files.length) throw badRequest("請選擇至少一個圖片或 PDF 檔案");
      const subject = String(form.get("subject") ?? "").trim();
      if (!SUBJECTS.includes(subject as (typeof SUBJECTS)[number])) throw badRequest("上傳前請先選擇科目");
      if (files.length > 8) throw badRequest("一次最多上傳 8 個檔案");
      const scope = {
        includeQuestion: form.get("includeQuestion") !== "false",
        includeHandwriting: form.get("includeHandwriting") !== "false",
        includeNote: form.get("includeNote") !== "false",
        highlightPriority: form.get("highlightPriority") === "true",
        questionColor: String(form.get("questionColor") ?? ""),
        sentenceColor: String(form.get("sentenceColor") ?? ""),
        keywordColor: String(form.get("keywordColor") ?? ""),
      };
      const previous = await db.select({ batch: fileContexts.uploadBatch }).from(fileContexts).where(eq(fileContexts.userId, user.userId)).orderBy(desc(fileContexts.uploadBatch)).limit(1);
      const batch = (previous[0]?.batch ?? 0) + 1;
      const processFile = async (file: File) => {
        try {
          const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
          const stored = await putObject({ userId: user.userId, filename: file.name, mimeType: mime, data: Buffer.from(await file.arrayBuffer()), allow: ["image", "pdf"] });
          return await createFileContext({ userId: user.userId, objectId: stored.id, originalName: file.name, batch, scope, subject });
        } catch (error) {
          const code = error instanceof AppError ? error.code : "SN-SYS-9901";
          console.error("[ai-solution-upload] file analysis failed", { filename: file.name, code, error: error instanceof Error ? error.message : String(error) });
          return { context: null, duplicate: false, errorCode: code, error: error instanceof Error ? error.message.slice(0, 240) : "圖片分析失敗" };
        }
      };
      const results: Array<Awaited<ReturnType<typeof processFile>>> = [];
      for (let i = 0; i < files.length; i += 3) results.push(...await Promise.all(files.slice(i, i + 3).map(processFile)));
      return { batch, results, newCount: results.filter((r) => !r.duplicate).length, duplicateCount: results.filter((r) => r.duplicate).length };
    },
  }),

  route({
    method: "GET",
    path: "/ai/solution/contexts",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const rows = await db.select().from(fileContexts).where(eq(fileContexts.userId, user.userId)).orderBy(desc(fileContexts.createdAt)).limit(60);
      return { contexts: rows };
    },
  }),

  route({
    method: "POST",
    path: "/ai/solution/analyze",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ contextIds: z.array(z.string().uuid()).max(8).default([]), question: z.string().trim().max(30000).optional(), subject: z.string().trim().max(30).optional(), mode: z.enum(["tutor", "solution", "note"]).optional(), idempotencyKey: z.string().trim().min(1).max(160).optional(), scope: z.object({ includeQuestion: z.boolean().optional(), includeHandwriting: z.boolean().optional(), includeNote: z.boolean().optional(), highlightPriority: z.boolean().optional() }).optional() }).refine((value) => value.contextIds.length > 0 || Boolean(value.question?.trim()), { message: "請輸入題目或上傳圖片／檔案" }));
      return analyzeSolution({ userId: user.userId, contextIds: body.contextIds, question: body.question, subject: body.subject, requestedMode: body.mode, idempotencyKey: body.idempotencyKey, scope: body.scope });
    },
  }),

  route({
    method: "PATCH",
    path: "/ai/solution/contexts/:id/scope",
    auth: "user",
    handler: async (ctx) => {
      const user = ctx.requireUser();
      const body = await ctx.json(z.object({ includeQuestion: z.boolean(), includeHandwriting: z.boolean(), includeNote: z.boolean(), highlightPriority: z.boolean(), questionColor: z.string().max(30).optional(), sentenceColor: z.string().max(30).optional(), keywordColor: z.string().max(30).optional() }));
      const context = (await db.select().from(fileContexts).where(and(eq(fileContexts.id, ctx.params.id), eq(fileContexts.userId, user.userId))).limit(1))[0];
      if (!context) throw notFound("找不到檔案分析內容");
      const rows = await db.insert(analysisScopes).values({ fileContextId: context.id, ...body }).onConflictDoUpdate({ target: analysisScopes.fileContextId, set: { ...body, updatedAt: new Date() } }).returning();
      return { scope: rows[0] };
    },
  }),
];
