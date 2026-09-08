ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'profile' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "source_id" uuid;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "confidence" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "consent_status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ai_memory" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_memory_active_idx" ON "ai_memory" ("user_id", "consent_status", "deleted_at");
