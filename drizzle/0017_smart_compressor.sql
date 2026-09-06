CREATE TABLE IF NOT EXISTS "compression_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_object_id" uuid NOT NULL REFERENCES "storage_objects"("id") ON DELETE CASCADE,
  "result_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "original_size" integer NOT NULL,
  "target_size" integer NOT NULL,
  "mode" text NOT NULL DEFAULT 'precise',
  "status" text NOT NULL DEFAULT 'queued',
  "stage" text NOT NULL DEFAULT 'QUEUED',
  "compressed_size" integer,
  "compression_ratio" real,
  "quality_score" text,
  "iterations" integer NOT NULL DEFAULT 0,
  "preview" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_code" text NOT NULL DEFAULT '',
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "compression_user_idx" ON "compression_jobs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "compression_status_idx" ON "compression_jobs" ("status", "created_at");
INSERT INTO "platform_settings" ("key", "value") VALUES ('compression_settings', '{"enabled":true,"maxOriginalBytes":104857600,"maxBatchFiles":20,"maxProcessingSeconds":120,"maxPdfPages":100,"maxImagePixels":144000000,"minImageQuality":35,"maxIterations":8,"allowPdf":true,"allowImages":true,"allowBatch":true,"proOnly":false,"dailyFree":10,"dailyPro":100}') ON CONFLICT ("key") DO NOTHING;
