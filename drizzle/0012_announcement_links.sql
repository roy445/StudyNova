ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "link" text NOT NULL DEFAULT '/dashboard';
