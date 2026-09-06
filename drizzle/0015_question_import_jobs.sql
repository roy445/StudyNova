ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "target_bank" text NOT NULL DEFAULT 'general';
CREATE TABLE IF NOT EXISTS "question_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'created',
  "total_files" integer NOT NULL DEFAULT 0,
  "processed_files" integer NOT NULL DEFAULT 0,
  "total_questions" integer NOT NULL DEFAULT 0,
  "accepted_questions" integer NOT NULL DEFAULT 0,
  "duplicate_questions" integer NOT NULL DEFAULT 0,
  "bank_category" text NOT NULL DEFAULT '匯入題庫',
  "source_label" text NOT NULL DEFAULT '線上上傳檔案',
  "target_bank" text NOT NULL DEFAULT 'general',
  "preview" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "question_import_jobs_admin_idx" ON "question_import_jobs" ("admin_id", "created_at");
