ALTER TABLE "assistant_profiles" ADD COLUMN IF NOT EXISTS "core" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD COLUMN IF NOT EXISTS "float" text DEFAULT 'none' NOT NULL;
