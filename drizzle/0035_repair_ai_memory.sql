-- Repair AI memory columns for databases initialized before memory controls were added.
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'profile';
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "source_type" text NOT NULL DEFAULT 'user';
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "source_id" uuid;
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "confidence" integer NOT NULL DEFAULT 50;
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "consent_status" text NOT NULL DEFAULT 'active';
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "last_used_at" timestamptz;
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "ai_memory_uq" ON "ai_memory" ("user_id", "key");
CREATE INDEX IF NOT EXISTS "ai_memory_active_idx" ON "ai_memory" ("user_id", "consent_status", "deleted_at");
