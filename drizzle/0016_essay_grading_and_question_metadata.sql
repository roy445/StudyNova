ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "essay_grading_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'created',
  "original_text" text NOT NULL DEFAULT '',
  "ocr_text" text NOT NULL DEFAULT '',
  "result" jsonb,
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "essay_grading_idem_uq" ON "essay_grading_jobs" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "essay_grading_user_idx" ON "essay_grading_jobs" ("user_id", "created_at");

INSERT INTO "feature_permissions" ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('essay_grading', '英文作文批改', true, false, 1, 10, 30, 10)
ON CONFLICT ("feature") DO NOTHING;

INSERT INTO "platform_settings" ("key", "value")
VALUES ('essay_grading_service', '{"status":"ENABLED","proOnly":false,"novaCost":10,"dailyLimit":1,"monthlyLimit":30,"maintenanceNotice":""}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
