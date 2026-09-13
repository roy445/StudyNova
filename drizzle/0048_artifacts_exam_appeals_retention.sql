ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_reason" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "name_moderation_status" text NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS "name_moderation_reason" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "name_last_checked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "name_warning_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inactive_reminder_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inactive_first_notified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "inactive_second_notified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deletion_scheduled_at" timestamptz;

CREATE TABLE IF NOT EXISTS "deleted_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "identifier_type" text NOT NULL,
  "identifier" text NOT NULL,
  "reason" text NOT NULL,
  "deleted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "deleted_accounts_identifier_uq" UNIQUE ("identifier_type", "identifier")
);
CREATE INDEX IF NOT EXISTS "deleted_accounts_deleted_idx" ON "deleted_accounts" ("deleted_at");

CREATE TABLE IF NOT EXISTS "exam_date_appeals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "exam_id" uuid REFERENCES "exams"("id") ON DELETE CASCADE,
  "exam_name" text NOT NULL,
  "subject" text NOT NULL DEFAULT '',
  "current_exam_date" text NOT NULL DEFAULT '',
  "requested_exam_date" text NOT NULL,
  "requested_days_remaining" integer,
  "reason" text NOT NULL,
  "evidence_object_id" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "admin_note" text NOT NULL DEFAULT '',
  "handled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_date_appeals_user_idx" ON "exam_date_appeals" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "exam_date_appeals_status_idx" ON "exam_date_appeals" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "exam_date_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_name" text NOT NULL DEFAULT '',
  "education_level" text NOT NULL,
  "grade" integer NOT NULL,
  "term" text NOT NULL,
  "exam_name" text NOT NULL,
  "exam_date" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "exam_date_policy_uq" UNIQUE ("school_name", "education_level", "grade", "term")
);
CREATE INDEX IF NOT EXISTS "exam_date_policy_match_idx" ON "exam_date_policies" ("school_name", "education_level", "grade", "enabled");

CREATE TABLE IF NOT EXISTS "ai_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "ai_conversations"("id") ON DELETE SET NULL,
  "message_id" uuid REFERENCES "ai_messages"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "preview" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_artifacts_user_idx" ON "ai_artifacts" ("user_id", "created_at");
