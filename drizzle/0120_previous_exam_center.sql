-- Previous exam practice center: normalized year / type / subject / question metadata.
CREATE TABLE IF NOT EXISTS "previous_exam_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "exam_type" text NOT NULL DEFAULT '學測',
  "year" integer NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "source_filename" text NOT NULL DEFAULT '',
  "source_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "is_open" boolean NOT NULL DEFAULT false,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "previous_exam_collections_slug_uq" ON "previous_exam_collections" ("slug");
CREATE INDEX IF NOT EXISTS "previous_exam_collections_year_idx" ON "previous_exam_collections" ("exam_type", "year", "is_open");
CREATE TABLE IF NOT EXISTS "previous_exam_subjects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "previous_exam_collections"("id") ON DELETE CASCADE,
  "subject_key" text NOT NULL,
  "subject_name" text NOT NULL,
  "category" text NOT NULL DEFAULT '學測科目',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_open" boolean NOT NULL DEFAULT true,
  "question_count" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "previous_exam_subjects_collection_key_uq" ON "previous_exam_subjects" ("collection_id", "subject_key");
CREATE INDEX IF NOT EXISTS "previous_exam_subjects_collection_sort_idx" ON "previous_exam_subjects" ("collection_id", "is_open", "sort_order");
CREATE TABLE IF NOT EXISTS "previous_exam_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "previous_exam_collections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "previous_exam_subjects"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "question_number" integer NOT NULL,
  "question_kind" text NOT NULL DEFAULT '選擇題',
  "source_page_start" integer,
  "source_page_end" integer,
  "explanation_page_start" integer,
  "explanation_page_end" integer,
  "source_text" text NOT NULL DEFAULT '',
  "explanation_text" text NOT NULL DEFAULT '',
  "asset_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "previous_exam_questions_subject_number_uq" ON "previous_exam_questions" ("subject_id", "question_number");
CREATE INDEX IF NOT EXISTS "previous_exam_questions_collection_subject_idx" ON "previous_exam_questions" ("collection_id", "subject_id", "question_number");
CREATE INDEX IF NOT EXISTS "previous_exam_questions_question_idx" ON "previous_exam_questions" ("question_id");
CREATE TABLE IF NOT EXISTS "previous_exam_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "previous_exam_collections"("id") ON DELETE CASCADE,
  "subject_id" uuid NOT NULL REFERENCES "previous_exam_subjects"("id") ON DELETE CASCADE,
  "previous_question_id" uuid NOT NULL REFERENCES "previous_exam_questions"("id") ON DELETE CASCADE,
  "response" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_correct" boolean NOT NULL DEFAULT false,
  "duration_sec" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "previous_exam_attempts_user_idx" ON "previous_exam_attempts" ("user_id", "collection_id", "subject_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "previous_exam_attempts_user_question_uq" ON "previous_exam_attempts" ("user_id", "previous_question_id");
