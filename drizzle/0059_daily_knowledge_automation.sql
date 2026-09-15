ALTER TABLE "daily_knowledge_items" ADD COLUMN IF NOT EXISTS "source_type" text NOT NULL DEFAULT 'unknown';
ALTER TABLE "daily_knowledge_items" ADD COLUMN IF NOT EXISTS "source_id" text NOT NULL DEFAULT '';
ALTER TABLE "daily_knowledge_items" ADD COLUMN IF NOT EXISTS "license_info" text NOT NULL DEFAULT '';
ALTER TABLE "daily_knowledge_items" ADD COLUMN IF NOT EXISTS "original_title" text NOT NULL DEFAULT '';
ALTER TABLE "daily_knowledge_items" ADD COLUMN IF NOT EXISTS "fetched_at" timestamptz;
ALTER TABLE "daily_knowledge_views" ADD COLUMN IF NOT EXISTS "subject" text NOT NULL DEFAULT '其他';
ALTER TABLE "daily_knowledge_views" ADD COLUMN IF NOT EXISTS "delivery_date" text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "daily_knowledge_views_delivery_idx" ON "daily_knowledge_views" ("user_id", "delivery_date", "subject");
