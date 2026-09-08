CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(), "event_type" text NOT NULL, "module" text NOT NULL,
  "action" text NOT NULL, "resource_id" text NOT NULL DEFAULT '', "outcome" text NOT NULL DEFAULT 'success',
  "error_category" text NOT NULL DEFAULT '', "correlation_id" text NOT NULL, "ip" text NOT NULL DEFAULT '',
  "user_agent" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS "audit_user_time_idx" ON "audit_logs" ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_time_idx" ON "audit_logs" ("occurred_at");
CREATE INDEX IF NOT EXISTS "audit_event_idx" ON "audit_logs" ("event_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_module_idx" ON "audit_logs" ("module", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_outcome_idx" ON "audit_logs" ("outcome", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_resource_idx" ON "audit_logs" ("resource_id");
CREATE UNIQUE INDEX IF NOT EXISTS "audit_correlation_idx" ON "audit_logs" ("correlation_id");

CREATE TABLE IF NOT EXISTS "education_stages" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "key" text NOT NULL UNIQUE, "name" text NOT NULL, "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "education_schools" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text NOT NULL, "stage_id" uuid REFERENCES "education_stages"("id") ON DELETE SET NULL, "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "education_grades" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text NOT NULL, "stage_id" uuid REFERENCES "education_stages"("id") ON DELETE CASCADE, "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "education_subjects" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text NOT NULL, "stage_id" uuid REFERENCES "education_stages"("id") ON DELETE SET NULL, "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "textbook_editions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "stage_id" uuid REFERENCES "education_stages"("id") ON DELETE SET NULL, "school_id" uuid REFERENCES "education_schools"("id") ON DELETE SET NULL, "grade_id" uuid REFERENCES "education_grades"("id") ON DELETE SET NULL, "subject_id" uuid REFERENCES "education_subjects"("id") ON DELETE SET NULL, "publisher" text NOT NULL, "version" text NOT NULL DEFAULT '', "volume" text NOT NULL DEFAULT '', "cover_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL, "cover_url" text NOT NULL DEFAULT '/brand/studynova-logo-square.png', "enabled" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT 0, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "textbook_lessons" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "edition_id" uuid NOT NULL REFERENCES "textbook_editions"("id") ON DELETE CASCADE, "title" text NOT NULL, "description" text NOT NULL DEFAULT '', "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "textbook_contents" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "lesson_id" uuid NOT NULL REFERENCES "textbook_lessons"("id") ON DELETE CASCADE, "type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}', "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "content_themes" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "key" text NOT NULL UNIQUE, "name" text NOT NULL, "tokens" jsonb NOT NULL DEFAULT '{}', "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS "education_school_stage_idx" ON "education_schools" ("stage_id", "enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "education_grade_stage_idx" ON "education_grades" ("stage_id", "enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "education_subject_stage_idx" ON "education_subjects" ("stage_id", "enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "textbook_scope_idx" ON "textbook_editions" ("stage_id", "school_id", "grade_id", "subject_id");
CREATE INDEX IF NOT EXISTS "textbook_enabled_idx" ON "textbook_editions" ("enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "textbook_lesson_edition_idx" ON "textbook_lessons" ("edition_id", "enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "textbook_content_lesson_idx" ON "textbook_contents" ("lesson_id", "enabled", "sort_order");
CREATE INDEX IF NOT EXISTS "textbook_content_type_idx" ON "textbook_contents" ("type");
INSERT INTO "education_stages" ("key", "name", "sort_order") VALUES ('junior', '國中', 10), ('senior', '高中', 20) ON CONFLICT ("key") DO NOTHING;
