CREATE TABLE IF NOT EXISTS "daily_knowledge_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "content" text NOT NULL,
  "detail" text NOT NULL DEFAULT '',
  "subject" text NOT NULL,
  "topic" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT '',
  "source_url" text NOT NULL DEFAULT '',
  "published_at" timestamptz,
  "verified_at" timestamptz,
  "verification_note" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_date" text,
  "core_concept" text NOT NULL DEFAULT '',
  "title_fingerprint" text NOT NULL DEFAULT '',
  "content_fingerprint" text NOT NULL DEFAULT '',
  "quiz" jsonb,
  "generation_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "daily_knowledge_subject_status_idx" ON "daily_knowledge_items" ("subject", "status", "published_at");
CREATE UNIQUE INDEX IF NOT EXISTS "daily_knowledge_schedule_uq" ON "daily_knowledge_items" ("scheduled_date", "subject");
CREATE INDEX IF NOT EXISTS "daily_knowledge_fingerprint_idx" ON "daily_knowledge_items" ("title_fingerprint", "content_fingerprint");

CREATE TABLE IF NOT EXISTS "daily_knowledge_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" uuid NOT NULL REFERENCES "daily_knowledge_items"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewed_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "daily_knowledge_view_uq" UNIQUE ("item_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "daily_knowledge_view_user_idx" ON "daily_knowledge_views" ("user_id", "viewed_at");
