-- Separate daily file-upload quota for AI solution images/PDFs.
-- Admins can change either daily limit in /admin/features; -1 means unlimited.
INSERT INTO "feature_permissions"
  ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES
  ('ai_solution_upload', 'AI 解題圖片／檔案上傳', true, false, 8, 50, 0, 0)
ON CONFLICT ("feature") DO NOTHING;
