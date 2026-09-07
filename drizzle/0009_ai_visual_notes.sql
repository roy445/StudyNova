-- AI-generated visual study notes / mind maps.
INSERT INTO "feature_permissions" ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('ai_visual', 'AI 重點心智圖', true, false, 3, 20, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET "label" = EXCLUDED."label";
INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0009_ai_visual_notes', extract(epoch from now()) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE "hash" = '0009_ai_visual_notes');
