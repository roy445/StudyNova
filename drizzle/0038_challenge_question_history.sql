CREATE TABLE IF NOT EXISTS "challenge_question_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
  "question_fingerprint" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "challenge_history_question_uq" UNIQUE ("user_id", "question_fingerprint")
);
CREATE INDEX IF NOT EXISTS "challenge_history_user_idx" ON "challenge_question_history" ("user_id", "created_at");
