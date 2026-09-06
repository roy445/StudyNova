ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "notify_on_start" boolean NOT NULL DEFAULT true;
