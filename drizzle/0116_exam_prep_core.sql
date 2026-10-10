-- Phase 1: Exam Prep Center core.
-- Additive only: does not alter or drop legacy exam_hubs data.
CREATE TABLE IF NOT EXISTS "exam_prep_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "education_level" text NOT NULL,
  "grade" integer NOT NULL,
  "semester" text NOT NULL DEFAULT '',
  "exam_name" text NOT NULL,
  "scope" text NOT NULL DEFAULT '',
  "timezone" text NOT NULL DEFAULT 'Asia/Taipei',
  "open_mode" text NOT NULL DEFAULT 'manual',
  "status" text NOT NULL DEFAULT 'draft',
  "open_at" timestamp with time zone,
  "close_at" timestamp with time zone,
  "question_bank_id" uuid REFERENCES "question_banks"("id") ON DELETE SET NULL,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
  "published_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_prep_activities_slug_uq" ON "exam_prep_activities" ("slug");
CREATE INDEX IF NOT EXISTS "exam_prep_activities_status_window_idx" ON "exam_prep_activities" ("status", "open_at", "close_at");
CREATE INDEX IF NOT EXISTS "exam_prep_activities_target_idx" ON "exam_prep_activities" ("education_level", "grade", "status");

CREATE TABLE IF NOT EXISTS "exam_prep_subjects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "activity_id" uuid NOT NULL REFERENCES "exam_prep_activities"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "chapters" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "units" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "question_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "difficulty" text NOT NULL DEFAULT 'normal',
  "question_bank_id" uuid REFERENCES "question_banks"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_prep_subjects_activity_subject_uq" ON "exam_prep_subjects" ("activity_id", "subject");
CREATE INDEX IF NOT EXISTS "exam_prep_subjects_activity_idx" ON "exam_prep_subjects" ("activity_id");

DO $$ BEGIN
  ALTER TABLE "exam_prep_activities" ADD CONSTRAINT "exam_prep_activity_open_close_ck" CHECK ("close_at" IS NULL OR "open_at" IS NULL OR "close_at" > "open_at");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "exam_prep_activities" ADD CONSTRAINT "exam_prep_activity_timezone_ck" CHECK ("timezone" = 'Asia/Taipei');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
