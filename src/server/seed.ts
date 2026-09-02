import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  faqEntries,
  legalDocuments,
  assistantLevels,
  assistantItems,
  achievements,
  featurePermissions,
  dailyWords,
  sentences,
  questions,
  aiProviderHealth,
  platformSettings,
} from "@/db/schema";
import { fingerprint } from "./core";
import { providerConfigs } from "./ai";

const SEED_VERSION = 5;

const LEVELS = [
  { level: 1, name: "初始助手", requiredXp: 0, upgradeCostNova: 0, ability: "基本問答與今日建議", aura: "#38bdf8" },
  { level: 2, name: "智慧助手", requiredXp: 300, upgradeCostNova: 150, ability: "解鎖錯題分析與記憶法", aura: "#22d3ee" },
  { level: 3, name: "學習專家", requiredXp: 1200, upgradeCostNova: 400, ability: "解鎖讀書計畫優化與朗讀評分", aura: "#a78bfa" },
  { level: 4, name: "AI 大師", requiredXp: 3000, upgradeCostNova: 900, ability: "解鎖多圖分析與深度出題", aura: "#f472b6" },
  { level: 5, name: "AI 核心", requiredXp: 6000, upgradeCostNova: 2000, ability: "解鎖全功能與專屬星軌特效", aura: "#fbbf24" },
];

const ITEMS = [
  { code: "skin-aurora", name: "極光外殼", category: "skin", priceNova: 300, description: "青藍極光流動的外殼", requiredLevel: 2, payload: { color: "#22d3ee" } },
  { code: "skin-nebula", name: "星雲外殼", category: "skin", priceNova: 500, description: "紫色星雲質感", requiredLevel: 3, payload: { color: "#a78bfa" } },
  { code: "skin-gold", name: "Nova Pro 金核", category: "skin", priceNova: 800, description: "Nova Pro 專屬金色外殼", requiredLevel: 1, proOnly: true, payload: { color: "#fbbf24" } },
  { code: "core-pulse", name: "脈衝核心", category: "core", priceNova: 260, description: "核心呼吸脈動更明顯", requiredLevel: 2, payload: { pulse: true } },
  { code: "effect-orbit", name: "星軌環繞", category: "effect", priceNova: 420, description: "Novi 周圍出現環繞星軌", requiredLevel: 2, payload: { orbit: true } },
  { code: "effect-sparkle", name: "微光粒子", category: "effect", priceNova: 260, description: "回答時飄出微光粒子", requiredLevel: 1, payload: { sparkle: true } },
  { code: "float-hover", name: "反重力漂浮", category: "float", priceNova: 200, description: "更明顯的漂浮律動", requiredLevel: 1, payload: { amplitude: 8 } },
  { code: "voice-soft", name: "溫柔語音", category: "voice", priceNova: 180, description: "朗讀語速較慢、語氣柔和", requiredLevel: 1, payload: { rate: 0.9, pitch: 1.1 } },
  { code: "voice-coach", name: "教練語音", category: "voice", priceNova: 180, description: "更有精神的語速", requiredLevel: 2, payload: { rate: 1.1, pitch: 0.95 } },
  { code: "title-scholar", name: "稱號：夜讀者", category: "title", priceNova: 150, description: "顯示在個人頁的稱號", requiredLevel: 1, payload: { text: "夜讀者" } },
  { code: "title-master", name: "稱號：解題大師", category: "title", priceNova: 350, description: "顯示在個人頁的稱號", requiredLevel: 3, payload: { text: "解題大師" } },
  { code: "badge-star", name: "徽章：星軌", category: "badge", priceNova: 220, description: "個人頁徽章", requiredLevel: 2, payload: { icon: "🌌" } },
  { code: "pass-season", name: "虛擬通行證：星季", category: "pass", priceNova: 1200, description: "季節限定通行證外觀與紀錄頁", requiredLevel: 3, payload: { season: "nova" } },
];

const ACHIEVEMENTS = [
  { code: "first_study", title: "第一次學習", description: "完成第一次學習紀錄", icon: "🌱", target: 1, metric: "total_minutes", rewardNova: 20, rewardXp: 30, sortOrder: 1 },
  { code: "streak_3", title: "連續 3 天", description: "連續學習 3 天", icon: "🔥", target: 3, metric: "streak_days", rewardNova: 30, rewardXp: 60, sortOrder: 2 },
  { code: "streak_7", title: "連續 7 天", description: "連續學習 7 天", icon: "🚀", target: 7, metric: "streak_days", rewardNova: 80, rewardXp: 150, sortOrder: 3 },
  { code: "minutes_100", title: "100 分鐘", description: "累積學習 100 分鐘", icon: "⏱️", target: 100, metric: "total_minutes", rewardNova: 50, rewardXp: 100, sortOrder: 4 },
  { code: "questions_100", title: "百題達人", description: "累積作答 100 題", icon: "💯", target: 100, metric: "questions_answered", rewardNova: 60, rewardXp: 120, sortOrder: 5 },
  { code: "quiz_10", title: "測驗常客", description: "完成 10 份測驗", icon: "📝", target: 10, metric: "quiz_count", rewardNova: 50, rewardXp: 100, sortOrder: 6 },
  { code: "material_5", title: "教材整理者", description: "上傳 5 份教材", icon: "📚", target: 5, metric: "materials_added", rewardNova: 40, rewardXp: 80, sortOrder: 7 },
  { code: "wrong_20", title: "錯題終結者", description: "完全掌握 20 題錯題", icon: "🎯", target: 20, metric: "wrong_resolved", rewardNova: 80, rewardXp: 160, sortOrder: 8 },
  { code: "words_50", title: "單字收藏家", description: "熟練 50 個單字", icon: "🔤", target: 50, metric: "words_mastered", rewardNova: 60, rewardXp: 120, sortOrder: 9 },
  { code: "goal_1", title: "目標達成", description: "第一次達成目標分數", icon: "🏆", target: 1, metric: "goal_reached", rewardNova: 100, rewardXp: 200, sortOrder: 10 },
  { code: "grades_10", title: "成績紀錄者", description: "紀錄 10 筆成績", icon: "📈", target: 10, metric: "grades_logged", rewardNova: 40, rewardXp: 80, sortOrder: 11 },
];

const FEATURES = [
  { feature: "ai_context", label: "情境 AI", freeDailyLimit: 12, proDailyLimit: 80 },
  { feature: "ai_practice", label: "AI 練習出題", freeDailyLimit: 3, proDailyLimit: 15 },
  { feature: "material_organize", label: "教材整理", freeDailyLimit: 3, proDailyLimit: 15 },
  { feature: "ai_study_plan", label: "AI 讀書計畫", freeDailyLimit: 0, proDailyLimit: 5 },
  { feature: "wrong_review_ai", label: "錯題 AI 複習", freeDailyLimit: 5, proDailyLimit: 30 },
  { feature: "ai_speech", label: "AI 朗讀 / 語音分析", freeDailyLimit: 0, proDailyLimit: 20 },
  { feature: "image_ocr", label: "圖片辨識", freeDailyLimit: 5, proDailyLimit: 50 },
  { feature: "multi_image_ocr", label: "多圖片辨識", freeDailyLimit: 0, proDailyLimit: 10 },
];

const WORDS = [
  ["ability", "能力", "n.", "She has the ability to solve hard problems.", "她有解決難題的能力。", "A2"],
  ["achieve", "達成", "v.", "You can achieve your goal step by step.", "你可以一步步達成目標。", "A2"],
  ["benefit", "好處；受益", "n./v.", "Regular review brings a lot of benefits.", "定期複習帶來很多好處。", "B1"],
  ["concentrate", "專注", "v.", "I concentrate better in the morning.", "我早上比較能專注。", "B1"],
  ["describe", "描述", "v.", "Describe the picture in three sentences.", "用三句話描述這張圖。", "A2"],
  ["effort", "努力", "n.", "Your effort will pay off.", "你的努力會有回報。", "A2"],
  ["familiar", "熟悉的", "adj.", "This topic is familiar to me.", "這個主題我很熟悉。", "B1"],
  ["generate", "產生", "v.", "AI can generate practice questions.", "AI 可以產生練習題。", "B2"],
  ["improve", "改善", "v.", "Reading every day improves your English.", "每天閱讀能改善你的英文。", "A2"],
  ["knowledge", "知識", "n.", "Knowledge grows when you share it.", "知識在分享時會增長。", "B1"],
  ["method", "方法", "n.", "Find a study method that fits you.", "找到適合你的讀書方法。", "A2"],
  ["opportunity", "機會", "n.", "Every mistake is an opportunity to learn.", "每個錯誤都是學習的機會。", "B1"],
  ["progress", "進步", "n./v.", "Track your progress every week.", "每週追蹤你的進步。", "A2"],
  ["remember", "記得", "v.", "Remember to review before you sleep.", "記得睡前複習。", "A1"],
  ["schedule", "行程；安排", "n./v.", "Make a schedule for the exam week.", "為考試週安排行程。", "B1"],
  ["translate", "翻譯", "v.", "Translate this sentence into Chinese.", "把這個句子翻譯成中文。", "A2"],
  ["understand", "理解", "v.", "I finally understand this formula.", "我終於理解這個公式了。", "A1"],
  ["vocabulary", "字彙", "n.", "Build your vocabulary ten words a day.", "每天十個單字累積字彙量。", "A2"],
  ["challenge", "挑戰", "n./v.", "Take the weekend challenge with friends.", "和朋友一起參加週末挑戰。", "B1"],
  ["confident", "有自信的", "adj.", "Practice makes you confident.", "練習讓你有自信。", "B1"],
];

const SENTENCES = [
  ["I usually review my notes before I go to bed.", "我通常在睡前複習筆記。", "A2"],
  ["The more you practice, the better you get.", "你練習越多，就會越進步。", "B1"],
  ["Could you explain this question again, please?", "可以請你再解釋一次這題嗎？", "A2"],
  ["I have been studying English for three years.", "我學英文已經三年了。", "B1"],
  ["If I finish my homework early, I will read a book.", "如果我早點寫完作業，我會看書。", "A2"],
  ["She is good at solving math problems quickly.", "她擅長快速解數學題。", "B1"],
  ["Learning a language takes time and patience.", "學語言需要時間和耐心。", "B1"],
  ["Let's set a goal and check it every week.", "我們設定目標並每週檢查。", "A2"],
];

const BANK = [
  { subject: "英文", topic: "時態", level: "junior", difficulty: "normal", type: "single", stem: "She ______ to school by bus every day.", options: ["go", "goes", "going", "gone"], answer: ["goes"], explanation: "主詞為第三人稱單數且為現在簡單式，動詞加 -es。" },
  { subject: "英文", topic: "介系詞", level: "junior", difficulty: "easy", type: "single", stem: "We will meet ______ Monday morning.", options: ["in", "on", "at", "for"], answer: ["on"], explanation: "特定日期或星期使用 on。" },
  { subject: "數學", topic: "一元一次方程式", level: "junior", difficulty: "normal", type: "single", stem: "若 3x - 7 = 14，則 x = ?", options: ["5", "6", "7", "8"], answer: ["7"], explanation: "3x = 21，x = 7。" },
  { subject: "數學", topic: "比例", level: "junior", difficulty: "normal", type: "single", stem: "某商品原價 800 元，打八折後售價為多少？", options: ["600 元", "640 元", "680 元", "720 元"], answer: ["640 元"], explanation: "800 × 0.8 = 640。" },
  { subject: "自然", topic: "電學", level: "junior", difficulty: "normal", type: "single", stem: "在歐姆定律中，電壓 V、電流 I 與電阻 R 的關係為？", options: ["V = I + R", "V = I × R", "V = I ÷ R", "V = R ÷ I"], answer: ["V = I × R"], explanation: "歐姆定律：V = IR。" },
  { subject: "自然", topic: "光學", level: "junior", difficulty: "easy", type: "truefalse", stem: "光在真空中的傳播速度約為每秒 3×10⁸ 公尺。", options: ["正確", "錯誤"], answer: ["正確"], explanation: "光速約 299,792,458 m/s。" },
  { subject: "數學", topic: "二次函數", level: "senior", difficulty: "hard", type: "single", stem: "函數 y = x² - 4x + 3 的頂點座標為？", options: ["(2, -1)", "(-2, -1)", "(2, 1)", "(1, 0)"], answer: ["(2, -1)"], explanation: "配方得 y = (x-2)² - 1，頂點 (2, -1)。" },
  { subject: "英文", topic: "閱讀", level: "senior", difficulty: "exam", type: "single", stem: "Choose the word closest in meaning to 'gradually'.", options: ["suddenly", "slowly", "rarely", "hardly"], answer: ["slowly"], explanation: "gradually 表示逐漸地，與 slowly 最接近。" },
];

export async function runSeed(force = false) {
  const existing = (await db.select().from(platformSettings).where(eq(platformSettings.key, "seed")).limit(1))[0];
  const version = Number((existing?.value as { version?: number } | undefined)?.version ?? 0);
  if (!force && version >= SEED_VERSION) return { seeded: false, version };

  for (const l of LEVELS) {
    await db.insert(assistantLevels).values(l).onConflictDoUpdate({ target: assistantLevels.level, set: l });
  }
  for (const i of ITEMS) {
    await db
      .insert(assistantItems)
      .values(i as typeof assistantItems.$inferInsert)
      .onConflictDoUpdate({ target: assistantItems.code, set: { name: i.name, priceNova: i.priceNova, description: i.description, requiredLevel: i.requiredLevel } });
  }
  for (const a of ACHIEVEMENTS) {
    await db.insert(achievements).values(a).onConflictDoUpdate({ target: achievements.code, set: a });
  }
  for (const f of FEATURES) {
    await db
      .insert(featurePermissions)
      .values({ ...f, enabled: true, proOnly: false, monthlyLimit: 0, novaCost: 0 })
      .onConflictDoUpdate({ target: featurePermissions.feature, set: { label: f.label } });
  }
  for (const [word, meaning, pos, example, exampleZh, level] of WORDS) {
    await db
      .insert(dailyWords)
      .values({ word, meaning, partOfSpeech: pos, example, exampleZh, level })
      .onConflictDoNothing();
  }
  for (const [en, zh, level] of SENTENCES) {
    await db.insert(sentences).values({ en, zh, level, keywords: [] }).onConflictDoNothing();
  }
  for (const q of BANK) {
    await db
      .insert(questions)
      .values({ ...q, origin: "bank", ownerId: null, fingerprint: fingerprint(q.subject, q.stem, q.answer.join("|")) })
      .onConflictDoNothing();
  }
  for (const p of providerConfigs()) {
    await db
      .insert(aiProviderHealth)
      .values({ provider: p.name, priority: p.priority, model: p.model })
      .onConflictDoUpdate({ target: aiProviderHealth.provider, set: { priority: p.priority } });
  }

  for (const f of FAQ) {
    await db
      .insert(faqEntries)
      .values(f)
      .onConflictDoUpdate({ target: faqEntries.slug, set: { question: f.question, answer: f.answer, relatedCodes: f.relatedCodes, category: f.category, sortOrder: f.sortOrder } });
  }
  for (const d of LEGAL) {
    await db
      .insert(legalDocuments)
      .values(d)
      .onConflictDoUpdate({ target: legalDocuments.slug, set: { title: d.title, body: d.body, version: d.version, updatedAt: new Date() } });
  }


  await db
    .insert(platformSettings)
    .values({ key: "seed", value: { version: SEED_VERSION, at: new Date().toISOString() } })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: { version: SEED_VERSION, at: new Date().toISOString() }, updatedAt: new Date() } });

  return { seeded: true, version: SEED_VERSION };
}

let seedPromise: Promise<{ seeded: boolean; version: number }> | null = null;
export function ensureSeeded() {
  if (!seedPromise) seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

/* --------------------------------------------------------------- FAQ */

const FAQ: Array<{ slug: string; category: string; question: string; answer: string; relatedCodes: string[]; sortOrder: number }> = [
  { slug: "what-is-studynova", category: "開始使用", sortOrder: 1, relatedCodes: [], question: "StudyNova AI 是什麼？和一般 AI 聊天網站有什麼不同？", answer: "StudyNova AI 是一個完整的學習管理平台，不只是聊天。它把你的成績、教材、考卷、錯題、錄音、讀書計畫、好友與 AI 助理 Novi 整合在一起：AI 會讀取「你授權的真實資料」來給建議，所有分數、趨勢、Nova 點數都存在資料庫，不是假畫面。" },
  { slug: "nova-id", category: "帳號", sortOrder: 1, relatedCodes: ["SN-ACCT-1201"], question: "NOVA ID 是什麼？可以修改嗎？", answer: "NOVA ID 是系統在你註冊時自動產生的公開識別碼（格式 NV-XXXX-XXXX），全球唯一、由伺服器產生，無法自行修改或偽造。它不包含你的 Email 或真實姓名，所以可以安全地分享給同學加好友。" },
  { slug: "register-email", category: "帳號", sortOrder: 2, relatedCodes: ["SN-AUTH-1005"], question: "註冊需要驗證 Email 嗎？", answer: "不需要。註冊完成後立即可以登入使用。Email 只會用在「忘記密碼」時驗證你是帳號本人。" },
  { slug: "forgot-password", category: "帳號", sortOrder: 3, relatedCodes: ["SN-AUTH-1007", "SN-AUTH-1008"], question: "忘記密碼怎麼辦？", answer: "在登入頁點「忘記密碼」，輸入註冊 Email，系統會產生一次性重設連結：30 分鐘內有效、只能使用一次，使用後所有裝置的登入狀態都會被登出。若沒有收到，請確認 Email 是否正確或改用「回報問題」聯絡管理員。" },
  { slug: "login-failed", category: "帳號", sortOrder: 4, relatedCodes: ["SN-AUTH-1002", "SN-AUTH-1003"], question: "登入一直失敗（SN-AUTH-1002）怎麼辦？", answer: "為了安全，登入失敗不會告訴你帳號是否存在，一律顯示相同訊息。請確認：1) NOVA ID 需含連字號且為大寫；2) 密碼大小寫；3) 是否被短時間多次嘗試而觸發速率限制（SN-RATE-9701），等幾分鐘再試。若顯示 SN-AUTH-1003 代表帳號被管理員停用。" },
  { slug: "who-can-see-my-data", category: "隱私與安全", sortOrder: 1, relatedCodes: ["SN-PERM-3002"], question: "我的成績、教材和錄音別人看得到嗎？", answer: "看不到。所有學習資料預設為完全私人，以 userId 綁定並在伺服器端驗證擁有權。私人教材、OCR、錄音與 AI 對話不會出現在任何公開搜尋。只有在你主動建立分享卡或把內容改成公開／好友可見時，別人才看得到。" },
  { slug: "ai-read-my-data", category: "AI", sortOrder: 1, relatedCodes: [], question: "AI 會看到我的哪些資料？", answer: "只有你在對話上方勾選授權的類別（學習設定／成績／錯題／讀書計畫／待辦／指定教材）。沒有勾選就完全不會傳送。你也可以隨時在「Novi 記憶」中刪除 AI 記住的內容。" },
  { slug: "ai-write-data", category: "AI", sortOrder: 2, relatedCodes: ["SN-AI-6007", "SN-AI-6008"], question: "AI 會不會偷偷幫我改資料？", answer: "不會。當 Novi 想建立任務、筆記、測驗或修改今日計畫時，它只能「提出建議」，畫面會顯示完整預覽與 JSON，必須由你按下「確認執行」，伺服器再次驗證後才會以 Transaction 寫入資料庫。" },
  { slug: "ai-unavailable", category: "AI", sortOrder: 3, relatedCodes: ["SN-AI-6001", "SN-AI-6002", "SN-AI-6003"], question: "為什麼 AI 功能顯示無法使用？", answer: "SN-AI-6001 代表管理員尚未設定任何 AI API Key。SN-AI-6002／6003 代表供應商暫時異常或額度用盡：系統會依 Gemini → OpenAI → OpenRouter 自動切換，若三家都失敗才會顯示。額度用盡時會冷卻到下個月，管理員可在後台 AI Health 查看與手動清除冷卻。" },
  { slug: "quota", category: "額度與會員", sortOrder: 1, relatedCodes: ["SN-QUOTA-4001", "SN-QUOTA-4003", "SN-QUOTA-4004"], question: "免費版和 Nova Pro 的額度差在哪裡？", answer: "免費版每日：情境 AI 12 次、AI 練習 3 組、教材整理 3 次、錯題複習 5 次、圖片辨識 5 張，AI 讀書計畫／AI 朗讀／多圖辨識未開放。Nova Pro 每日：情境 AI 80 次、AI 練習 15 組、教材整理 15 次、AI 讀書計畫 5 次、錯題複習 30 次、AI 朗讀 20 次、圖片辨識 50 張、多圖辨識 10 次。所有數值皆可由管理員在後台調整，實際額度以「我的通行證」頁面為準。" },
  { slug: "get-nova-pro", category: "額度與會員", sortOrder: 2, relatedCodes: ["SN-QUOTA-4003"], question: "怎麼取得 Nova Pro？可以自己付費購買嗎？", answer: "不行也不需要。Nova Pro 不是付費商品，站上沒有任何信用卡或訂閱功能。只能由管理員授予、延長或回收，也可以透過管理員發放的優惠碼兌換天數。Nova Pro 期間學習獎勵的 Nova 與 XP 都會加倍。" },
  { slug: "nova-vs-xp", category: "額度與會員", sortOrder: 3, relatedCodes: ["SN-NOVA-5001"], question: "Nova 和 XP 有什麼不同？", answer: "Nova 是可以花掉的虛擬點數，用來升級 Novi、購買外觀特效與參加特定週次小考。XP 完全獨立，只會累積、不會減少，用於 Novi 等級、徽章、成就與排行榜。兩者都由後端 Ledger 記錄，前端無法修改。" },
  { slug: "nova-not-added", category: "額度與會員", sortOrder: 4, relatedCodes: ["SN-NOVA-5004"], question: "我完成任務了，為什麼沒有拿到 Nova？", answer: "任務要「達成目標數量」後按下領取按鈕才會發放，且每個任務每天只能領一次（重複請求會被冪等機制擋下，顯示 SN-NOVA-5004）。你可以在「我的 → Nova 紀錄」查看每一筆交易明細，如果對帳有疑問請附上時間回報問題。" },
  { slug: "weekly-exam-open", category: "每週補習小考", sortOrder: 1, relatedCodes: ["SN-WEEK-8002", "SN-WEEK-8003", "SN-WEEK-8004"], question: "每週補習小考什麼時候開放？", answer: "預設是星期六、日開放，但管理員可以自由設定任何星期、時間，或手動開放／關閉、臨時開放、重新開放歷史週次。若顯示 SN-WEEK-8002 代表目前不在開放時間；8003 代表該週次限 Nova Pro；8004 代表你不在指定名單或班級中。" },
  { slug: "weekly-exam-content", category: "每週補習小考", sortOrder: 2, relatedCodes: [], question: "本週的單字和考卷是怎麼來的？會不會有錯？", answer: "老師（管理員）上傳考卷與答案照片後，AI 會先做 OCR 與題答配對，產生「草稿」。草稿一定要管理員逐項檢查、修改並按下「確認並發布」，學生端才看得到。AI 不確定的項目會標記 ⚠️ 提醒人工確認。若你仍發現內容有誤，請用「回報問題 → 教材／題目內容錯誤」告訴我們。" },
  { slug: "weekly-retake", category: "每週補習小考", sortOrder: 3, relatedCodes: ["SN-WEEK-8005", "SN-WEEK-8006"], question: "小考可以重考嗎？", answer: "同一個週次每位學生只能正式作答一次（顯示 SN-WEEK-8005／8006 代表已完成）。但「快速背誦」「單字」「句子」可以無限次練習，歷史週次也永久保存，管理員也能重新開放舊週次讓大家複習。" },
  { slug: "ocr-tips", category: "功能操作", sortOrder: 1, relatedCodes: ["SN-AI-6006", "SN-FILE-7002"], question: "拍照辨識（OCR）不準確怎麼辦？", answer: "建議：1) 光線充足、避免反光與陰影；2) 讓文字填滿畫面並保持水平；3) 使用「裁切」只留下要辨識的區域；4) 用螢光筆框選重點區域，AI 會特別標註。辨識後的文字可以直接在畫面上手動修改再送去產生筆記或題目。" },
  { slug: "voice-scoring", category: "功能操作", sortOrder: 2, relatedCodes: ["SN-AI-6009"], question: "錄音分數是怎麼算的？", answer: "AI 會先把你的錄音轉成逐字稿，再與你提供的參考文本比對，輸出流暢度、正確度、完整度、語速四項（各 0-100）與總分，並列出漏讀／多讀的字詞和具體改善建議。沒有提供參考文本時，會依內容完整度與發音清晰度評分。" },
  { slug: "offline-mobile", category: "功能操作", sortOrder: 3, relatedCodes: [], question: "手機可以用嗎？可以裝成 App 嗎？", answer: "可以。網站採 Mobile First 設計（375/390/430px 皆完整測試），底部有五個主要分頁，Novi 助理不會遮擋導覽列且可縮小收合。在手機瀏覽器選「加入主畫面」即可像 App 一樣使用，並支援推播通知。" },
  { slug: "push", category: "功能操作", sortOrder: 4, relatedCodes: ["SN-ADMIN-9509"], question: "如何開啟學習提醒推播？", answer: "到「我的 → 安全與通知 → 開啟推播」，允許瀏覽器通知即可。若顯示 SN-ADMIN-9509 代表伺服器尚未設定 VAPID 金鑰，請通知管理員。iOS 需先把網站加入主畫面才能接收推播。" },
  { slug: "error-code", category: "疑難排解", sortOrder: 1, relatedCodes: ["SN-SYS-9901"], question: "畫面出現「錯誤代碼 SN-XXX-####」是什麼意思？", answer: "StudyNova 的每一個錯誤都有專屬代碼，方便快速定位問題。你可以在「常見問題 → 錯誤代碼查詢」輸入代碼看說明與解法，或直接點「回報問題」，系統會自動帶入代碼與追蹤編號（REQ-XXXXXXXXXX），管理員就能精準找到那次請求的紀錄。" },
  { slug: "rate-limit", category: "疑難排解", sortOrder: 2, relatedCodes: ["SN-RATE-9701"], question: "為什麼提示「操作太頻繁」（SN-RATE-9701）？", answer: "為了避免濫用與保護所有同學的使用體驗，登入、註冊、AI、OCR、上傳等端點都有速率限制。稍等 1-15 分鐘後即可恢復；若你認為是誤判，請回報問題並附上代碼。" },
  { slug: "data-delete", category: "隱私與安全", sortOrder: 2, relatedCodes: ["SN-AUTH-1010"], question: "我可以刪除我的帳號和所有資料嗎？", answer: "可以。到「我的 → 個人資料」使用刪除帳號功能並輸入密碼確認，你的成績、教材、錄音、AI 對話、Nova 紀錄等都會由資料庫層級連動刪除（cascade），不可復原。擁有者帳號需先轉移權限才能刪除。" },
  { slug: "report-issue", category: "疑難排解", sortOrder: 3, relatedCodes: [], question: "發現 Bug 或內容錯誤要怎麼回報？", answer: "點選頁尾或側邊的「回報問題」，填寫分類、嚴重程度、標題與重現步驟，可附上截圖。送出後會得到單號（SN-T-日期-XXXX），你能在「我的回報」追蹤狀態；管理員更新狀態時你會收到通知與推播。" },
];

/* ------------------------------------------------------------- LEGAL */

const LEGAL = [
  {
    slug: "privacy",
    title: "StudyNova AI 隱私權政策",
    version: "1.0",
    body: `## 1. 我們是誰
StudyNova AI（以下稱「本平台」）是一個提供台灣國中、高中學生使用的線上學習管理平台。本政策說明我們如何蒐集、使用、保存與保護你的個人資料。

## 2. 我們蒐集哪些資料
**(a) 你主動提供的資料**
- 帳號資料：Email、密碼（僅保存不可逆的雜湊值）、顯示名稱
- 學習設定：學制、年級、每日目標、偏好科目、英文程度、提醒時間
- 學習內容：成績紀錄、考試資訊、教材與檔案、OCR 圖片與文字、筆記、測驗作答、錯題、單字與句子練習紀錄、錄音檔與逐字稿、讀書計畫、待辦事項
- 社交資料：好友關係、讀書房、挑戰成績、你主動建立的分享卡
- 問題回報：你填寫的標題、描述、聯絡 Email 與選擇性上傳的截圖

**(b) 系統自動產生的資料**
- NOVA ID（伺服器產生的公開識別碼，不含 Email 或真實姓名）
- 登入階段資訊：Session 雜湊、IP、瀏覽器 User-Agent、登入時間
- 使用紀錄：學習分鐘數、功能使用次數、Nova／XP 交易明細
- 技術紀錄：錯誤代碼、請求追蹤編號、伺服器錯誤日誌

**(c) 我們不會蒐集**
- 我們不使用第三方廣告追蹤器，不販售你的資料，不對未成年使用者投放行為廣告。

## 3. 我們如何使用這些資料
- 提供並維持平台功能（成績分析、AI 建議、測驗、錯題複習、每週小考等）
- 產生只屬於你的學習統計與報告
- 在你明確授權的情況下，將指定類別的學習資料提供給 AI 供應商以產生回覆
- 偵測濫用、防止舞弊與保障系統安全
- 依你的設定寄送學習提醒與通知

## 4. AI 資料處理
- AI 供應商依序為 Google Gemini、OpenAI、OpenRouter，僅在你使用 AI 功能時才會傳送資料。
- 在 AI 對話中，只有你勾選授權的類別（學習設定／成績／錯題／讀書計畫／待辦／指定教材）會被傳送；未勾選者完全不會離開本平台。
- OCR、教材整理、語音分析會傳送你上傳的該次內容以取得結果。
- 我們的 AI 使用紀錄只保存供應商名稱、模型、功能、成功與否、token 數量與延遲，**不會**記錄 API Key、Cookie、Token 或你的完整個人資料。
- AI 無法自行寫入你的資料；任何建立或修改都必須由你確認。

## 5. 資料保存與刪除
- 學習資料保存至你刪除該筆資料或刪除帳號為止。
- 刪除帳號後，與你相關的成績、教材、檔案、錄音、AI 對話、通知、Nova 紀錄等會由資料庫連動刪除且不可復原。
- 系統錯誤日誌與通知會於 90 天後自動清理。
- 每週小考的歷史內容（考卷、單字、句子、統計）會長期保存以供複習，但學生個人成績同樣受帳號刪除影響。

## 6. 資料安全措施
- 密碼使用記憶體硬化雜湊演算法（scrypt N=32768, r=8, p=2）保存，永不保存明文。
- 登入使用 HttpOnly、SameSite、Secure Cookie，並定期自動輪替 Session；Token 不會存在 localStorage 或網址中。
- 所有資料存取都在伺服器端驗證擁有權（userId ownership）。
- 上傳檔案一律私有，僅能透過短效（15 分鐘）簽章連結存取，並驗證 MIME、副檔名與大小。
- 所有資料庫查詢皆為參數化，防止 SQL Injection；所有輸入皆經 schema 驗證。
- 點數、經驗值、會員與獎勵均使用交易（Transaction）與冪等鍵，避免重複發放或扣除。

## 7. 資料分享
除下列情況外，我們不會將你的資料提供給第三方：
1. 你主動建立分享連結或將內容設為公開／好友可見；
2. 為提供 AI 功能而傳送給前述 AI 供應商；
3. 法律要求或為保護平台與使用者安全之必要。

## 8. 你的權利
你可以隨時：查閱與匯出自己的資料、修改學習設定與個人資料、刪除單筆學習內容、刪除 AI 記憶、撤銷 AI 資料授權、撤銷登入裝置、刪除整個帳號。若需要協助，請使用「回報問題」功能。

## 9. 未成年使用者
本平台主要服務國中與高中學生。我們僅蒐集提供服務所需的最少資料，並建議未滿 18 歲的使用者在使用前告知家長或監護人。

## 10. 政策更新
本政策如有重大變更，我們會在平台公告並更新版本與生效日期。`,
  },
  {
    slug: "terms",
    title: "StudyNova AI 使用條款",
    version: "1.0",
    body: `## 1. 服務說明
StudyNova AI 提供學習管理、成績分析、AI 學習輔助、教材辨識、測驗與社交學習等功能。使用本平台即表示你同意本條款與隱私權政策。

## 2. 帳號規範
- 你必須提供正確的 Email 以便重設密碼。
- 你有責任保管自己的密碼，不得將帳號出借或轉讓。
- NOVA ID 由系統產生，不可偽造或試圖竄改。
- 禁止建立大量帳號、自動化腳本或以任何方式繞過額度限制。

## 3. 內容規範
- 你上傳的教材、圖片、錄音必須是你有權使用的內容。
- 禁止上傳違法、侵權、含惡意程式或不當內容。
- 分享功能僅供學習用途；不得散布他人未授權的個人資料。

## 4. AI 使用聲明
- AI 產生的內容（解題、筆記、題目、翻譯、評分）僅供學習參考，可能不完全正確。
- 重要考試與作業請務必自行查證，本平台不對 AI 內容的正確性作保證。
- 禁止利用 AI 功能進行考試舞弊或代寫作業等學術不誠信行為。

## 5. Nova 點數與 Nova Pro
- Nova 與 XP 為平台內虛擬數值，**不具現金價值、不可兌換現金、不可轉讓**。
- Nova Pro 為管理員授予的身分，非付費商品，平台不提供任何線上付款。
- 若發現以不正當方式取得點數或會員資格，管理員有權回收並停用帳號。

## 6. 服務可用性
本平台可能因維護、第三方服務（AI、儲存、推播）中斷而暫停部分功能。我們會盡力維持穩定，但不保證服務不中斷。

## 7. 帳號停用
違反本條款者，管理員得暫停或終止帳號；所有管理操作都會記錄於稽核日誌並附上原因。

## 8. 責任限制
本平台以「現況」提供服務。在法律允許範圍內，我們不對因使用或無法使用本服務所造成的間接損失負責。

## 9. 條款變更
條款更新後會在平台公告，繼續使用即表示你接受更新後的條款。`,
  },
];
