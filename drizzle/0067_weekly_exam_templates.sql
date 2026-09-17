ALTER TABLE "weekly_exam_drafts"
  ADD COLUMN IF NOT EXISTS "template_version_id" uuid;

CREATE TABLE IF NOT EXISTS "weekly_exam_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "education_level" text NOT NULL DEFAULT 'senior',
  "grade" text NOT NULL DEFAULT '',
  "textbook" text NOT NULL DEFAULT '',
  "scope" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "purpose" text NOT NULL DEFAULT 'UNIT_TEST',
  "active_version_id" uuid,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "weekly_exam_templates_purpose_idx" ON "weekly_exam_templates" ("purpose", "enabled");
CREATE INDEX IF NOT EXISTS "weekly_exam_templates_created_idx" ON "weekly_exam_templates" ("created_at");

CREATE TABLE IF NOT EXISTS "weekly_exam_template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "weekly_exam_templates"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "source_file_id" uuid REFERENCES "weekly_exam_files"("id") ON DELETE SET NULL,
  "source_file_name" text NOT NULL DEFAULT '',
  "source_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "analysis_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "question_structure" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scoring" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validation_errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_preview_url" text NOT NULL DEFAULT '',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "weekly_exam_template_version_uq" UNIQUE ("template_id", "version")
);

CREATE INDEX IF NOT EXISTS "weekly_exam_template_versions_status_idx" ON "weekly_exam_template_versions" ("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_exam_drafts_template_version_fk') THEN
    ALTER TABLE "weekly_exam_drafts"
      ADD CONSTRAINT "weekly_exam_drafts_template_version_fk"
      FOREIGN KEY ("template_version_id") REFERENCES "weekly_exam_template_versions"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "weekly_exam_weeks"
  ADD COLUMN IF NOT EXISTS "template_version_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_exam_weeks_template_version_fk') THEN
    ALTER TABLE "weekly_exam_weeks"
      ADD CONSTRAINT "weekly_exam_weeks_template_version_fk"
      FOREIGN KEY ("template_version_id") REFERENCES "weekly_exam_template_versions"("id") ON DELETE SET NULL;
  END IF;
END $$;
