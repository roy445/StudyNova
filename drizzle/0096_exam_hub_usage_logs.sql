CREATE TABLE IF NOT EXISTS "exam_hub_usage_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hub_id" uuid NOT NULL REFERENCES "exam_hubs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "action" text NOT NULL DEFAULT 'started',
  "session_id" text NOT NULL DEFAULT '',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "duration_seconds" integer NOT NULL DEFAULT 0,
  "score" integer,
  "total" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_hub_usage_hub_time_idx" ON "exam_hub_usage_logs" ("hub_id", "created_at");
CREATE INDEX IF NOT EXISTS "exam_hub_usage_user_time_idx" ON "exam_hub_usage_logs" ("user_id", "created_at");
