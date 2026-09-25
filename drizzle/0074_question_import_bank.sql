ALTER TABLE "question_import_jobs" ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;

DO $$ BEGIN
  ALTER TABLE "question_import_jobs" ADD CONSTRAINT "question_import_jobs_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "question_import_jobs_bank_idx" ON "question_import_jobs" USING btree ("question_bank_id", "created_at");
