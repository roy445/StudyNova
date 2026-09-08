-- Production repair migration for deployments where later additive migrations were skipped.
-- All statements are idempotent and preserve existing user data.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'in_app';
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamptz;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "last_error" text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "notif_user_idx" ON "notifications" ("user_id", "read_at");
CREATE UNIQUE INDEX IF NOT EXISTS "notif_dedupe_uq" ON "notifications" ("dedupe_key");

CREATE TABLE IF NOT EXISTS "learning_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL, "object_type" text NOT NULL, "object_id" uuid, "concept_id" uuid, "session_id" uuid,
  "occurred_at" timestamptz NOT NULL DEFAULT now(), "duration_sec" integer NOT NULL DEFAULT 0, "response_time_ms" integer NOT NULL DEFAULT 0,
  "correct" boolean, "hint_used" boolean NOT NULL DEFAULT false, "confidence" integer, "source" text NOT NULL DEFAULT 'app',
  "idempotency_key" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "learning_events_user_time_idx" ON "learning_events" ("user_id", "occurred_at");
CREATE UNIQUE INDEX IF NOT EXISTS "learning_events_idempotency_uq" ON "learning_events" ("user_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "review_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content_type" text NOT NULL, "content_id" uuid NOT NULL, "concept_id" uuid, "state" text NOT NULL DEFAULT 'new',
  "due_at" timestamptz NOT NULL DEFAULT now(), "last_reviewed_at" timestamptz, "stability" real NOT NULL DEFAULT 0,
  "difficulty" real NOT NULL DEFAULT 0, "retrievability" real NOT NULL DEFAULT 0, "reps" integer NOT NULL DEFAULT 0,
  "lapses" integer NOT NULL DEFAULT 0, "last_rating" text NOT NULL DEFAULT '', "source_evidence_id" uuid,
  "suspended_reason" text NOT NULL DEFAULT '', "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_items_user_content_uq" ON "review_items" ("user_id", "content_type", "content_id");
CREATE INDEX IF NOT EXISTS "review_items_due_idx" ON "review_items" ("user_id", "due_at");

CREATE TABLE IF NOT EXISTS "knowledge_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text NOT NULL DEFAULT '其他', "title" text NOT NULL, "kind" text NOT NULL DEFAULT 'concept',
  "description" text NOT NULL DEFAULT '', "mastery" integer NOT NULL DEFAULT 0, "source_type" text NOT NULL DEFAULT 'manual',
  "source_id" uuid, "tags" jsonb NOT NULL DEFAULT '[]', "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "knowledge_nodes_user_subject_idx" ON "knowledge_nodes" ("user_id", "subject");
CREATE INDEX IF NOT EXISTS "knowledge_nodes_user_kind_idx" ON "knowledge_nodes" ("user_id", "kind");
