ALTER TABLE "ai_messages" ADD COLUMN IF NOT EXISTS "importance" text DEFAULT 'normal' NOT NULL;
