ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_until" timestamptz;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'general';
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS "announcements_category_idx" ON "announcements" ("category", "starts_at");
