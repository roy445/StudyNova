-- Online Learning controls: admins can change Nova cost, PRO-only access, and quotas in /admin/ops.
INSERT INTO "feature_permissions" ("feature", "label", "category", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES
  ('learning_ai_chat', '線上學習 AI 問答', '學習', true, false, 10, 80, 0, 0),
  ('learning_ai_question_generation', '線上學習 AI 出題', '學習', true, false, 2, 20, 0, 5),
  ('learning_chapter_pdf', '線上學習章節 PDF', '學習', true, false, 3, 30, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET
  "label" = EXCLUDED."label",
  "category" = EXCLUDED."category";
