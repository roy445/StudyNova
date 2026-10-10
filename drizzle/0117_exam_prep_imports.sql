-- Phase 2: exam paper upload, page/OCR records, source assets and question drafts.
-- Additive only. Drafts remain needs_review and are never published by this migration.
CREATE TABLE IF NOT EXISTS "exam_prep_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "activity_id" uuid NOT NULL REFERENCES "exam_prep_activities"("id") ON DELETE CASCADE,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "checksum" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'uploaded',
  "stage" text NOT NULL DEFAULT 'uploaded',
  "progress" integer NOT NULL DEFAULT 0,
  "page_count" integer NOT NULL DEFAULT 0,
  "draft_count" integer NOT NULL DEFAULT 0,
  "error_message" text NOT NULL DEFAULT '',
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_prep_import_jobs_activity_idx" ON "exam_prep_import_jobs" ("activity_id", "created_at");
CREATE INDEX IF NOT EXISTS "exam_prep_import_jobs_status_idx" ON "exam_prep_import_jobs" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "exam_prep_import_jobs_uploader_idx" ON "exam_prep_import_jobs" ("uploaded_by", "created_at");

CREATE TABLE IF NOT EXISTS "exam_prep_import_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "exam_prep_import_jobs"("id") ON DELETE CASCADE,
  "page_number" integer NOT NULL,
  "page_end" integer NOT NULL DEFAULT 0,
  "object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "extracted_text" text NOT NULL DEFAULT '',
  "ocr_blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "width" integer,
  "height" integer,
  "status" text NOT NULL DEFAULT 'ready',
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_prep_import_pages_job_page_uq" ON "exam_prep_import_pages" ("job_id", "page_number");
CREATE INDEX IF NOT EXISTS "exam_prep_import_pages_job_idx" ON "exam_prep_import_pages" ("job_id", "page_number");

CREATE TABLE IF NOT EXISTS "exam_prep_import_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "exam_prep_import_jobs"("id") ON DELETE CASCADE,
  "page_id" uuid REFERENCES "exam_prep_import_pages"("id") ON DELETE SET NULL,
  "asset_type" text NOT NULL DEFAULT 'image',
  "object_id" uuid NOT NULL REFERENCES "storage_objects"("id") ON DELETE CASCADE,
  "page_number" integer,
  "bbox" jsonb,
  "label" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_prep_import_assets_job_idx" ON "exam_prep_import_assets" ("job_id", "page_number");
CREATE INDEX IF NOT EXISTS "exam_prep_import_assets_page_idx" ON "exam_prep_import_assets" ("page_id");

CREATE TABLE IF NOT EXISTS "exam_prep_question_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "exam_prep_import_jobs"("id") ON DELETE CASCADE,
  "activity_id" uuid NOT NULL REFERENCES "exam_prep_activities"("id") ON DELETE CASCADE,
  "question_number" integer,
  "page_start" integer,
  "page_end" integer,
  "type" text NOT NULL DEFAULT 'single',
  "subject" text NOT NULL DEFAULT '其他',
  "stem" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "explanation" text NOT NULL DEFAULT '',
  "confidence" real NOT NULL DEFAULT 0,
  "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'needs_review',
  "question_id" uuid REFERENCES "questions"("id") ON DELETE SET NULL,
  "admin_note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_prep_question_drafts_job_idx" ON "exam_prep_question_drafts" ("job_id", "question_number");
CREATE INDEX IF NOT EXISTS "exam_prep_question_drafts_activity_idx" ON "exam_prep_question_drafts" ("activity_id", "status");
CREATE INDEX IF NOT EXISTS "exam_prep_question_drafts_page_idx" ON "exam_prep_question_drafts" ("job_id", "page_start");

DO $$ BEGIN
  ALTER TABLE "exam_prep_import_jobs" ADD CONSTRAINT "exam_prep_import_progress_ck" CHECK ("progress" >= 0 AND "progress" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
