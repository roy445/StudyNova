# StudyNova 部署設定清單

## 一、結論

StudyNova 的前端與後端 API 已內建於 Next.js，不需要另外新增一組獨立的 REST API 伺服器。你的部署方案使用 Neon 作為遠端 PostgreSQL；不需要在 Windows 或部署平台上另外執行本機 PostgreSQL。Redis、S3 相容物件儲存、AI Provider、Web Push 與 SMTP 都是依功能選用的外部服務。

## 二、API 與外部服務

### 1. 應用程式內建 API

| 入口 | 用途 | 是否需要額外服務 |
|---|---|---|
| `/api/v1/[...path]` | 所有 REST API 的主要分派入口，包含 auth、dashboard、grades、study、AI、OCR、quiz、social、economy、weekly、admin、support、system | 不需要，隨 Next.js app 一起部署 |
| `/api/files/[id]` | 私有檔案存取與簽名 URL | 不需要；未設定 S3 時使用 PostgreSQL bytea |
| `/api/health` | Healthcheck、首次 seed 與系統初始化 | 需要 PostgreSQL |

前端 API client 會將例如 `/dashboard`、`/ai/quick`、`/notifications` 等路徑送到 `/api/v1/dashboard`、`/api/v1/ai/quick`、`/api/v1/notifications`。

### 2. AI Provider API

AI 服務依序使用 Gemini → OpenAI → OpenRouter fallback。至少設定一個 Provider 才能使用 Novi、AI 分析、OCR 轉換、AI 出題、錯題提示與語音分析等功能；未設定時平台仍可啟動，但 AI 功能會顯示未設定或不可用。

| Provider | 環境變數 | 預設模型 | 建議用途 |
|---|---|---|---|
| Google Gemini | `GOOGLE_GEMINI_API_KEY` | `gemini-2.5-flash` | 建議作為第一順位 |
| OpenAI | `OPENAI_API_KEY` | `gpt-4.1-mini` | 第二順位或替代 Provider |
| OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | 第三順位 fallback |

可用 `GEMINI_MODEL`、`OPENAI_MODEL`、`OPENROUTER_MODEL` 覆寫模型。程式也相容 `GEMINI_API_KEY` 作為 Gemini key 的舊名稱，但建議統一使用 `GOOGLE_GEMINI_API_KEY`。

### 3. Web Push VAPID

若要讓學生啟用瀏覽器通知，需要產生 VAPID 金鑰，並設定 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 與 `VAPID_SUBJECT`。未設定時站內通知仍可使用，只有 Web Push 會停用。

產生金鑰：

```bash
npx web-push generate-vapid-keys
```

### 4. Cron / 排程 API

系統提供：

```text
POST /api/v1/system/cron?task=<task>&uid=<unique-id>
Header: x-cron-secret: <CRON_SECRET>
```

需要在外部排程器設定呼叫，例如 GitHub Actions、Vercel Cron、Cloud Scheduler、crontab 或 VPS systemd timer。`CRON_SECRET` 必須與外部排程器使用的 secret 相同。實際任務清單可在管理後台 Cron 分頁查看。

## 三、環境變數

### 必填

| 變數 | 說明 | 範例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 連線字串；啟動時必須存在 | `postgresql://user:password@host:5432/studynova` |
| `SESSION_SECRET` | HttpOnly session、簽名與部分私有資源所需的長隨機密鑰 | `openssl rand -base64 48` |
| `APP_URL` | 公開網站 URL；AI provider referer、重設密碼與分享連結使用 | `https://studynova.example.com` |
| `NODE_ENV` | 正式環境設為 `production` | `production` |

### AI（至少一組，建議設定兩組以上）

| 變數 | 必填性 | 說明 |
|---|---|---|
| `GOOGLE_GEMINI_API_KEY` | AI 功能需要 | Gemini API key |
| `GEMINI_MODEL` | 選填 | 預設 `gemini-2.5-flash` |
| `OPENAI_API_KEY` | fallback 選填 | OpenAI API key |
| `OPENAI_MODEL` | 選填 | 預設 `gpt-4.1-mini` |
| `OPENROUTER_API_KEY` | fallback 選填 | OpenRouter API key |
| `OPENROUTER_MODEL` | 選填 | 預設 `meta-llama/llama-3.3-70b-instruct:free` |

### Queue / Cache

| 變數 | 必填性 | 說明 |
|---|---|---|
| `REDIS_URL` | 選填 | 設定後使用 Redis + BullMQ；未設定時自動使用 PostgreSQL queue adapter |

正式環境若有較多背景工作、OCR、AI 與週期任務，建議設定 Redis，例如 `redis://:password@host:6379/0`。

### Object Storage

| 變數 | 必填性 | 說明 |
|---|---|---|
| `S3_ENDPOINT` | S3/R2/MinIO 時需要 | S3 相容 endpoint；AWS S3 可留空 |
| `S3_REGION` | 選填 | 預設 `auto`；AWS 通常填 `ap-northeast-1` 等區域 |
| `S3_BUCKET` | 使用 S3 時需要 | 私有 bucket 名稱 |
| `S3_ACCESS_KEY_ID` | 使用 S3 時需要 | access key |
| `S3_SECRET_ACCESS_KEY` | 使用 S3 時需要 | secret key |
| `S3_FORCE_PATH_STYLE` | 選填 | 預設以 `true` 或存在 endpoint 時啟用 |
| `MAX_UPLOAD_BYTES` | 選填 | 預設 15 MiB，值為 bytes；目前範例為 `15728640` |

未設定完整 S3 組合時，檔案會改存 PostgreSQL 的 `storage_objects.data` bytea 欄位。開發環境可接受；正式環境建議使用 S3、Cloudflare R2、MinIO 或其他 S3 相容服務，避免資料庫膨脹。

### Web Push

| 變數 | 必填性 | 範例 |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Web Push 需要 | 由 `web-push generate-vapid-keys` 產生 |
| `VAPID_PRIVATE_KEY` | Web Push 需要 | 由 `web-push generate-vapid-keys` 產生 |
| `VAPID_SUBJECT` | 選填 | `mailto:admin@studynova.ai` |

### 管理員與密碼重設

| 變數 | 必填性 | 說明 |
|---|---|---|
| `ADMIN_EMAIL` | 選填 | 首次 seed 時建立 owner |
| `ADMIN_PASSWORD` | 使用 bootstrap owner 時需要 | 首次 seed 時設定密碼；不要使用預設弱密碼 |
| `ADMIN_NAME` | 選填 | 預設 `StudyNova Owner` |
| `SMTP_URL` | 密碼重設寄信需要 | 設定後忘記密碼 API 不會直接回傳 reset link，而是交由 SMTP 寄送 |

如果沒有 SMTP，忘記密碼流程在開發或低風險部署情境可回傳 reset link；正式環境建議設定 SMTP，避免敏感連結出現在 API response 或 log。

### Cron

| 變數 | 必填性 | 說明 |
|---|---|---|
| `CRON_SECRET` | 使用外部排程時需要；正式環境建議必填 | 驗證 `/api/v1/system/cron` 的 header secret |

## 四、資料庫

### 必要服務

- **PostgreSQL 14 以上**；Docker Compose 使用 PostgreSQL 16 Alpine。
- Drizzle ORM 連線透過 `DATABASE_URL` 建立 connection pool。
- 必須先執行 schema 同步，再啟動正式服務。

開發／單機：

```bash
npx drizzle-kit push
```

正式環境建議：

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

首次呼叫 `/api/health` 會執行冪等 seed。Seed 使用 `platform_settings.seed.version` 管理版本，不會覆蓋學生資料或刪除生產資料。

### 主要資料域

目前 schema 約 80 張 PostgreSQL table，涵蓋：

| 資料域 | 代表資料表 |
|---|---|
| 帳號與安全 | `users`、`sessions`、`password_reset_tokens`、`user_settings`、`rate_limits` |
| 成績與學習 | `grades`、`grade_records`、`exams`、`study_plans`、`study_records`、`focus_sessions`、`tasks` |
| 教材與檔案 | `storage_objects`、`study_materials`、`study_material_pages`、`notes` |
| OCR 與語音 | `ocr_documents`、`ocr_pages`、`voice_records`、`voice_transcripts`、`voice_analysis` |
| 測驗與錯題 | `questions`、`quizzes`、`quiz_attempts`、`answers`、`wrong_questions` |
| 單字與句子 | `daily_words`、`word_progress`、`sentences`、`sentence_progress` |
| 社交 | `friends`、`friend_requests`、`challenges`、`groups`、`group_members`、`shares` |
| Novi 與點數 | `assistant_profiles`、`assistant_items`、`assistant_inventory`、`nova_accounts`、`nova_transactions`、`xp_transactions` |
| 每週小考 | `weekly_exam_weeks`、`weekly_exam_files`、`weekly_exam_questions`、`weekly_exam_attempts`、`weekly_exam_results` |
| 後台與維運 | `platform_settings`、`feature_permissions`、`feature_usage`、`admin_logs`、`system_logs`、`job_queue` |
| 通知與推播 | `notifications`、`push_subscriptions` |

## 五、Neon + 部署平台配置

從 Neon Console 複製連線字串，建議使用 Pooled connection string，並保留 Neon 提供的 `sslmode=require`。不要把實際連線字串提交到 GitHub。

```env
DATABASE_URL=postgresql://<neon-user>:<password>@<neon-host>/<database>?sslmode=require
SESSION_SECRET=<用 PowerShell 產生的長隨機密鑰>
APP_URL=https://你的正式網域
NODE_ENV=production
```

如果只是從 Windows 連到 Neon 執行 migration，PowerShell 可直接設定當次指令的環境變數：

```powershell
$env:DATABASE_URL = "postgresql://<neon-user>:<password>@<neon-host>/<database>?sslmode=require"
npx drizzle-kit push
```

若使用 Vercel、Render、Railway 或其他部署平台，請在該平台的 Environment Variables 設定 `DATABASE_URL`，不需要在 Windows 常駐設定它。

## 六、建議正式環境配置

```env
DATABASE_URL=postgresql://studynova:<strong-password>@<private-db-host>:5432/studynova?sslmode=require
SESSION_SECRET=<long-random-secret>
APP_URL=https://studynova.example.com
NODE_ENV=production

GOOGLE_GEMINI_API_KEY=<gemini-key>
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=<openai-key>
OPENAI_MODEL=gpt-4.1-mini
OPENROUTER_API_KEY=<openrouter-key>
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

REDIS_URL=redis://:<redis-password>@<redis-host>:6379/0

S3_ENDPOINT=https://<s3-compatible-endpoint>
S3_REGION=auto
S3_BUCKET=studynova-private
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_FORCE_PATH_STYLE=false
MAX_UPLOAD_BYTES=15728640

VAPID_PUBLIC_KEY=<vapid-public-key>
VAPID_PRIVATE_KEY=<vapid-private-key>
VAPID_SUBJECT=mailto:admin@studynova.example.com

CRON_SECRET=<cron-secret>
SMTP_URL=smtps://user:password@smtp.example.com:465
```

## 七、可選的 Docker Compose 方案

你目前使用 Neon，**不需要啟動 Docker Compose 的 `db` 服務**。若只部署到 Vercel 或其他雲端平台，也不需要本機 Redis、MinIO 或 PostgreSQL。原始 Compose 仍可供日後完全離線開發使用，執行 `docker compose up -d --build` 會提供：

| Service | 預設位置 | 用途 |
|---|---|---|
| `db` | `postgresql://postgres:postgres@db:5432/studynova` | PostgreSQL 16 |
| `redis` | `redis://redis:6379` | Redis 7 + BullMQ |
| `minio` | `http://localhost:9000`、Console `http://localhost:9001` | S3 相容物件儲存 |
| `app` | `http://localhost:3000` | StudyNova Next.js app |

如果採用 Neon 部署，Compose 中的 `db`、`redis`、`minio` 都可以不啟動；只需把 `DATABASE_URL` 指向 Neon。若未設定 `REDIS_URL`，StudyNova 會使用 PostgreSQL queue adapter。若未設定 S3 組合，檔案會暫存於 Neon PostgreSQL 的 bytea 欄位，正式環境仍建議另接 R2 或其他 S3 相容儲存。
