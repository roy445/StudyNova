ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz;

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "session_key" text NOT NULL DEFAULT '',
  "event_name" text NOT NULL,
  "route" text NOT NULL DEFAULT '',
  "duration_ms" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "analytics_event_time_idx" ON "analytics_events" ("occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_event_name_idx" ON "analytics_events" ("event_name", "occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_event_user_idx" ON "analytics_events" ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "analytics_event_session_idx" ON "analytics_events" ("session_key", "occurred_at");
