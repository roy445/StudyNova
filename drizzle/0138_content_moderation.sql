-- Content moderation ledger: multilingual safety events, three-warning enforcement, and appeal evidence.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "content_warning_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "content_last_warning_at" timestamptz;

CREATE TABLE IF NOT EXISTS "moderation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "source_id" uuid,
  "content" text NOT NULL,
  "category" text NOT NULL DEFAULT 'other',
  "severity" text NOT NULL DEFAULT 'medium',
  "detector" text NOT NULL DEFAULT '',
  "reason" text NOT NULL DEFAULT '',
  "warning_number" integer NOT NULL DEFAULT 1,
  "action" text NOT NULL DEFAULT 'warning',
  "review_status" text NOT NULL DEFAULT 'pending',
  "ip" text NOT NULL DEFAULT '',
  "user_agent" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "review_note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "moderation_user_idx" ON "moderation_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "moderation_status_idx" ON "moderation_events" ("review_status", "created_at");
CREATE INDEX IF NOT EXISTS "moderation_channel_idx" ON "moderation_events" ("channel", "created_at");

UPDATE "legal_documents"
SET "body" = "body" || E'\n\n## 九、AI 對話與社群內容安全\n1. AI 回覆可能有錯誤、遺漏或不適合個別情境的內容，使用者必須雙重確認重要資訊，並遵守適用法律與本服務條款。\n2. 禁止在聊天室、AI 對話、教學教室或其他互動功能中發送威脅、暴力、性暴力、兒少剝削、仇恨歧視、騷擾、詐欺、惡意程式或其他不當言語；平台會以多語言自動審查與人工複核保護社群。\n3. 每次確認違規會記錄訊息內容、時間、頻道、判定原因、警告次數與必要的安全稽核資料。累計三次警告，帳號將自動停權；誤判或特殊情況可透過帳號申訴提出說明，由管理員審核。'
WHERE "slug" = 'terms'
  AND "body" NOT LIKE '%AI 對話與社群內容安全%';

UPDATE "legal_documents"
SET "version" = '1.1'
WHERE "slug" = 'terms' AND "version" = '1.0';
