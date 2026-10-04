CREATE TABLE IF NOT EXISTS "question_usage_stats" (
  "question_id" uuid PRIMARY KEY NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "appearance_count" integer NOT NULL DEFAULT 0,
  "answer_count" integer NOT NULL DEFAULT 0,
  "correct_count" integer NOT NULL DEFAULT 0,
  "total_response_ms" integer NOT NULL DEFAULT 0,
  "last_appeared_at" timestamptz,
  "last_answered_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "question_usage_stats_accuracy_idx" ON "question_usage_stats" ("correct_count", "answer_count");
CREATE INDEX IF NOT EXISTS "question_usage_stats_appearance_idx" ON "question_usage_stats" ("appearance_count");
ALTER TABLE "pk_match_questions" ADD COLUMN IF NOT EXISTS "source_question_id" uuid REFERENCES "questions"("id") ON DELETE SET NULL;
