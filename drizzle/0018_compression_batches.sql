ALTER TABLE "compression_jobs" ADD COLUMN IF NOT EXISTS "batch_id" uuid;
ALTER TABLE "compression_jobs" ADD COLUMN IF NOT EXISTS "zip_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL;
ALTER TABLE "compression_jobs" ADD COLUMN IF NOT EXISTS "batch_name" text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "compression_batch_idx" ON "compression_jobs" ("batch_id");
