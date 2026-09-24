CREATE TABLE IF NOT EXISTS "quiz_question_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "quiz_id" uuid NOT NULL REFERENCES "quizzes"("id") ON DELETE CASCADE,
  "question_fingerprint" text NOT NULL,
  "appeared_date" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_question_history_daily_uq" ON "quiz_question_history" ("user_id", "appeared_date", "question_fingerprint");
CREATE INDEX IF NOT EXISTS "quiz_question_history_user_date_idx" ON "quiz_question_history" ("user_id", "appeared_date");

ALTER TABLE "challenge_question_history" ADD COLUMN IF NOT EXISTS "appeared_date" text NOT NULL DEFAULT '1970-01-01';
DROP INDEX IF EXISTS "challenge_history_question_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_history_question_daily_uq" ON "challenge_question_history" ("user_id", "appeared_date", "question_fingerprint");
CREATE INDEX IF NOT EXISTS "challenge_history_user_idx" ON "challenge_question_history" ("user_id", "appeared_date", "created_at");
