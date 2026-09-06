ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "target_feature" text NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS "announcements_target_feature_idx" ON "announcements" ("target_feature");
