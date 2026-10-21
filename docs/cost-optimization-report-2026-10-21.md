# StudyNova 資料庫與後端營運成本最佳化報告

日期：2026-10-21

## 執行範圍

本輪先針對能從 repository 直接確認、且不需要改變資料表結構的低風險項目進行最佳化。沒有刪除使用者資料、沒有修改 Neon schema、沒有調整額度政策，也沒有假設目前 Neon 方案的實際計費結果。

## 已確認並已完成的修改

### 1. 降低 AppShell 全站同步頻率

**原問題**：`src/components/AppShell.tsx` 原本每 10 秒派送 `studynova:sync`。`useApi` 元件會監聽這個事件，因此同一頁面所有已掛載 API 都可能被一起重新讀取，造成重複的 Serverless 請求、資料庫喚醒、查詢與網路傳輸。

**修改**：

- 改為每 60 秒同步一次。
- 頁面在背景不可見時不派送同步事件。
- 保留使用者主動操作、頁面切換及既有 reload 機制，不影響手動更新。

**影響計費項目**：Vercel Functions invocation、Neon Compute、SQL 次數、資料庫網路傳輸。

### 2. 降低全站 presence 查詢與 heartbeat 頻率

**原問題**：AppShell 的在線摘要每 30 秒查詢一次；登入後 presence heartbeat 也每 30 秒寫入一次。這是全站級別的持續資料庫流量，即使使用者只是停留在一般頁面也會發生。

**修改**：

- presence summary：30 秒改為 120 秒，且只在頁面可見時查詢。
- presence heartbeat：30 秒改為 120 秒。
- 頁面切回可見狀態時仍會立即觸發 heartbeat；原本的 10 秒防抖仍保留。

**影響計費項目**：Neon Compute、資料庫寫入次數、Vercel Functions invocation、網路傳輸。

**注意**：PK 實際房間頁面的即時輪詢沒有在本輪更動，避免降低對戰體驗。這次只降低全站外殼的 presence 流量。

### 3. 移除句子 API 的資料庫隨機排序

**原問題**：`src/server/routes/quiz-routes.ts` 的 `/sentences` 查詢使用 `ORDER BY random() LIMIT 40`。PostgreSQL 通常需要先計算並排序大量候選資料，資料量增加後會消耗額外 CPU 與延遲。

**修改**：改為依熟悉度後以 `s.id` 穩定排序，再取 40 筆。仍優先顯示較不熟悉的句子，但不再對整張表執行隨機排序。

**影響計費項目**：Neon Compute、SQL latency、Serverless 執行時間。

**產品行為差異**：句子清單不再每次請求隨機變化；若日後需要輪替，可用分頁游標、每日 seed 或 indexed hash 實作，而不是恢復全表 `random()`。

### 4. 以資料庫內 EXISTS 取代整批解鎖 ID 傳回應用程式

**原問題**：`src/server/routes/learning-routes.ts` 的 `/words/all` 原本先查出該使用者全部已解鎖的單字 ID，放入 Node.js 記憶體，再用大型 `IN (...)` 查詢單字。使用者解鎖資料越多，Serverless 記憶體、網路傳輸與 SQL 參數大小越高。

**修改**：

- `unlockedCount` 改由資料庫 `count(distinct ...)` 計算。
- 單字清單改用 `EXISTS` 子查詢在資料庫內過濾。
- 沒有改變解鎖條件或回傳欄位。

**影響計費項目**：Vercel 記憶體與執行時間、Neon Compute、網路傳輸、SQL 查詢參數大小。

## 驗證結果

- `git diff --check`：通過。
- TypeScript：`./node_modules/.bin/tsc --noEmit` 通過。
- Next.js production build：通過，所有既有路由完成編譯。
- Vitest：40 個測試檔、173 個測試中 170 通過；3 個失敗集中在既有 `ai-solution` 額度預設值測試，實際差異是測試期待 PRO 上限 30／50，但目前程式預設為 15／25。這些失敗與本輪修改的三個檔案無關，沒有為了本輪成本工作修改它們。
- ESLint：本輪沒有新增錯誤；全專案既有 3 個 error 與 30 個 warning，錯誤位於既有的 PK 倒數與 vocabulary overview effect，不在本輪修改範圍。

## 已確認但本輪未修改的成本來源

1. PK、Exam PK、Challenge 等實際作答頁有 1.2～2.5 秒或 15 秒級別的輪詢／heartbeat。這些屬於即時功能，需以使用者是否在活動房間、頁面可見性、房間狀態與服務端 push 能力一起評估，不能直接全站關閉。
2. 部分 PK 與 Challenge 建題查詢仍使用 `ORDER BY random()`。它們是建題抽樣路徑，可能在大型題庫消耗 Compute，但需要先確認公平性、題目去重與同一場比賽的 deterministic seed，未在本輪直接改動。
3. `words/all` 仍允許最多 7000 筆；本輪只移除解鎖 ID 的記憶體與傳輸浪費，沒有直接把上限砍低，以免破壞字詞百科瀏覽與既有挑戰功能。下一步可做真正的搜尋／游標分頁。
4. `/sentences` 的新穩定排序若需要 index，應以 Neon `EXPLAIN (ANALYZE, BUFFERS)` 實測後再決定，未擅自新增索引。

## 需要 Neon／部署平台實際用量才能判斷的項目

以下資料在目前 repository 與可取得的本地設定中無法安全推導，因此沒有捏造節省百分比：

- Neon 實際方案、Compute 使用時間、CU-hours、資料傳輸、儲存與分支儲存。
- Neon Auto-suspend 閒置時間與是否真的因 health check／監控被喚醒。
- Neon 各資料表與索引實際大小、dead tuples、vacuum 狀態與 table bloat。
- Vercel Production Functions invocation、執行時間、記憶體、流量、Cron 與 log 用量。
- AI provider 實際 token、OCR 次數、圖片儲存與下載量。
- S3／R2／Vercel Blob 的實際儲存及 egress 費用。

## 建議的下一階段（尚未執行）

1. 在 Neon production 以唯讀方式收集 `pg_stat_statements`、慢查詢、表格／索引大小與 vacuum 狀態，先依實際累積時間排序。
2. 在 Vercel Production Analytics 對照部署前後 24 小時的 Functions invocation、執行時間與 bandwidth；本報告沒有把理論下降當成實測節省。
3. 為 `/words/all` 與 `/my-vocabulary` 增加搜尋與游標分頁，讓前端不必一次載入整個字庫。
4. 對 PK／Challenge 抽樣採用「先以 indexed candidate 篩選，再在有限候選集內抽樣」的方式，並建立公平性測試後再替換 `random()`。
5. 對 AI/OCR 建立內容 fingerprint、冪等任務鍵與結果快取，並確認不會跨使用者洩漏私人內容。
6. 檢查 Cron 與健康檢查是否真的必要；不要新增預熱 Ping，避免為了維持連線反而阻止 Neon suspend。

## 需要管理員手動提供或確認的設定

- Neon Console：目前方案、Auto-suspend、Compute／storage／transfer 用量、慢查詢與 table size。
- Vercel：Production 部署版本、Functions／Cron／Bandwidth／Logs 用量。
- AI 與檔案服務：各 provider 的使用量與計費報表。

本輪沒有直接更改以上平台設定，也沒有執行刪除歷史資料或壓縮使用者檔案的不可逆操作。
