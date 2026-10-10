# StudyNova 段考衝刺中心完整改版計畫

## 0. 目前狀態與本次修正

使用者提供的 `pasted_content_3.txt` 共 1,530 行，內容涵蓋：

- 舊版段考專區盤點與替換
- 段考衝刺活動與開放狀態
- PDF／圖片考卷上傳與 OCR／AI 題目匯入
- 題目邊界分析與圖例裁切
- 答案、詳解與人工審核
- 學生端段考刷題與學習紀錄
- 情境式 AI 助教
- 好友挑戰與既有 PK 整合
- 化學式與數學公式渲染
- 章節及詳細單元重點圖
- 後台管理、資料庫、安全性、效能及完整驗收

先前已完成的挑戰答題 UI 改版只涵蓋其中「一般挑戰答題介面」的一小部分，不能視為整份需求完成。

## 1. 目前專案盤點

### 已存在、可沿用的能力

- `src/db/schema.ts`
  - `question_banks`
  - `questions`
  - `question_versions`
  - `question_sources`
  - `question_bank_memberships`
  - `question_import_jobs`
  - `question_analysis_jobs`
  - `question_analysis_batches`
  - `quizzes`
  - `quiz_attempts`
  - `answers`
  - `wrong_questions`
  - 舊版 `exam_hubs`、`exam_hub_words`、`exam_hub_attempts`、`exam_hub_usage_logs`
  - `study_materials`、`study_material_pages`
- `src/server/question-import.ts`
  - JSON 題目標準化
  - 題型推斷
  - 題目去重 fingerprint
  - 題目欄位驗證
  - 缺答案、缺解析、選項不一致的警告
- `src/server/pdf-question-extract.ts`
  - PDF.js 文字層擷取
  - 頁碼分段
  - 常見單選題與選項解析
  - PDF 頁面轉 PNG
- `src/server/queue.ts` 與 AI background job
  - 已有背景工作與批次處理基礎
  - 可沿用於考卷分析與圖解生成
- `src/server/routes/exam-hub-routes.ts`
  - 舊版段考單字／題庫 API
  - 題庫查詢、限時開始、作答與管理員查詢
- `src/server/routes/pk-routes.ts`
  - 已完成的真人配對、Rating、房間、好友、Bot、SSE 與伺服器計分架構
- `src/server/math-markup.ts`
  - 目前主要是將 LaTeX 轉成可讀純文字，並非完整的共用公式 renderer
- `src/server/routes/visual-routes.ts`
  - 目前只有單一 `visual-notes/generate` AI 背景工作入口，尚未有教材章節／單元圖解管理
- `src/app/(app)/exam-hubs/*`
  - 舊版段考中心，主要是依學校／年級顯示單字及既有題庫
- `src/app/admin/exam-hubs/page.tsx`
  - 舊版後台段考管理
- `src/app/(app)/challenge/page.tsx`
  - 現有字彙挑戰、好友挑戰、活動挑戰與答題 runner
  - 本次已加入參考圖風格的進度列、選項選取與「檢查答案」流程

### 目前不足或不能直接宣稱已完成的部分

1. 沒有 `/exam-prep` 新版段考衝刺中心及獨立活動模型。
2. 舊版 `exam_hubs` 不是需求中的完整活動狀態機。
3. 沒有考卷匯入的頁面、OCR 區塊、題目草稿、圖片資產、裁切座標與版本審核流程。
4. PDF parser 目前偏向有文字層的選擇題，未完整處理掃描版、跨頁題、圖表、表格、申論及複合題。
5. 題目資料雖支援多種 type 字串，但學生端沒有完整統一的段考刷題 runner。
6. 沒有正式的段考 attempt／answer／模式規則，涵蓋一般練習、模擬考、錯題、章節、隨機、好友及 PK。
7. 沒有依當前題目、答案、模式與已給提示建立上下文的段考 AI 助教。
8. 既有 PK 可整合，但段考好友挑戰尚未有固定題組、邀請生命週期及活動關聯。
9. 沒有 KaTeX／MathJax 形式的全站共用公式 renderer。
10. 沒有每章節及每詳細單元的圖解清單、版本、生成任務、審核和發布狀態。
11. 尚未完成文件要求的完整 migration、API、E2E、權限、手機版與部署驗收。

## 2. 不會直接刪除的既有功能

- 不直接 DROP 共用 `question_banks`、`questions`、使用者、學習紀錄、Nova、XP、PK、好友或 AI 表。
- 舊版 `/exam-hubs` 先保留資料與相容讀取，學生入口逐步轉到 `/exam-prep`。
- 舊版管理頁先改成導向或封存提示，確認沒有相依後才移除專屬 UI/API。
- 題庫、PK 與一般 AI 題目不與新的段考活動混成同一個 scope。

## 3. 分階段實作計畫

### Phase 1：活動與資料架構

目標：先建立新活動模型，不破壞舊版資料。

- 建立段考活動、活動科目／範圍、題組關聯與發布狀態。
- 狀態：`draft`、`analyzing`、`pending_review`、`scheduled`、`open`、`closed`、`archived`。
- 支援手動開放、Asia/Taipei 預約開放與預約關閉。
- 所有 API 以資料庫時間檢查活動資格，不能只依賴前端 timer。
- 建立活動與題庫的獨立 scope，不把題目混入 global 題庫。
- 建立管理員活動 CRUD、手動開／關／封存及狀態轉換 API。
- 新增學生端 `/exam-prep`，舊版入口保留相容導向。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_exam_prep_core.sql`
- `src/server/routes/exam-prep-routes.ts`
- `src/app/(app)/exam-prep/page.tsx`
- `src/app/(app)/exam-prep/[id]/page.tsx`
- `src/app/admin/exam-prep/page.tsx`
- `src/app/admin/layout.tsx`
- `src/server/router.ts`

### Phase 2：考卷上傳、OCR、題目草稿與圖例資產

目標：管理員只需上傳考卷，系統產生可審核的草稿，不直接發布。

- 驗證 PDF、JPG、JPEG、PNG、WEBP、DOCX 等支援格式。
- 限制大小、頁數、圖片數、併發數及處理時間。
- 建立匯入工作、頁面、OCR 區塊、題目草稿、圖片資產與題目版本。
- 文字型 PDF 使用 PDF.js；掃描版使用頁面 render 加 OCR。
- 保留原始檔案、原始頁碼、文字座標、裁切座標、版本與來源。
- 先建立整份文件版面結構，再以題號、選項、跨頁關係切題。
- 圖片先用 PDF 座標／OCR 區域裁切，不用生成式 AI 重畫原圖。
- 解析進度：上傳、OCR、題號、圖表、題目分析、答案詳解、待審核。
- 每個低信心項目標記待人工確認。
- 使用 idempotency key 防止重複匯入。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_exam_question_import.sql`
- `src/server/question-import.ts`
- `src/server/pdf-question-extract.ts`
- `src/server/exam-question-import.ts`
- `src/server/routes/exam-question-import-routes.ts`
- `src/app/admin/exam-prep/import/page.tsx`
- `src/app/admin/exam-prep/import/[id]/page.tsx`
- `src/app/api/blob/question-bank-upload/route.ts`
- `src/server/storage.ts`

### Phase 3：AI 分析、答案驗證與管理員雙欄審核

目標：AI 產生結構化題目，但管理員確認後才正式進題庫。

- 自動辨識科目、年級、章節、單元、題型、選項、答案、配分、難度與知識點。
- 各科使用不同解題提示：數學、化學、英文、國文、社會與圖表題分流。
- 缺解析時產生逐步解析，但保留 `pending_review`。
- 進行答案與選項一致性、公式／單位、圖表標籤及第二輪一致性檢查。
- 不確定、模糊、答案歧義的題目不能自動發布。
- 雙欄審核：左側原始頁面／裁切區域，右側 AI 結構化內容。
- 支援修改、重裁切、重分析、刪除、忽略警告、批次確認、部分匯入。
- 匯入正式題目時建立 question version、source、asset 關聯與操作 log。

預計檔案：

- `src/server/exam-question-analysis.ts`
- `src/server/question-analysis.ts`
- `src/server/routes/exam-question-import-routes.ts`
- `src/app/admin/exam-prep/review/[id]/page.tsx`
- `src/app/admin/question-banks/page.tsx`
- `src/db/schema.ts`

### Phase 4：學生端刷題與真實學習紀錄

目標：建立真正可用、模式不同且可追蹤的段考刷題系統。

- 支援單選、多選、是非、填充、計算、申論、圖表、圖片與化學式題目。
- 一般練習：作答後看解析。
- 模擬考：交卷後才看答案。
- 錯題複習：只抽自己的錯題。
- 章節練習：依活動章節篩選。
- 隨機挑戰：活動題庫隨機抽題。
- 好友挑戰與 PK：轉交既有伺服器權威 PK。
- 記錄 user、activity、question、response、correct、time、error type、explanation viewed、AI asked、mode、date。
- 伺服器驗證活動時間、題目發布狀態、作答次數與交卷狀態。
- 不把練習正確率、模擬考分數、好友結果、真人 Rating、AI 戰績混在一起。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_exam_attempts.sql`
- `src/server/routes/exam-prep-routes.ts`
- `src/app/(app)/exam-prep/[id]/practice/page.tsx`
- `src/app/(app)/exam-prep/[id]/result/page.tsx`
- `src/components/learning/QuestionRenderer.tsx`
- `src/components/learning/ExamPracticeRunner.tsx`

### Phase 5：情境式 AI 助教

目標：AI 只根據目前題目及當前模式協助，不在模擬考或 PK 洩漏答案。

- 手機使用底部抽屜，桌面使用側欄。
- 上下文只含當前題目、科目、年級、章節、難度、學生作答、已給提示與模式。
- 一般練習可顯示提示、步驟、解析。
- 模擬考只給概念提示，交卷後才可顯示答案。
- PK 不透露正解。
- 分四層提示：觀念、公式、代入、推導。
- 支援逾時、限額、重試、fallback model、token log、idempotency 與防重複扣費。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_exam_ai_tutor.sql`
- `src/server/routes/exam-ai-tutor-routes.ts`
- `src/server/exam-ai-tutor.ts`
- `src/app/(app)/exam-prep/[id]/practice/page.tsx`
- 現有 `src/server/ai.ts`、quota、conversation 架構

### Phase 6：好友挑戰與 PK 整合

目標：不另做假對手或第二套 PK。

- 活動固定題組與相同選項。
- 邀請、接受、拒絕、取消、過期、開始、完成狀態。
- 私人挑戰不可只靠猜 URL 加入。
- 真人快速配對、好友邀請、房間代碼、私人房間、Bot 沿用既有 PK。
- 題目、配分、時間、伺服器計分與結果同步由後端負責。
- 斷線重連、重複答案與重複結算測試。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_exam_friend_challenges.sql`
- `src/server/routes/pk-routes.ts`
- `src/server/pk-realtime.ts`
- `src/app/(app)/online-pk/page.tsx`
- `src/app/(app)/exam-prep/[id]/challenge/page.tsx`

### Phase 7：全站公式與化學式 renderer

目標：不再用純文字替換掩蓋問題。

- 盤點 AI、Markdown、OCR、JSON、PDF、手機換行及輸出流程。
- 建立共用 `MathFormula`／`RichContent` renderer。
- 支援行內／區塊公式、分數、根號、上下標、希臘字母、箭頭、反應條件、多行公式與手機水平捲動。
- 化學式與電荷使用安全且可控的表示方式。
- 測試 H₂O、SO₄²⁻、¹⁴₆C、反應式、平均原子量及長公式。
- 匯出 PDF 使用相同內容模型，不把原始 LaTeX 直接當一般文字。

預計檔案：

- `src/components/content/RichContent.tsx`
- `src/components/content/MathFormula.tsx`
- `src/server/math-markup.ts`
- `src/server/markdown.ts`（若存在）
- 全部學習、題目、解析、AI、PK 顯示點
- `package.json`（僅在缺少相容 renderer 時增加依賴）

### Phase 8：章節與詳細單元重點圖

目標：每個章節一張總覽圖，每個詳細單元一張獨立圖，不使用假完成資料。

- 掃描 `learningCurriculum` 與資料庫教材，建立章節／單元清單。
- 每章節與每單元建立 visual record、版本與 generation job。
- AI 只產生結構化重點；HTML/CSS/SVG 負責精確文字、公式與圖表排版。
- 支援背景佇列、批次、暫停、繼續、重試、取消與 idempotency。
- 產生網頁版、高解析圖片與 PDF。
- 產生後做文字、公式、裁切與檔案存在性驗證，未驗證不能標示完成。
- 後台提供篩選、預覽、修改、重新渲染、下載、發布與取消發布。

預計檔案：

- `src/db/schema.ts`
- `drizzle/xxxx_learning_visuals.sql`
- `src/server/routes/visual-routes.ts`
- `src/server/learning-visuals.ts`
- `src/app/admin/learning-visuals/page.tsx`
- `src/app/(app)/learning/[subject]/[chapter]/[lesson]/page.tsx`
- `src/components/learning/LearningVisual.tsx`
- `src/components/learning/visual-renderer.tsx`

### Phase 9：測試、migration、效能與部署

- TypeScript、ESLint、Production build。
- Migration dry run 與 PostgreSQL constraints／index／transaction 檢查。
- OCR：文字 PDF、掃描 PDF、照片、表格、化學式、圖例、跨頁及模糊圖。
- AI：題目切分、答案驗證、解析、低信心警告、重試與限額。
- 匯入：單題、多題、部分匯入、重複匯入、防中斷與恢復。
- 活動：手動開放、預約開放、自動關閉、提前關閉與越權防護。
- AI 助教：題目上下文、模式規則、錯誤、限額與防重送。
- 好友／PK：完整邀請生命週期、相同題目、即時同步、斷線與重複結算。
- 公式：上下標、電荷、同位素、反應式、長公式與手機版。
- 圖解：章節／單元完整數量、文字、公式、PDF、重試。
- Playwright 或既有測試工具若已配置則優先沿用。

## 4. 重要安全與資料原則

- 管理員權限由後端驗證，不能只靠隱藏按鈕。
- 學生只能看已發布題目與活動。
- 活動時間在 API 再驗證一次。
- 外校考卷保留來源與發布權確認，不自動公開。
- 上傳檔案驗證類型、大小、頁數與內容，不執行任意 HTML／程式碼。
- 正式題目與圖解保留來源、版本、狀態、操作者及時間。
- 所有建立、匯入、結算與 AI 請求使用 idempotency 或 unique constraint。
- 不使用假進度、假分析、假圖解或前端假對手充當已完成功能。

## 5. 預計交付方式

每個 Phase 分開提交與驗證：

1. 先完成 Phase 1 並 migration／API／入口驗證。
2. 再完成 Phase 2–3 的考卷匯入與審核。
3. 再完成 Phase 4–6 的學生刷題、AI 助教與 PK。
4. 再完成 Phase 7–8 的公式與圖解。
5. 最後執行 Phase 9 全面驗收。

每階段都會列出：

- 真正修改的檔案。
- 新增的 migration。
- 新增的 API。
- 已執行的測試指令與結果。
- 尚未完成及需人工確認的項目。
- Git commit 與部署狀態。

在使用者確認計畫前，不開始刪除舊版段考資料或進行破壞性 migration。
