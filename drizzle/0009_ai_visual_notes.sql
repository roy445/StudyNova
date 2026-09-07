-- AI-generated visual study notes / mind maps.
INSERT INTO "feature_permissions" ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('ai_visual', 'AI 重點心智圖', true, false, 3, 20, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET "label" = EXCLUDED."label";
