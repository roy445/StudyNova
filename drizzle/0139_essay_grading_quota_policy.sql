-- StudyNova v1.2.0: English essay grading quota policy.
-- Free: 1 successful grading per day; Pro: 5 successful gradings per day.
-- Overage is charged at 50 Nova per successful grading with no monthly cap.
UPDATE "feature_permissions"
SET "enabled" = true,
    "pro_only" = false,
    "free_daily_limit" = 1,
    "pro_daily_limit" = 5,
    "monthly_limit" = -1,
    "nova_cost" = 50
WHERE "feature" = 'essay_grading';

INSERT INTO "feature_permissions" ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('essay_grading', '英文作文批改', true, false, 1, 5, -1, 50)
ON CONFLICT ("feature") DO NOTHING;

INSERT INTO "platform_settings" ("key", "value")
VALUES ('essay_grading_service', '{"status":"ENABLED","proOnly":false,"novaCost":50,"dailyLimit":1,"monthlyLimit":-1,"maintenanceNotice":"","showScores":true}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value" = jsonb_set(jsonb_set(jsonb_set("platform_settings"."value", '{novaCost}', '50'::jsonb), '{dailyLimit}', '1'::jsonb), '{monthlyLimit}', '-1'::jsonb), "updated_at" = now();
