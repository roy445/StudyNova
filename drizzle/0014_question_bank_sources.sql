ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "bank_category" text NOT NULL DEFAULT 'general';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "source_label" text NOT NULL DEFAULT '';
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "question_sources" jsonb NOT NULL DEFAULT '["activity"]'::jsonb;
CREATE INDEX IF NOT EXISTS "questions_bank_category_idx" ON "questions" ("bank_category", "origin");
