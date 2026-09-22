-- Runtime repair for deployments where earlier additive migrations were not applied.
-- Every operation is idempotent so it is safe to run in Neon SQL Editor.

ALTER TABLE "exam_hubs"
  ADD COLUMN IF NOT EXISTS "target_score" integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "formal_scope" jsonb NOT NULL DEFAULT '{"educationLevel":"","schoolName":"","grade":1,"subject":"","examNumber":"","chapters":[],"units":[],"vocabularyRange":[],"questionTypes":[],"difficulty":"normal"}'::jsonb,
  ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;

CREATE TABLE IF NOT EXISTS "pro_renewal_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wants_renewal" boolean NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "requested_features" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "other_feedback" text NOT NULL DEFAULT '',
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pro_renewal_request_user_uq" UNIQUE ("user_id")
);
CREATE INDEX IF NOT EXISTS "pro_renewal_request_date_idx" ON "pro_renewal_requests" ("submitted_at");

ALTER TABLE "system_logs"
  ADD COLUMN IF NOT EXISTS "user_id" uuid;
CREATE INDEX IF NOT EXISTS "system_logs_user_idx" ON "system_logs" ("user_id", "created_at");
