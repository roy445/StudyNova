CREATE TABLE IF NOT EXISTS "ai_question_converter_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "source_context_id" uuid NOT NULL REFERENCES "file_contexts"("id") ON DELETE CASCADE,
  "source_file_name" text NOT NULL DEFAULT '',
  "title" text NOT NULL DEFAULT 'AI 題目互動化題組',
  "status" text NOT NULL DEFAULT 'queued',
  "stage" text NOT NULL DEFAULT 'queued',
  "page_count" integer NOT NULL DEFAULT 0,
  "total_count" integer NOT NULL DEFAULT 0,
  "interactive_count" integer NOT NULL DEFAULT 0,
  "skipped_count" integer NOT NULL DEFAULT 0,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_pro" boolean NOT NULL DEFAULT false,
  "ai_usage" integer NOT NULL DEFAULT 0,
  "nova_cost" integer NOT NULL DEFAULT 0,
  "processing_ms" integer NOT NULL DEFAULT 0,
  "quiz_id" uuid REFERENCES "quizzes"("id") ON DELETE SET NULL,
  "expires_at" timestamptz,
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ai_question_converter_user_idx" ON "ai_question_converter_jobs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_question_converter_status_idx" ON "ai_question_converter_jobs" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "ai_question_converter_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "ai_question_converter_jobs"("id") ON DELETE CASCADE,
  "ordinal" integer NOT NULL,
  "page_number" integer NOT NULL DEFAULT 0,
  "type" text NOT NULL DEFAULT 'single',
  "status" text NOT NULL DEFAULT 'interactive',
  "stem" text NOT NULL DEFAULT '',
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "original_explanation" text NOT NULL DEFAULT '',
  "ai_explanation" text NOT NULL DEFAULT '',
  "skip_reason" text NOT NULL DEFAULT '',
  "source_text" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_question_converter_item_job_idx" ON "ai_question_converter_items" ("job_id", "ordinal");

INSERT INTO "feature_permissions" ("feature", "label", "category", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES ('ai_question_converter', 'AI 題目互動化', 'AI 學習工具', true, false, 3, 20, 0, 0)
ON CONFLICT ("feature") DO UPDATE SET "label" = EXCLUDED."label", "category" = EXCLUDED."category";

INSERT INTO "platform_settings" ("key", "value")
VALUES ('ai_question_converter', '{"enabled":true,"freeEnabled":true,"proEnabled":true,"freeDailyLimit":3,"proDailyLimit":20,"maxPdfBytes":20971520,"maxPages":100,"maxQuestions":100,"freeRetentionDays":15,"proRetentionDays":30,"autoDelete":true,"expiryReminderDays":3,"allowedTypes":["single","multiple","fill"],"printEnabled":false,"printFree":false,"printPro":true}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
