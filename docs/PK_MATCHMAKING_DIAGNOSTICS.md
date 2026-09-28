# PK 真人配對故障修復與診斷

## 已確認的 schema mismatch

生產 `/pk/matchmaking/join` 會從 `pk_matchmaking_queue` 讀取排隊資料。舊版 Drizzle schema 把 `joinedAt` 對應到通用 helper 所產生的 `created_at`，但 `drizzle/0073_online_pk.sql` 建立的實際欄位為 `joined_at`。因此，查詢可能因為資料表沒有 `created_at` 而回傳 500。

修正後的 ORM 欄位明確映射為 `joined_at`。另新增 `0085_pk_matchmaking_schema_repair.sql`，可冪等補齊 `joined_at` 與 `question_bank_id`，並建立題庫外鍵及查詢索引，以兼容尚未完成前置 migration 的資料庫。

## 上線步驟

1. 在生產資料庫套用 migration：

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0085_pk_matchmaking_schema_repair.sql
   ```

2. 確認 `pk_matchmaking_queue` 有 `joined_at`、`question_bank_id`，且 `question_bank_id` 外鍵指向 `question_banks.id`。
3. 部署包含 `src/db/schema.ts` 與 PK 前端輪詢修正的應用程式。
4. 以兩個不同真人帳號執行相同模式／學段條件的快速配對；應進入同一場比賽。只有一位使用者時，應留在真人等待狀態，不能被 Bot 塞入。
5. 對含 PK Bot/queue lease 的本次版本，依序套用 `0083_generation_share_reading_bot.sql`、`0084_pk_bot_system_identities.sql`、`0085_pk_matchmaking_schema_repair.sql`、`0086_queue_worker_leases.sql`、`0087_quiz_history_user_fk_repair.sql`；0081 已改為不建立 Bot users 帳號的 no-op。
6. 驗證 `job_queue.started_at` 存在，並確認生產 cron 每分鐘呼叫 `task=queue_drain`；queue lease recovery 只能由已設定的安全 cron drain 觸發。

> 本次 sandbox 沒有生產資料庫連線，因此沒有直接執行 production SQL、部署或修改正式資料；migration 與應用程式需透過正式發布流程套用。

## 錯誤診斷與安全界線

- API 錯誤使用穩定錯誤碼（例如 `SN-PK-9716` 真人配對儲存錯誤、`SN-SYS-9906` schema mismatch）及 `requestId`，前端會同時顯示錯誤訊息、處理提示和追蹤編號。
- API response 不輸出 SQL、bind parameters 或原始 driver exception。
- 系統錯誤日誌只保留經白名單篩選的 PostgreSQL 診斷欄位（例如 SQLSTATE、schema、table、column、constraint），並記錄 route、HTTP method、執行階段和同一個 `requestId`。
- 以錯誤碼和 requestId 到管理員系統日誌查詢根因；回報問題時請提供錯誤碼與 requestId，不要複製使用者個資或資料庫連線字串。

## 真人配對與人機模式

- `/pk/matchmaking/join` 只配對真實使用者；沒找到真人時會維持排隊，不會自動轉為 Bot。
- 真人排隊頁每 5 秒以 fresh overview 查詢配對結果；配對成功後自動開啟賽場。
- Bot 對戰使用獨立的人機對戰入口及 `pk_bot_profiles`，不建立或登入 `users` 帳號。
- 等待畫面提供重新搜尋、取消配對及切換到人機模式的明確操作。
- Migration 0071 的 quiz history FK 必須引用實體主鍵 `users(id)`；0087 會在既有資料庫中保留資料並重建該 FK。

## 測試

- Schema contract test 確認 queue 欄位包含 `joined_at`、不含 `created_at`。
- Database diagnostics test 確認會抽取安全的 PostgreSQL 診斷資訊，並分類 schema mismatch／暫時性資料庫連線錯誤。
- API error test 確認使用者可看到錯誤碼、提示與 requestId。
- 全專案 TypeScript、Vitest 與變更檔案 ESLint 應在 CI／部署前執行。
