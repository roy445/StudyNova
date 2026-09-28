# StudyNova 生成、分享、閱讀與 Bot 升級

本次改動以 **additive migration + 可輪詢 background job** 為原則，不把長時間 AI、圖片 renderer 或 TTS 模型塞進 Next.js Serverless request。

## 已完成的主流程

### 1. AI 心智圖／視覺筆記

- `POST /api/v1/visual-notes/generate` 建立 `ai_background_jobs`，以 idempotency key 去重。
- worker 會呼叫既有 AI provider，依科目／關鍵字從 `illustrations` library 選擇 fallback illustration。
- 透過既有 `sharp-librsvg + CJK font` renderer 產生 PNG，寫入 `storage_objects`，並建立 `ai_artifacts`。
- 前端 `VisualNotesPanel` 會輪詢 `/ai/background-jobs/:id`，完成後顯示結果與可建立分享連結的 artifact。
- 分享頁以 `/api/v1/shares/public/:slug/asset` 讀取 artifact，仍會檢查 share visibility 與 owner。

### 2. Sharing / Social Library

- `shares.visibility` 現在支援 `private | link | friends | public`。
- 分享頁與 API 都實際檢查 owner、雙向 friends 關係與 link/public scope；private 不向匿名使用者洩漏。
- `share_analytics` 記錄 `shareCreated`、`shareOpened`、`imageDownloaded`、`contentImported`、`favoriteAdded` 等事件。
- `share_copies` 提供「加入學習庫」與「複製成筆記參考」的可追蹤 reference。
- payload 上限 50 KB；AI artifact 用 `artifactId` 關聯，不在 public payload 內暴露 private object key。

### 3. 教材理解、閱讀進度、高亮與 AI 朗讀

- `POST /materials/:id/understand` 以 background job 產生 `content_understanding_documents`、語意 `blocks` 與可朗讀 `segments`。
- `PATCH /materials/:id/reading-progress` 將 page/block/percent 寫入 `study_material_reading_progress`。
- `POST /materials/:id/highlights` 將選取文字寫入 `study_material_highlights`；前端仍保留 local optimistic cache。
- `POST /tts/jobs` 建立可重試的 `tts_jobs` / `tts_segments`，輸出檔案寫入既有 object storage。
- TTS 只呼叫獨立 worker，不在 Next.js 內載入模型。支援 `provider=cosyvoice` 或 `provider=gpt-sovits`。

TTS worker contract：

```http
POST ${TTS_SERVICE_URL}/v1/tts
Authorization: Bearer <TTS_SERVICE_TOKEN> # optional
Content-Type: application/json

{
  "text": "需要朗讀的段落",
  "language": "zh-TW",
  "voice": "default",
  "speed": 1,
  "provider": "cosyvoice"
}
```

```json
{
  "audioBase64": "...",
  "mimeType": "audio/wav",
  "durationMs": 1234,
  "filename": "optional.wav"
}
```

### 4. Online PK Bot

- 一般 `POST /pk/matchmaking/join` **不再自動塞 Bot**；真人不足時維持 waiting queue。
- 新增 `POST /pk/bot-match` 作為明確 Bot 練習場入口，支援 `1v1 / 2v2 / 3v3 / 多人`。
- `pk_bot_profiles` 儲存 Bot 的 avatar、personality、grade、subject、difficulty、accuracy、response range 與 stats。
- Bot 是獨立系統身分，只存在 `pk_bot_profiles`；不建立登入帳號，也不出現在 `users`。
- 對戰 participant 以 `bot_profile_id` 關聯 Bot，答案以 `player_id` 關聯 participant；Bot 的 `user_id` 為 `NULL`。
- `pk_bot_sessions` 與 `pk_bot_jobs` 讓每個 Bot 的每一回合可獨立重試、去重與觀測。
- Bot 決策使用 `matchId + profile + questionId` deterministic seed，不使用 `Math.random()`，避免重試造成分數漂移。
- Bot 作答透過 queue worker 完成，不在真人 `/answer` request 內同步執行。

## Migration

依序執行 `drizzle/0083_generation_share_reading_bot.sql`、`drizzle/0084_pk_bot_system_identities.sql` 與 `drizzle/0085_pk_matchmaking_schema_repair.sql`。它們是 idempotent migration，會建立：

- sharing analytics / copy
- illustration library
- reading progress / highlights
- content understanding documents / blocks / segments
- TTS jobs / segments
- Bot profiles / sessions / jobs（不建立 Bot users）
- `pk_match_players.bot_profile_id`
- `pk_player_answers.player_id` 與歷史答案回填
- 對舊版已建立的 Bot 佔位帳號進行精確清理
- `pk_matchmaking_queue.joined_at` 與 `question_bank_id` 的相容性修補

`0081_pk_bot_user.sql` 已改為 no-op，舊部署若曾由它建立 Nova Bot 使用者，會由 0084 清理。

## Worker / Cron

此 repository 目前沒有 BullMQ Worker consumer，因此即使環境有 `REDIS_URL`，queue 仍安全地寫入 PostgreSQL；不支援設定 `STUDYNOVA_BULLMQ_WORKER=1` 把工作送入無 consumer 的 Redis。部署必須以外部排程器每分鐘呼叫受 `CRON_SECRET` 保護的 `/system/cron?task=queue_drain`，否則 `ai_background_batch`、`tts_job` 與 `pk_bot_turn` 會停留在 queued。若未來要使用 BullMQ，必須先加入並驗證真正的 worker 進程與 health heartbeat。

## 驗證結果

- `tsc --noEmit`：通過。
- Vitest：24 files / 109 tests 通過。
- 本次變更檔案 ESLint：重新驗證中。
- Production build：需在有部署環境變數與資料庫連線的 CI／部署環境執行。
