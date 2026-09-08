ALTER TABLE "textbook_editions" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';
ALTER TABLE "textbook_editions" ADD COLUMN IF NOT EXISTS "isbn" text NOT NULL DEFAULT '';
ALTER TABLE "textbook_editions" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "textbook_editions" ADD COLUMN IF NOT EXISTS "ocr_status" text NOT NULL DEFAULT 'not_started';
