CREATE TABLE IF NOT EXISTS "tester_decision_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "decision" text NOT NULL,
  "target_email" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "reason" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tester_decision_token_uq" ON "tester_decision_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "tester_decision_expiry_idx" ON "tester_decision_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "tester_decision_email_idx" ON "tester_decision_links" ("target_email");

INSERT INTO "announcements" ("title", "body", "link", "target_feature", "category", "type", "importance", "tags", "audience", "pinned", "marquee", "notify", "show_home", "cta_label", "cta_url", "status")
SELECT
  'StudyNova 測試員志願者徵選',
  '想提前體驗 AI 學習功能、協助找出問題並分享真實心得嗎？StudyNova 正在招募 Beta 測試員。填寫申請表後，請留意你的 Email，我們將在 7 天內回覆申請結果。',
  '/tester/apply', 'all', 'activity', 'activity', 'high', '["測試員","Beta","志願者"]'::jsonb, 'all', true, true, true, true, '立即填寫申請表', '/tester/apply', 'published'
WHERE NOT EXISTS (SELECT 1 FROM "announcements" WHERE "title" = 'StudyNova 測試員志願者徵選');
