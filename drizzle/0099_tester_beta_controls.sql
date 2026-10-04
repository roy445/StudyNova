ALTER TABLE "feature_permissions"
  ADD COLUMN IF NOT EXISTS "tester_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "feature_permissions"
  ADD COLUMN IF NOT EXISTS "tester_description" text NOT NULL DEFAULT '';

INSERT INTO "identity_groups" ("name", "description", "badge", "color", "enabled", "created_by")
SELECT '測試員', '可提前體驗指定 Beta 功能、回報問題並協助驗證版本的測試身分。', 'TESTER', '#a78bfa', true, u."id"
FROM "users" u
WHERE u."role" IN ('owner', 'admin')
  AND NOT EXISTS (SELECT 1 FROM "identity_groups" g WHERE g."name" = '測試員')
ORDER BY CASE WHEN u."role" = 'owner' THEN 0 ELSE 1 END, u."created_at"
LIMIT 1;

INSERT INTO "feature_permissions" ("feature", "label", "category", "enabled", "tester_enabled", "tester_description", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES
  ('camera_vision_preflight', 'AI 相機新版・影像預檢', 'AI 相機', true, true, '測試新版影像品質與版面預檢流程。', false, 0, 0, 0, 0),
  ('camera_vision_analysis', 'AI 相機新版・深度分析', 'AI 相機', true, true, '測試新版多頁圖片理解、題目與學習內容分析。', false, 0, 0, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category",
  "enabled" = true,
  "tester_enabled" = true,
  "tester_description" = EXCLUDED."tester_description";
