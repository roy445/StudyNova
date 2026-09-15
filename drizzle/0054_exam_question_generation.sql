ALTER TABLE "question_banks"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS "bank_kind" text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS "scope_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "question_banks_scope_idx" ON "question_banks" ("scope", "status");

CREATE TABLE IF NOT EXISTS "question_bank_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bank_id" uuid NOT NULL REFERENCES "question_banks"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "relation" text NOT NULL DEFAULT 'included',
  "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "question_bank_membership_uq" UNIQUE ("bank_id", "question_id")
);
CREATE INDEX IF NOT EXISTS "question_bank_membership_question_idx" ON "question_bank_memberships" ("question_id");
CREATE INDEX IF NOT EXISTS "question_bank_membership_bank_idx" ON "question_bank_memberships" ("bank_id", "created_at");

CREATE TABLE IF NOT EXISTS "question_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "source_label" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "question_sources_question_idx" ON "question_sources" ("question_id", "created_at");
CREATE INDEX IF NOT EXISTS "question_sources_type_idx" ON "question_sources" ("source_type", "source_id");

ALTER TABLE "exam_hubs"
  ADD COLUMN IF NOT EXISTS "formal_scope" jsonb NOT NULL DEFAULT '{"educationLevel":"","schoolName":"","grade":1,"subject":"","examNumber":"","chapters":[],"units":[],"vocabularyRange":[],"questionTypes":[],"difficulty":"normal"}'::jsonb,
  ADD COLUMN IF NOT EXISTS "question_bank_id" uuid REFERENCES "question_banks"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "exam_question_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exam_hub_id" uuid NOT NULL REFERENCES "exam_hubs"("id") ON DELETE CASCADE,
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'draft',
  "requirements" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_policy" jsonb NOT NULL DEFAULT '{"useGlobalBank":true,"useMaterials":false,"useExisting":true,"generateNew":true,"materialIds":[],"questionIds":[]}'::jsonb,
  "quality_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "background_job_id" uuid REFERENCES "ai_background_jobs"("id") ON DELETE SET NULL,
  "confirmed_at" timestamptz,
  "confirmed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_question_generation_hub_idx" ON "exam_question_generation_jobs" ("exam_hub_id", "created_at");
CREATE INDEX IF NOT EXISTS "exam_question_generation_status_idx" ON "exam_question_generation_jobs" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "exam_question_generation_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "exam_question_generation_jobs"("id") ON DELETE CASCADE,
  "item_index" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "draft" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "quality" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "analysis" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "question_id" uuid REFERENCES "questions"("id") ON DELETE SET NULL,
  "admin_note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "exam_question_generation_item_uq" UNIQUE ("job_id", "item_index")
);
CREATE INDEX IF NOT EXISTS "exam_question_generation_item_status_idx" ON "exam_question_generation_items" ("job_id", "status");
