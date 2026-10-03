ALTER TABLE "system_logs"
  ADD COLUMN IF NOT EXISTS "fingerprint" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "occurrence_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;

CREATE INDEX IF NOT EXISTS "system_logs_fingerprint_idx"
  ON "system_logs" ("fingerprint", "last_seen_at");

CREATE TABLE IF NOT EXISTS "error_debug_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "system_log_id" uuid NOT NULL REFERENCES "system_logs"("id") ON DELETE CASCADE,
  "admin_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "run_type" text NOT NULL DEFAULT 'diagnose',
  "status" text NOT NULL DEFAULT 'completed',
  "result" jsonb NOT NULL DEFAULT '{}',
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "error_debug_runs_log_idx"
  ON "error_debug_runs" ("system_log_id", "created_at");
CREATE INDEX IF NOT EXISTS "error_debug_runs_status_idx"
  ON "error_debug_runs" ("status", "created_at");
