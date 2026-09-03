ALTER TABLE "ocr_pages" ADD COLUMN IF NOT EXISTS "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;
