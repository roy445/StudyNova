CREATE TABLE IF NOT EXISTS "daily_word_appearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "word_id" uuid NOT NULL REFERENCES "daily_words"("id") ON DELETE CASCADE,
  "appearance_date" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "daily_word_appearances_uq" UNIQUE ("user_id", "word_id", "appearance_date")
);
CREATE INDEX IF NOT EXISTS "daily_word_appearances_user_idx" ON "daily_word_appearances" ("user_id", "appearance_date");
