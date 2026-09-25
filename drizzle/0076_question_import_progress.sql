ALTER TABLE "question_import_jobs" ADD COLUMN IF NOT EXISTS "analysis_total_chunks" integer NOT NULL DEFAULT 0;
ALTER TABLE "question_import_jobs" ADD COLUMN IF NOT EXISTS "analysis_processed_chunks" integer NOT NULL DEFAULT 0;
ALTER TABLE "question_import_jobs" ADD COLUMN IF NOT EXISTS "analysis_started_at" timestamp with time zone;
ALTER TABLE "question_import_jobs" ADD COLUMN IF NOT EXISTS "analysis_last_chunk_at" timestamp with time zone;
