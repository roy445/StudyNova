CREATE TABLE IF NOT EXISTS "question_banks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "subject" text NOT NULL DEFAULT '其他',
  "grade" text NOT NULL DEFAULT '',
  "education_level" text NOT NULL DEFAULT '',
  "semester" text NOT NULL DEFAULT '',
  "publisher" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "visibility" text NOT NULL DEFAULT 'private',
  "status" text NOT NULL DEFAULT 'draft',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "question_banks_subject_idx" ON "question_banks" ("subject", "status");
CREATE INDEX IF NOT EXISTS "question_banks_creator_idx" ON "question_banks" ("created_by", "created_at");

ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "bank_id" uuid REFERENCES "question_banks"("id") ON DELETE SET NULL;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "chapter" text NOT NULL DEFAULT '';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "unit" text NOT NULL DEFAULT '';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "source_type" text NOT NULL DEFAULT 'import';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "estimated_seconds" integer NOT NULL DEFAULT 90;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "points" integer NOT NULL DEFAULT 1;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "questions_bank_status_idx" ON "questions" ("bank_id", "status");

CREATE TABLE IF NOT EXISTS "question_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "change_reason" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "question_versions_uq" UNIQUE ("question_id", "version")
);
CREATE INDEX IF NOT EXISTS "question_versions_question_idx" ON "question_versions" ("question_id", "created_at");

UPDATE "questions" SET "status" = CASE WHEN "origin" IN ('bank', 'admin') THEN 'published' ELSE 'draft' END WHERE "status" = 'draft';
