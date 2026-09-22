ALTER TABLE "system_logs"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "system_logs_user_idx"
  ON "system_logs" ("user_id", "created_at");
