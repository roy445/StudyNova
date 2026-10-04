-- Remove only pinned update notices; keep the tester recruitment announcement.
DELETE FROM "announcements"
WHERE "pinned" = true
  AND "title" ILIKE '%更新%'
  AND "title" <> 'StudyNova 測試員志願者徵選';

-- Keep the tester recruitment announcement visible after the previous cleanup migration.
-- Insert only when it is missing; do not modify or remove other non-update announcements.
INSERT INTO "announcements" ("title", "body", "link", "target_feature", "category", "type", "importance", "tags", "audience", "pinned", "marquee", "notify", "show_home", "cta_label", "cta_url", "status")
SELECT
  'StudyNova 測試員志願者徵選',
  '想提前體驗 AI 學習功能、協助找出問題並分享真實心得嗎？StudyNova 正在招募 Beta 測試員。填寫申請表後，請留意你的 Email，我們將在 7 天內回覆申請結果。',
  '/tester/apply', 'all', 'activity', 'activity', 'high', '["測試員","Beta","志願者"]'::jsonb, 'all', true, true, true, true, '立即填寫申請表', '/tester/apply', 'published'
WHERE NOT EXISTS (SELECT 1 FROM "announcements" WHERE "title" = 'StudyNova 測試員志願者徵選');
