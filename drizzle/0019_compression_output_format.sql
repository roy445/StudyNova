ALTER TABLE "compression_jobs" ADD COLUMN IF NOT EXISTS "output_format" text NOT NULL DEFAULT 'original';
