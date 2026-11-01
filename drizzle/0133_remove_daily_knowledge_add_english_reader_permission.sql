DROP TABLE IF EXISTS "daily_knowledge_views";
DROP TABLE IF EXISTS "daily_knowledge_items";
INSERT INTO "feature_permissions" ("feature", "label", "category", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('english_reader', '英文雜誌閱讀器', 'learning', true, true, 0, -1, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET "label" = EXCLUDED."label", "category" = EXCLUDED."category", "pro_only" = true, "free_daily_limit" = 0, "pro_daily_limit" = -1, "updated_at" = now();
