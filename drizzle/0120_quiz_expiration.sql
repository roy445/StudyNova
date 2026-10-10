-- Keep generated quizzes for three days; existing rows remain available until manually cleaned.
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
CREATE INDEX IF NOT EXISTS "quizzes_expires_idx" ON "quizzes" ("expires_at");
