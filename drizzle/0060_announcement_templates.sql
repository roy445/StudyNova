CREATE TABLE IF NOT EXISTS "announcement_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "type" text NOT NULL DEFAULT 'general',
  "icon" text NOT NULL DEFAULT '▤',
  "cta_label" text NOT NULL DEFAULT '',
  "cta_url" text NOT NULL DEFAULT '',
  "default_settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "announcement_templates_enabled_idx" ON "announcement_templates" ("enabled", "updated_at");

INSERT INTO "announcement_templates" ("name", "title", "body", "type", "icon", "cta_label", "cta_url", "default_settings")
SELECT * FROM (VALUES
  ('每週小考開放', '每週小考已開放！', '本週單字、句子與多元題型測驗已上線，現在就開始挑戰。', 'exam', '▣', '開始測驗', '/weekly', '{"marquee":true,"importance":"normal"}'::jsonb),
  ('每日知識更新', '今日課外知識已更新', '前往每日知識，閱讀跨學科內容並完成素養小測驗。', 'feature', '✦', '閱讀每日知識', '/dashboard#daily-knowledge', '{"marquee":false,"importance":"normal"}'::jsonb),
  ('好友挑戰開放', '好友挑戰等你來戰！', '邀請同學一起進行公平對戰，題目與選項將保持一致。', 'activity', '⚔', '開始挑戰', '/challenges', '{"marquee":true,"importance":"normal"}'::jsonb),
  ('限時活動開始', 'StudyNova 限時活動開始', '活動題庫已開放，完成任務即可獲得 Nova 與 XP 獎勵。', 'activity', '★', '參加活動', '/activities', '{"marquee":true,"importance":"normal"}'::jsonb),
  ('系統維護通知', '系統維護通知', 'StudyNova 將進行例行維護，請提前保存學習進度。', 'maintenance', '⚠', '查看詳情', '/dashboard', '{"marquee":false,"importance":"high"}'::jsonb)
) AS v("name", "title", "body", "type", "icon", "cta_label", "cta_url", "default_settings")
WHERE NOT EXISTS (SELECT 1 FROM "announcement_templates" t WHERE t."name" = v."name");
