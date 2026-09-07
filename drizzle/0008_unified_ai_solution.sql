-- Unified AI solution engine: upload context, analysis scopes, mode locking, and sessions.
CREATE TABLE IF NOT EXISTS "file_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "object_id" uuid NOT NULL REFERENCES "storage_objects"("id") ON DELETE CASCADE,
  "upload_batch" integer NOT NULL DEFAULT 1,
  "sha256" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'uploaded',
  "original_name" text NOT NULL DEFAULT '',
  "detected" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "file_context_user_idx" ON "file_contexts" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "file_context_hash_idx" ON "file_contexts" ("user_id", "sha256");
CREATE TABLE IF NOT EXISTS "analysis_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_context_id" uuid NOT NULL UNIQUE REFERENCES "file_contexts"("id") ON DELETE CASCADE,
  "include_question" boolean NOT NULL DEFAULT true,
  "include_handwriting" boolean NOT NULL DEFAULT true,
  "include_note" boolean NOT NULL DEFAULT true,
  "highlight_priority" boolean NOT NULL DEFAULT false,
  "question_color" text NOT NULL DEFAULT '',
  "sentence_color" text NOT NULL DEFAULT '',
  "keyword_color" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "solution_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "mode" text NOT NULL DEFAULT 'tutor',
  "mode_locked" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "file_context_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "result" jsonb,
  "nova_cost" integer NOT NULL DEFAULT 0,
  "charged" boolean NOT NULL DEFAULT false,
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "solution_session_user_idx" ON "solution_sessions" ("user_id", "created_at");
CREATE TABLE IF NOT EXISTS "ai_modes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "solution_session_id" uuid,
  "mode" text NOT NULL DEFAULT 'tutor',
  "source" text NOT NULL DEFAULT 'manual',
  "locked" boolean NOT NULL DEFAULT false,
  "reason" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_mode_user_idx" ON "ai_modes" ("user_id", "updated_at");
INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0008_unified_ai_solution', extract(epoch from now()) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE "hash" = '0008_unified_ai_solution');
