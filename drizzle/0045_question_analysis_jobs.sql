CREATE TABLE IF NOT EXISTS "question_analysis_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "result" jsonb,
  "quality" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "question_analysis_question_idx" ON "question_analysis_jobs" ("question_id", "created_at");
CREATE INDEX IF NOT EXISTS "question_analysis_status_idx" ON "question_analysis_jobs" ("status", "created_at");
