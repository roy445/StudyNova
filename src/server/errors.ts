import { createHash, randomBytes } from "node:crypto";

/**
 * StudyNova AI – 統一錯誤代碼系統
 *
 * 每一個錯誤都有專屬代碼，格式：SN-<類別>-<編號>
 *  - 已文件化的錯誤：使用 ERROR_CATALOG 中的固定代碼（可在 docs/ERROR_CODES.md 查詢）
 *  - 其餘動態錯誤：依訊息內容推導出穩定且唯一的代碼（同樣訊息永遠得到同樣代碼）
 *
 * 錯誤永遠不會洩漏 API Key / Token / Cookie / SQL / 伺服器路徑。
 */

export type ErrorCategory =
  | "AUTH"
  | "ACCT"
  | "REQ"
  | "PERM"
  | "QUOTA"
  | "NOVA"
  | "AI"
  | "FILE"
  | "WEEK"
  | "SOCIAL"
  | "ADMIN"
  | "RATE"
  | "NF"
  | "CONF"
  | "SYS";

export type ErrorDef = {
  code: string;
  status: number;
  category: ErrorCategory;
  message: string;
  hint: string;
};

function def(code: string, status: number, category: ErrorCategory, message: string, hint: string): ErrorDef {
  return { code, status, category, message, hint };
}

/** 已文件化的錯誤代碼（docs/ERROR_CODES.md 會完整列出） */
export const ERROR_CATALOG = {
  /* ---------------------------------------------------------- AUTH 1xxx */
  AUTH_REQUIRED: def("SN-AUTH-1001", 401, "AUTH", "請先登入", "你的登入狀態已失效，請重新登入後再試一次。"),
  AUTH_INVALID_CREDENTIALS: def("SN-AUTH-1002", 401, "AUTH", "NOVA ID／Email 或密碼不正確", "請確認大小寫是否正確；忘記密碼可使用「忘記密碼」重設。"),
  AUTH_ACCOUNT_BLOCKED: def("SN-AUTH-1003", 401, "AUTH", "此帳號已被停用", "請透過「回報問題」聯絡管理員了解原因。"),
  AUTH_SESSION_EXPIRED: def("SN-AUTH-1004", 401, "AUTH", "登入階段已過期", "為了保護你的資料，登入超過 14 天會自動失效，請重新登入。"),
  AUTH_EMAIL_TAKEN: def("SN-AUTH-1005", 409, "AUTH", "此 Email 已註冊", "請直接登入，或使用「忘記密碼」重設密碼。"),
  AUTH_NOVAID_GENERATE_FAILED: def("SN-AUTH-1006", 409, "AUTH", "NOVA ID 產生失敗", "這是極少見的情況，請重新送出註冊。"),
  AUTH_RESET_TOKEN_INVALID: def("SN-AUTH-1007", 400, "AUTH", "重設連結無效或已過期", "重設連結 30 分鐘內有效且只能使用一次，請重新申請。"),
  AUTH_RESET_TOKEN_USED: def("SN-AUTH-1008", 400, "AUTH", "重設連結已被使用", "請重新申請一組新的重設連結。"),
  AUTH_PASSWORD_WRONG: def("SN-AUTH-1009", 400, "AUTH", "目前密碼不正確", "請重新輸入目前的密碼；若已忘記請登出後使用忘記密碼。"),
  AUTH_OWNER_PROTECTED: def("SN-AUTH-1010", 400, "AUTH", "擁有者帳號不可自行刪除", "請先將擁有者權限轉移給其他管理員。"),

  /* ---------------------------------------------------------- ACCT 12xx */
  ACCT_NOT_FOUND: def("SN-ACCT-1201", 404, "ACCT", "找不到這個 NOVA ID", "請確認 NOVA ID 是否輸入正確（格式：NV-XXXX-XXXX）。"),
  ACCT_SELF_ACTION: def("SN-ACCT-1202", 400, "ACCT", "不能對自己執行這個操作", "請選擇其他使用者。"),

  /* ----------------------------------------------------------- REQ 2xxx */
  REQ_INVALID_JSON: def("SN-REQ-2001", 400, "REQ", "請求格式錯誤", "請重新整理頁面後再試一次。"),
  REQ_VALIDATION: def("SN-REQ-2002", 400, "REQ", "輸入資料未通過驗證", "請依照欄位提示修正後再送出。"),
  REQ_ROUTE_NOT_FOUND: def("SN-REQ-2003", 404, "REQ", "找不到這個 API 端點", "請重新整理頁面；若持續發生請回報問題。"),
  REQ_SCORE_OVER_FULL: def("SN-REQ-2004", 400, "REQ", "得分不可超過滿分", "請確認滿分與實得分數是否填反。"),
  REQ_CONTENT_TOO_SHORT: def("SN-REQ-2005", 400, "REQ", "內容太短，無法進行 AI 分析", "請提供至少 20 個字的教材內容。"),
  REQ_NO_FILE: def("SN-REQ-2006", 400, "REQ", "請至少選擇一個檔案", "點擊上傳按鈕選擇圖片或 PDF。"),
  REQ_UNSUPPORTED_ACTION: def("SN-REQ-2007", 400, "REQ", "不支援的操作類型", "請重新整理頁面後再試一次。"),
  REQ_NOTHING_TO_REVIEW: def("SN-REQ-2008", 400, "REQ", "目前沒有需要複習的錯題", "先完成一份測驗，答錯的題目會自動進入錯題本。"),
  REQ_NO_GRADE_DATA: def("SN-REQ-2009", 400, "REQ", "目前還沒有任何成績資料", "請先在「成績」頁新增至少一筆成績。"),

  /* ---------------------------------------------------------- PERM 3xxx */
  PERM_DENIED: def("SN-PERM-3001", 403, "PERM", "沒有權限執行此操作", "這筆資料不屬於你，或你的角色沒有這個權限。"),
  PERM_NOT_OWNER: def("SN-PERM-3002", 403, "PERM", "這不是你的資料", "所有學習資料都只有本人能存取。"),
  PERM_ADMIN_REQUIRED: def("SN-PERM-3003", 403, "PERM", "需要管理員權限", "請使用管理員帳號登入後再操作。"),
  PERM_FILE_DENIED: def("SN-PERM-3004", 403, "PERM", "沒有權限存取這個檔案", "檔案連結可能已過期，請回到原頁面重新開啟。"),

  /* --------------------------------------------------------- QUOTA 4xxx */
  QUOTA_EXHAUSTED: def("SN-QUOTA-4001", 429, "QUOTA", "今日使用額度已用完", "明天 00:00 會自動重置，或升級 Nova Pro 取得更高額度。"),
  QUOTA_FEATURE_DISABLED: def("SN-QUOTA-4002", 403, "QUOTA", "此功能目前已停用", "管理員暫時關閉了這個功能，請稍後再試。"),
  QUOTA_PRO_REQUIRED: def("SN-QUOTA-4003", 403, "QUOTA", "這是 Nova Pro 專屬功能", "Nova Pro 由管理員授予，可透過「回報問題」向管理員申請。"),
  QUOTA_NOT_IN_PLAN: def("SN-QUOTA-4004", 403, "QUOTA", "你的方案未開放此功能", "升級 Nova Pro 即可使用。"),

  /* ---------------------------------------------------------- NOVA 5xxx */
  NOVA_INSUFFICIENT: def("SN-NOVA-5001", 400, "NOVA", "Nova 餘額不足", "完成每日任務、專注學習或測驗都能獲得 Nova。"),
  NOVA_INVALID_AMOUNT: def("SN-NOVA-5002", 400, "NOVA", "Nova 數量不正確", "數量必須是不為零的整數。"),
  NOVA_XP_INVALID: def("SN-NOVA-5003", 400, "NOVA", "XP 數量不正確", "XP 必須是大於 0 的整數。"),
  NOVA_TASK_NOT_CLAIMABLE: def("SN-NOVA-5004", 409, "NOVA", "這個任務尚未完成或已領取過獎勵", "同一個任務的獎勵每天只能領取一次。"),
  NOVA_ITEM_OWNED: def("SN-NOVA-5005", 409, "NOVA", "你已經擁有這個商品", "可直接到 Novi 養成頁切換裝備。"),
  NOVA_ITEM_LEVEL: def("SN-NOVA-5006", 400, "NOVA", "Novi 等級不足", "繼續學習累積 XP 就能升級 Novi。"),
  NOVA_MAX_LEVEL: def("SN-NOVA-5007", 400, "NOVA", "Novi 已經是最高等級", "你已達成 Lv.5 AI 核心，恭喜！"),
  NOVA_XP_NOT_ENOUGH: def("SN-NOVA-5008", 400, "NOVA", "XP 不足以升級", "再累積一些學習時數就能升級。"),
  NOVA_UPGRADE_CONFLICT: def("SN-NOVA-5009", 409, "NOVA", "升級失敗，請重試", "可能是同時送出了兩次升級請求。"),
  COUPON_INVALID: def("SN-NOVA-5010", 400, "NOVA", "優惠碼無效、已過期或已被使用", "請確認代碼是否正確，或向管理員索取新的優惠碼。"),
  COUPON_ALREADY_USED: def("SN-NOVA-5011", 409, "NOVA", "你已經使用過這個優惠碼", "每個帳號只能使用同一組優惠碼一次。"),
  COUPON_LIMIT_REACHED: def("SN-NOVA-5012", 400, "NOVA", "這個優惠碼的使用次數已用完", "請向管理員索取新的優惠碼。"),

  /* ------------------------------------------------------------ AI 6xxx */
  AI_NOT_CONFIGURED: def("SN-AI-6001", 503, "AI", "AI 服務尚未設定", "請管理員在環境變數設定 GOOGLE_GEMINI_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY。"),
  AI_PROVIDER_ERROR: def("SN-AI-6002", 502, "AI", "AI 服務暫時無法使用", "系統已自動嘗試備援供應商，請稍後再試一次。"),
  AI_ALL_UNAVAILABLE: def("SN-AI-6003", 503, "AI", "所有 AI 供應商目前皆無法使用", "可能是額度用盡或服務中斷，管理員可在 AI Health 查看詳情。"),
  AI_EMPTY_RESULT: def("SN-AI-6004", 502, "AI", "AI 沒有回傳有效內容", "請補充更多內容或重新送出。"),
  AI_NO_VALID_QUESTIONS: def("SN-AI-6005", 400, "AI", "AI 沒有產生有效題目", "請提供更完整的教材內容後重試。"),
  AI_OCR_EMPTY: def("SN-AI-6006", 400, "AI", "OCR 沒有取得任何文字", "請確認照片清晰、光線充足且文字未被裁切。"),
  AI_ACTION_INVALID: def("SN-AI-6007", 400, "AI", "這個 AI 建議已處理過或沒有可執行動作", "請重新整理對話後再試。"),
  AI_ACTION_UNSUPPORTED: def("SN-AI-6008", 400, "AI", "不支援的 AI 動作", "Novi 只能建立任務／筆記／測驗或修改今日計畫。"),
  AI_VOICE_REQUIRED: def("SN-AI-6009", 400, "AI", "語音分析需要 AI 服務", "請先請管理員設定 AI Provider。"),

  /* ---------------------------------------------------------- FILE 7xxx */
  FILE_EMPTY: def("SN-FILE-7001", 400, "FILE", "檔案是空的", "請重新選擇檔案。"),
  FILE_TOO_LARGE: def("SN-FILE-7002", 400, "FILE", "檔案太大", "請壓縮後再上傳，單檔上限預設為 15MB。"),
  FILE_MIME_UNSUPPORTED: def("SN-FILE-7003", 400, "FILE", "不支援的檔案類型", "支援 PNG / JPG / WEBP / HEIC / PDF / TXT / 音訊檔。"),
  FILE_EXT_UNSUPPORTED: def("SN-FILE-7004", 400, "FILE", "不支援的副檔名", "請確認檔名結尾是否為允許的格式。"),
  FILE_NOT_FOUND: def("SN-FILE-7005", 404, "FILE", "找不到檔案", "檔案可能已被刪除。"),
  FILE_READ_FAILED: def("SN-FILE-7006", 502, "FILE", "檔案讀取失敗", "儲存服務可能暫時異常，請稍後再試。"),
  FILE_STORAGE_MISCONFIG: def("SN-FILE-7007", 500, "FILE", "檔案服務設定不完整", "請管理員確認 SESSION_SECRET 與 S3 設定。"),

  /* ---------------------------------------------------------- WEEK 8xxx */
  WEEK_NOT_FOUND: def("SN-WEEK-8001", 404, "WEEK", "找不到這個週次", "週次可能尚未發布或已被封存。"),
  WEEK_NOT_OPEN: def("SN-WEEK-8002", 403, "WEEK", "這個週次目前未開放", "請於管理員設定的開放時間內進入。"),
  WEEK_PRO_ONLY: def("SN-WEEK-8003", 403, "WEEK", "這個週次僅開放 Nova Pro 會員", "可向管理員申請 Nova Pro。"),
  WEEK_NOT_ALLOWED: def("SN-WEEK-8004", 403, "WEEK", "你不在這個週次的開放名單中", "請確認你是否已加入對應班級。"),
  WEEK_ALREADY_DONE: def("SN-WEEK-8005", 409, "WEEK", "你已經完成這個週次的小考", "可到成績統計查看你的排名。"),
  WEEK_ALREADY_SUBMITTED: def("SN-WEEK-8006", 409, "WEEK", "這份測驗已經交卷", "請重新整理頁面查看成績。"),
  WEEK_CODE_EXISTS: def("SN-WEEK-8007", 409, "WEEK", "這個週次已存在", "請改用其他週次代碼，或直接編輯既有週次。"),
  WEEK_DRAFT_HANDLED: def("SN-WEEK-8008", 409, "WEEK", "這份草稿已處理過", "同一份 AI 草稿只能確認或捨棄一次。"),
  WEEK_DRAFT_NOT_FOUND: def("SN-WEEK-8009", 404, "WEEK", "找不到 AI 草稿", "請重新執行 AI OCR 分析。"),
  WEEK_NO_FILES: def("SN-WEEK-8010", 400, "WEEK", "請先上傳考卷／答案／雜誌圖片", "考卷與答案需要分開上傳。"),

  /* -------------------------------------------------------- SOCIAL 9xxx */
  SOCIAL_SELF_FRIEND: def("SN-SOCIAL-9001", 400, "SOCIAL", "不能加自己為好友", "把你的 NOVA ID 分享給同學吧！"),
  SOCIAL_ALREADY_FRIEND: def("SN-SOCIAL-9002", 409, "SOCIAL", "你們已經是好友了", "可直接發起挑戰或邀請進讀書房。"),
  SOCIAL_BLOCKED: def("SN-SOCIAL-9003", 403, "SOCIAL", "無法傳送好友邀請", "其中一方已封鎖對方。"),
  SOCIAL_REQUEST_NOT_FOUND: def("SN-SOCIAL-9004", 404, "SOCIAL", "找不到好友邀請", "邀請可能已被取消。"),
  SOCIAL_REQUEST_HANDLED: def("SN-SOCIAL-9005", 409, "SOCIAL", "這個邀請已處理過", "請重新整理頁面。"),
  SOCIAL_CHALLENGE_ENDED: def("SN-SOCIAL-9006", 409, "SOCIAL", "挑戰已結束", "可以發起一場新的挑戰。"),
  SOCIAL_ROOM_NOT_FOUND: def("SN-SOCIAL-9007", 404, "SOCIAL", "找不到讀書房代碼", "請向房主確認 6 碼邀請碼。"),
  SOCIAL_SHARE_NOT_FOUND: def("SN-SOCIAL-9008", 404, "SOCIAL", "這個分享連結不存在或已被移除", "請向分享者索取新的連結。"),
  SOCIAL_QUIZ_NOT_OWNED: def("SN-SOCIAL-9009", 403, "SOCIAL", "只能用自己的測驗建立挑戰", "請先建立一份屬於你的測驗。"),

  /* --------------------------------------------------------- ADMIN 95xx */
  ADMIN_TARGET_PROTECTED: def("SN-ADMIN-9501", 400, "ADMIN", "不能對擁有者執行此操作", "擁有者帳號受到保護。"),
  ADMIN_MISSING_PARAM: def("SN-ADMIN-9502", 400, "ADMIN", "缺少必要參數", "請填寫操作所需的數量／天數／功能／角色。"),
  ADMIN_COUPON_EXISTS: def("SN-ADMIN-9503", 409, "ADMIN", "這個優惠碼已存在", "請改用其他代碼。"),
  ADMIN_ITEM_EXISTS: def("SN-ADMIN-9504", 409, "ADMIN", "這個商品代碼已存在", "請改用其他 code。"),
  ADMIN_EXPORT_UNSUPPORTED: def("SN-ADMIN-9505", 400, "ADMIN", "不支援的匯出類型", "請使用後台提供的匯出按鈕。"),
  ADMIN_CRON_SECRET_MISSING: def("SN-ADMIN-9506", 400, "ADMIN", "尚未設定 CRON_SECRET", "請在環境變數設定 CRON_SECRET 後重新啟動。"),
  ADMIN_CRON_SECRET_INVALID: def("SN-ADMIN-9507", 400, "ADMIN", "CRON secret 不正確", "請確認排程服務帶上正確的 x-cron-secret 標頭。"),
  ADMIN_CRON_TASK_UNKNOWN: def("SN-ADMIN-9508", 400, "ADMIN", "不支援的排程任務", "請從後台 Cron 分頁選擇任務。"),
  ADMIN_PUSH_NOT_CONFIGURED: def("SN-ADMIN-9509", 400, "ADMIN", "尚未設定 VAPID 金鑰", "請執行 npx web-push generate-vapid-keys 並填入環境變數。"),

  /* ---------------------------------------------------------- RATE 97xx */
  RATE_LIMITED: def("SN-RATE-9701", 429, "RATE", "操作太頻繁，請稍後再試", "為了保護系統，短時間內的重複請求會被暫時限制。"),

  /* ----------------------------------------------------------- SYS 99xx */
  SYS_INTERNAL: def("SN-SYS-9901", 500, "SYS", "系統發生錯誤，請稍後再試", "我們已自動記錄這個錯誤，你可以附上錯誤代碼回報問題。"),
  SYS_DB_UNAVAILABLE: def("SN-SYS-9902", 503, "SYS", "資料庫暫時無法連線", "請稍後再試；若持續發生請通知管理員。"),
  SYS_NOT_FOUND: def("SN-SYS-9903", 404, "SYS", "找不到資料", "資料可能已被刪除。"),
  SYS_CONFLICT: def("SN-SYS-9904", 409, "SYS", "資料狀態衝突", "請重新整理頁面後再試一次。"),
} as const satisfies Record<string, ErrorDef>;

export type ErrorKey = keyof typeof ERROR_CATALOG;

export const CATALOG_LIST: ErrorDef[] = Object.values(ERROR_CATALOG);

const CODE_INDEX = new Map<string, ErrorDef>(CATALOG_LIST.map((d) => [d.code, d]));
export const lookupErrorCode = (code: string) => CODE_INDEX.get(code) ?? null;

/** 依訊息推導穩定的錯誤代碼（同一段訊息永遠得到同一組代碼） */
export function deriveErrorCode(category: ErrorCategory, message: string): string {
  const digest = createHash("sha256").update(`${category}:${message}`).digest("hex").slice(0, 4).toUpperCase();
  return `SN-${category}-${digest}`;
}

export const newRequestId = () => `REQ-${randomBytes(5).toString("hex").toUpperCase()}`;

/* --------------------------------------------------------------- error */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string;
  readonly category: ErrorCategory;
  readonly details?: unknown;
  readonly requestId: string;

  constructor(params: { status: number; code: string; message: string; hint?: string; category?: ErrorCategory; details?: unknown; requestId?: string }) {
    super(params.message);
    this.name = "AppError";
    this.status = params.status;
    this.code = params.code;
    this.hint = params.hint ?? "";
    this.category = params.category ?? "SYS";
    this.details = params.details;
    this.requestId = params.requestId ?? newRequestId();
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint, requestId: this.requestId, details: this.details };
  }
}

/** 由代碼目錄建立錯誤 */
export function fail(key: ErrorKey, override?: { message?: string; hint?: string; details?: unknown }): AppError {
  const d = ERROR_CATALOG[key];
  return new AppError({
    status: d.status,
    code: d.code,
    category: d.category,
    message: override?.message ?? d.message,
    hint: override?.hint ?? d.hint,
    details: override?.details,
  });
}

function dynamic(category: ErrorCategory, status: number, message: string, hint: string, details?: unknown) {
  return new AppError({ status, code: deriveErrorCode(category, message), category, message, hint, details });
}

/* ------------------------------------------------- 相容用的簡易建構子 */

export const badRequest = (message: string, details?: unknown) =>
  dynamic("REQ", 400, message, "請依照提示修正輸入內容後再送出。", details);

export const unauthorized = (message = ERROR_CATALOG.AUTH_REQUIRED.message) =>
  message === ERROR_CATALOG.AUTH_REQUIRED.message ? fail("AUTH_REQUIRED") : dynamic("AUTH", 401, message, "請重新登入後再試一次。");

export const forbidden = (message = ERROR_CATALOG.PERM_DENIED.message) =>
  message === ERROR_CATALOG.PERM_DENIED.message ? fail("PERM_DENIED") : dynamic("PERM", 403, message, "這項操作需要更高的權限或資料擁有權。");

export const notFound = (message = ERROR_CATALOG.SYS_NOT_FOUND.message) =>
  message === ERROR_CATALOG.SYS_NOT_FOUND.message ? fail("SYS_NOT_FOUND") : dynamic("NF", 404, message, "請重新整理頁面確認資料是否仍存在。");

export const conflict = (message: string) => dynamic("CONF", 409, message, "資料狀態已改變，請重新整理後再操作。");

export const tooMany = (message = ERROR_CATALOG.RATE_LIMITED.message) =>
  message === ERROR_CATALOG.RATE_LIMITED.message ? fail("RATE_LIMITED") : dynamic("RATE", 429, message, "請稍等一下再重試。");

/** 對外顯示前過濾任何可能的機密內容 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/key|token|secret|password|authorization|bearer|postgres:\/\/|redis:\/\/|https?:\/\//i.test(raw)) {
    return ERROR_CATALOG.SYS_INTERNAL.message;
  }
  return raw.slice(0, 200) || ERROR_CATALOG.SYS_INTERNAL.message;
}
