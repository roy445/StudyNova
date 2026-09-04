ALTER TABLE "daily_words" ADD COLUMN IF NOT EXISTS "meanings" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_words" ADD COLUMN IF NOT EXISTS "phrases" jsonb DEFAULT '[]'::jsonb NOT NULL;
