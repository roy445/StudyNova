ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "competition_mode" text NOT NULL DEFAULT 'entertainment';
ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "stake_nova" integer NOT NULL DEFAULT 0;
ALTER TABLE "challenge_participants" ADD COLUMN IF NOT EXISTS "points" integer NOT NULL DEFAULT 0;
ALTER TABLE "challenge_participants" ADD COLUMN IF NOT EXISTS "correct_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "challenge_participants" ADD COLUMN IF NOT EXISTS "wrong_count" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "challenge_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "question_index" integer NOT NULL,
  "correct" boolean NOT NULL DEFAULT false,
  "points_awarded" integer NOT NULL DEFAULT 0,
  "response" text NOT NULL DEFAULT '',
  "answered_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "challenge_answer_once_uq" UNIQUE ("challenge_id", "user_id", "question_index")
);
CREATE INDEX IF NOT EXISTS "challenge_answers_question_idx" ON "challenge_answers" ("challenge_id", "question_index", "answered_at");

CREATE TABLE IF NOT EXISTS "challenge_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
  "winner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "loser_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "winner_points" integer NOT NULL DEFAULT 0,
  "loser_points" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "challenge_settlement_once_uq" UNIQUE ("challenge_id")
);
