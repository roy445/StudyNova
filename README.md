# StudyNova AI｜超強 AI 讀書神器

> 讓學習更聰明，讓進步看得見。

StudyNova AI 是專為 **台灣國中／高中學生** 打造的正式全端學習平台：
**AI 學習平台 + 個人學習管理 + 成績分析 + 教材分析 + OCR + 錯題 + 測驗 + 錄音分析 + 每週小考 + 社交分享 + Novi AI 助理 + Nova 養成 + 管理後台**。

所有資料都是真實寫入 PostgreSQL、經過 Server 驗證、授權、Transaction 與 Audit，沒有假資料、沒有死按鈕。

---

## 1. 功能總覽

| 分類 | 功能 |
| --- | --- |
| 帳號 | NOVA ID 帳號系統（Server 產生、全域唯一）、Email/NOVA ID 登入、scrypt 記憶體硬化密碼雜湊、HttpOnly Session + 自動輪替、Rate Limit、忘記密碼（一次性 Token） |
| 學習 | 今日 AI 讀書計畫、專注計時器、每日任務、待辦與作業、學習紀錄與連續天數 |
| 成績 | 成績登錄（段考／小考／模擬考／作業／平時）、百分比・平均・最高・最低・趨勢、AI 成績分析、目標分數追蹤、考試倒數 |
| 教材 | PDF／TXT／圖片上傳、AI 文字擷取、AI 重點・單字・句子・筆記、教材可見度與分享 |
| OCR | 多圖上傳、排序、旋轉、裁切、5 色螢光筆框選、AI OCR、可編輯文字、8 種 AI 轉換（筆記／出題／解題／重點／記憶卡／翻譯／易錯／複習計畫） |
| 測驗 | AI 出題（6 種題型・5 種難度）、倒數計時、自動儲存與恢復、自動計分、解析、錯題自動建檔 |
| 錯題本 | 錯誤次數、複習次數、熟練度、間隔複習、AI 更簡單解法與記憶法、錯題複習卷 |
| 單字／句子 | 每日單字（依程度與熟悉度排序）、單字卡／中英互測／拼寫／限時挑戰、AI 記憶法、句子中英互譯與填空、TTS 朗讀 |
| 語音 | MediaRecorder 錄音（開始／暫停／繼續／結束／播放／重錄／刪除）、AI 逐字稿、流暢度・正確度・完整度・語速評分、漏字偵測、背誦測試、AI 口說 |
| 每週小考 | 週次管理、考卷／答案分開上傳、螢光筆語意設定、AI OCR + 題答配對草稿、管理員人工確認才發布、10 分鐘快速複習、模擬測驗、統計與排名、歷史週次永久保存與重新開放 |
| 社交 | NOVA ID 好友邀請／接受／拒絕／封鎖、QR Code 分享、好友挑戰與排行、讀書房（私人／好友／班級）共同計時、分享卡（Web Share API） |
| 經濟 | Nova 點數 Ledger（Atomic + Idempotency + Audit）、XP、成就、Novi 五級養成、Novi 商店（外觀／核心／特效／漂浮／聲音／稱號／徽章／通行證） |
| 會員 | Nova Pro（僅管理員授予／延長／回收）、雙倍 Nova 與 XP、我的通行證、優惠碼（Server 驗證、每帳號一次、總量限制） |
| AI | Gemini 2.5 Flash → GPT-4.1-mini → OpenRouter 三層 Fallback、只有 429/5xx/Timeout/Network/Quota 才降級、Quota 用盡持久化冷卻至下個 UTC 月初、完整 AI Log 與 Health 儀表板 |
| 通知 | 站內通知、Web Push（VAPID + Service Worker）、Idempotency 去重 |
| 排程 | Queue Adapter（Redis/BullMQ ↔ PostgreSQL）、7 個 Cron 任務、Secret 驗證 + Task UID 冪等 |
| 後台 | 總覽、使用者批次管理、Nova/XP 贈送、會員授予、功能權限與額度、公告、活動、優惠碼、題庫匯入、AI Health、系統健康、Cron、CSV 匯出、Audit Log、System Test Center |

---

## 2. 技術架構

- **前端**：TypeScript · React 19 · Next.js 16（App Router）· Tailwind CSS 4 · 自製 SVG 圖表 · RWD（375 / 390 / 430 / desktop）
- **後端**：Next.js Route Handlers + 自製 REST Router（`src/server/router.ts`）、zod 驗證、集中錯誤處理、Server-side Auth/Authorization
- **資料庫**：PostgreSQL + Drizzle ORM（`src/db/schema.ts`，80+ 資料表、FK / index / unique constraint）
- **Cache / Queue**：Redis + BullMQ（可替換 Adapter；未設定 `REDIS_URL` 時自動改用 PostgreSQL Queue）
- **檔案**：S3 / R2 / MinIO（S3 相容）；未設定時使用 PostgreSQL 物件儲存。檔案一律私有，透過 HMAC 簽名 URL + Ownership 驗證取用
- **AI**：Google Gemini `gemini-2.5-flash` → OpenAI `gpt-4.1-mini` → OpenRouter，REST 直呼、無 SDK 鎖定
- **部署**：Docker / Docker Compose / Vercel / 一般 Linux VPS

### 專案結構

```
src/
  app/                 # 頁面（App Router）
    (app)/             # 需登入的學生端（Dashboard / 學習 / AI / 成績 / 每週小考 / 挑戰 / 報告 / 個人）
    admin/             # 管理後台（總覽 / 每週小考 / AI・內容 / 系統）
    api/v1/[...path]/  # REST API 分派
    api/files/[id]/    # 私有檔案簽名存取
    api/health/        # Healthcheck + 冪等 Seed
    s/[slug]/          # 公開分享卡
  components/          # UI 元件庫、品牌（Logo / Novi）、圖表、AppShell
  features/study/      # 學習功能面板（教材 / OCR / 測驗 / 錯題 / 單字 / 句子 / 語音 / 計時 / 計畫）
  lib/                 # 前端 API client 與 hooks
  server/              # core / auth / ai / storage / queue / notify / economy / seed / router
    routes/            # auth・learning・content・quiz・ai・social・economy・weekly・admin・system
  db/                  # Drizzle schema 與連線
tests/                 # Vitest 單元／邏輯測試
scripts/backup.sh      # 備份 / 還原
```

---

## 3. Requirements

- Node.js 22+
- PostgreSQL 14+
- （選用）Redis 7+、S3 相容物件儲存、AI Provider API Key、VAPID 金鑰

## 4. Installation

```bash
git clone <repo> studynova && cd studynova
npm install
cp .env.example .env      # 填入 DATABASE_URL 與 SESSION_SECRET
npx drizzle-kit push      # 建立資料表
npm run dev               # http://localhost:3000
```

首次呼叫 `/api/health` 會自動執行 **冪等 Seed**（Novi 等級、商店商品、成就、功能額度、單字、句子、示範題庫、AI Provider 設定）。

## 5. Environment Variables

見 `.env.example`。最少需要 `DATABASE_URL` 與 `SESSION_SECRET`；其餘未設定時系統會自動降級並在後台「系統健康」標示為 warning，不會崩潰。

## 6. Database / Migration / Seed

```bash
npx drizzle-kit push       # 直接同步 schema（開發 / 單機）
npx drizzle-kit generate   # 產生 migration 檔（正式環境建議）
npx drizzle-kit migrate    # 套用 migration
```

Seed 由 `src/server/seed.ts` 控制，使用 `platform_settings.seed.version` 做版本管理，**不會覆蓋學生資料，也不會刪除任何生產資料**。

## 7. Admin Setup

1. **第一位註冊的使用者自動成為 `owner`**（不需任何硬編碼帳號）。
2. 或於 `.env` 設定 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，首次啟動時自動建立 owner。
3. Owner 可於 `/admin` → 使用者管理 → 批次操作 → 「設定角色」把其他人升為 `admin`。

## 8. Local Development

```bash
npm run dev        # 開發模式
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build      # 生產建置
npx vitest run     # 單元測試
```

## 9. Docker

```bash
docker compose up -d --build
docker compose exec app npx drizzle-kit push
# http://localhost:3000 （附帶 PostgreSQL / Redis / MinIO）
```

## 10. Production（VPS）

```bash
npm ci && npm run build
NODE_ENV=production node_modules/.bin/next start -p 3000
```
建議搭配 Nginx/Caddy 反向代理與 HTTPS（Session cookie 在 production 會標記 `Secure`）。

## 11. Vercel

1. Import repo，設定所有環境變數。
2. Vercel Postgres / Neon / Supabase 皆可作為 `DATABASE_URL`。
3. 加入 Cron（`vercel.json` 或 Dashboard）：
   `POST /api/v1/system/cron?task=daily_tasks_refresh&uid=$(date)`，並帶 `x-cron-secret`。

## 12. Storage / Redis / AI Provider / Cron / Push

- **Storage**：填入 `S3_*` 即自動切換 S3 driver；否則使用 PostgreSQL bytea。檔案永遠私有，前端只拿得到 15 分鐘有效的簽名 URL。
- **Redis**：填入 `REDIS_URL` 即啟用 BullMQ Adapter，否則使用 PostgreSQL job queue（兩者皆具唯一鍵冪等）。
- **AI**：三層 fallback；400/401/403/404/422/設定錯誤 **不會** 盲目降級；Quota 用盡會持久化冷卻至下個 UTC 月初。
- **Cron**：`POST /api/v1/system/cron?task=<task>&uid=<unique>`，Header `x-cron-secret: $CRON_SECRET`。任務清單見後台 Cron 分頁。
- **Push**：`npx web-push generate-vapid-keys` 產生金鑰填入 `VAPID_*`，學生於「我的 → 安全與通知」開啟。

## 13. Backup / Restore

```bash
DATABASE_URL=... ./scripts/backup.sh backup
DATABASE_URL=... ./scripts/backup.sh restore ./backups/studynova-<stamp>.dump
S3_BUCKET=... S3_ENDPOINT=... ./scripts/backup.sh storage
```
Migration 一律採 additive 策略，禁止直接刪除生產資料表／欄位。

## 14. 文件與支援

| 文件 | 內容 |
| --- | --- |
| [`docs/MANUAL.md`](./docs/MANUAL.md) | 完整使用手冊（學生 / 管理員 / 維運三部分） |
| [`docs/ERROR_CODES.md`](./docs/ERROR_CODES.md) | 全部 90 組錯誤代碼、格式說明與回報流程 |
| `/faq` | 站內常見問題 + 錯誤代碼即時查詢 |
| `/support` | 問題回報（自動帶入錯誤代碼與追蹤編號，可附截圖、可查單號） |
| `/privacy`、`/terms` | 隱私權政策與使用條款（存於資料庫、可版本管理） |

### 錯誤代碼系統

每個錯誤都有專屬代碼 `SN-<類別>-<編號>`，API 統一回傳：

```json
{ "ok": false, "error": { "code": "SN-QUOTA-4001", "message": "…", "hint": "…", "requestId": "REQ-…", "docs": "/faq?code=SN-QUOTA-4001" } }
```

同時附上 `x-studynova-error` 與 `x-request-id` 標頭。未收錄的動態錯誤會由訊息推導出穩定唯一的代碼（例如 `SN-REQ-A1B2`），因此**沒有任何錯誤是沒有代碼的**。

## 15. Testing

- `npx vitest run`：密碼雜湊、NOVA ID 唯一性、題目指紋去重、CSV BOM、日期／週次、趨勢演算法、錯誤遮蔽、AI JSON 解析、每週小考開放規則。
- `/admin/system` → **System Test Center**：對「真實執行中的系統」跑整合測試（DB、Auth、RBAC、Nova 冪等性與餘額保護、額度、每日任務、題庫去重、Storage 往返、Queue/Cron、Push、AI 連線與 Fallback 鏈、每週小考、CSV、Ledger 對帳）。

## 16. Security

- scrypt（N=32768, r=8, p=2）密碼雜湊；登入失敗一律回傳一般化訊息，不透露帳號是否存在
- HttpOnly / SameSite / Secure Cookie、Session 自動輪替、可自行撤銷裝置
- 所有資料以 `userId` ownership 驗證；私人教材、OCR、錄音、AI 對話不會出現在任何公開搜尋
- Drizzle 參數化查詢（無字串拼接 SQL）、zod 全面輸入驗證、輸出錯誤訊息過濾金鑰
- Nova／XP／會員／獎勵／優惠碼／測驗皆使用 Transaction + Idempotency Key + Conditional Update，杜絕重複扣點與重複發獎
- Rate Limit 套用於註冊、登入、密碼重設、AI、OCR、上傳等高風險端點

---

© StudyNova AI — 讓學習更聰明，讓進步看得見。
