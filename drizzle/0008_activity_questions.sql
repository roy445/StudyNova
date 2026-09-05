-- Activity-only question bank. Run once on the production PostgreSQL database.
CREATE TABLE IF NOT EXISTS "activity_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "activity_id" uuid NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "subject" text NOT NULL DEFAULT '英文',
  "type" text NOT NULL DEFAULT 'single',
  "stem" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "explanation" text NOT NULL DEFAULT '',
  "order_index" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "activity_questions_idx"
  ON "activity_questions" ("activity_id", "enabled", "order_index");
INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0008_activity_questions', extract(epoch from now()) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM "__drizzle_migrations" WHERE "hash" = '0008_activity_questions'
);
