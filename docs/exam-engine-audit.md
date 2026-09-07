# StudyNova AI Exam Engine：Phase 1 現況盤點

## 既有可保留功能

StudyNova 已有可直接擴充的題目與測驗核心：`questions` 題目表、`quizzes` 測驗表、`quiz_attempts` 作答紀錄、`answers` 答案表，以及 `wrong_questions` 錯題本。題目目前已包含 subject、topic、level、difficulty、type、stem、options、answer、explanation、metadata、fingerprint，並以 fingerprint unique index 做基本重複檢查。`quizzes` 已有 timeLimitSec、questionIds、visibility 與 shareSlug；作答紀錄已有 score、total、correctCount、durationSec、submittedAt。

現有 `questionImportJobs` 支援管理員題庫匯入工作與 preview，並保存來源、題庫、處理數量、重複數量與錯誤訊息。`studyMaterials`、OCR 文件與 AI 路由可作為教材分析及 AI 出題的輸入來源。`gradeRecords` 可保留為歷史成績與 AI 成績分析的資料來源，不應重建。

現有 `ai-routes.ts` 已有 Novi 對話、context 授權、AI provider fallback/quota/cost 流程；`economy` 已提供 Nova ledger 與 feature consumption，AI 題目生成、驗證與考後分析應沿用，不新增第二套點數或 API key。現有 admin routes、admin layout、weekly admin 與 challenge admin 可作為考試管理後台版型與權限檢查基礎。

## 需要修改的既有部分

`questions` 目前缺少明確的公開狀態、版本鏈、知識點關聯、驗證結果與建立者狀態欄位；部分資料可先放進既有 metadata，但正式的 Question Validator、版本快照與審核流程需要新增資料表或 migration。題目 type 目前已有 single、multiple、fill、truefalse、short、reading，後續需補齊計算題、圖表題等語意層級，不應破壞既有 type 值。

`quizzes` 目前偏向個人測驗與題目 ID 集合，尚未具備正式 Mock Exam 的開始／結束時間、及格分數、題目與選項隨機規則、是否可返回、公布答案規則、重考規則與題目 snapshot。這些應透過新增正式考試資料模型整合，而非任意改寫既有 quiz 行為。

現有 AI 題目生成與 question import 已可重用，但需要補上 Pipeline：範圍分析、Knowledge Points、生成、驗證、duplicate detection、答案／難度檢查、人工審核、發布。正式考試進行中必須限制 Novi 讀取考題 context，也不能使用 AI 解題。

## 需要新增的能力

第一階段後應以小步驟新增 Question Validator、question version／fingerprint／generation job／validation result、exam／exam template／exam question snapshot／exam attempt／exam answer／exam result／exam analysis、review queue 與 oral exam session 等資料模型。正式考試必須保存題目 snapshot，確保管理員修改題庫後歷史成績不變。

前端應分成 Practice、Quiz、Mock Exam、AI Oral Exam 四個清楚流程。Mock Exam 需要倒數、答題卡、已作答與未作答統計、標記題目、上一題／下一題、交卷與自動交卷；網路中斷時先使用 localStorage 暫存，重新連線再同步，最終以 server 成績為準。

Admin 後台預計需要 Exams 導航與 Dashboard、Question Bank、AI Question Generator、Exam Builder、Exam Templates、Mock Exams、Oral Exams、Exam Results、Question Analytics、AI Analysis、Review Queue、Settings 等分區。所有權限必須在 backend 驗證，學生只能讀取自己的考試、答案、成績、錯題與口試紀錄。

## 重複與禁止事項

不能重建登入、Nova、Novi、錯題本、AI Provider 或 Export Center；不能直接複製外部專案程式碼；不能使用假資料、假成績或把尚未完成的 AI 分析顯示為已完成。考後報告應沿用現有 Export Center。

## 建議實作順序

Phase 1：現況盤點（本文件）。Phase 2：Question Bank 狀態與 metadata／版本基礎。Phase 3：AI Question Generator Pipeline。Phase 4：Question Validator 與數學答案驗證。Phase 5：Exam Engine 與正式考試 snapshot。Phase 6：Mock Exam UI 與離線暫存。Phase 7：Exam Analytics。Phase 8：Wrong Answer 與 Review Queue。Phase 9：Novi Exam Context。Phase 10：AI Oral Exam。Phase 11：Admin Analytics。Phase 12：完整回歸測試。
