-- Repair production databases where the daily AI quiz history table was never created.
-- Safe to run repeatedly in Neon SQL Editor or during deployment.
CREATE TABLE IF NOT EXISTS "quiz_question_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quiz_id" uuid NOT NULL REFERENCES "quizzes"("id") ON DELETE CASCADE,
  "question_fingerprint" text NOT NULL,
  "appeared_date" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "quiz_question_history_daily_uq"
  ON "quiz_question_history" ("user_id", "appeared_date", "question_fingerprint");

CREATE INDEX IF NOT EXISTS "quiz_question_history_user_date_idx"
  ON "quiz_question_history" ("user_id", "appeared_date");
