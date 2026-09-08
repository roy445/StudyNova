-- Repair gamification columns for databases initialized before achievement rules were added.
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "rule" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true;
