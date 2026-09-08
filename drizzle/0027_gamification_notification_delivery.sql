ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'in_app' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "last_error" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "rule" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
