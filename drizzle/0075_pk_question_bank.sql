ALTER TABLE "pk_matches" ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;
ALTER TABLE "pk_matchmaking_queue" ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;

DO $$ BEGIN
  ALTER TABLE "pk_matches" ADD CONSTRAINT "pk_matches_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pk_matchmaking_queue" ADD CONSTRAINT "pk_matchmaking_queue_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "pk_matches_bank_idx" ON "pk_matches" USING btree ("question_bank_id", "status");
CREATE INDEX IF NOT EXISTS "pk_matchmaking_bank_idx" ON "pk_matchmaking_queue" USING btree ("question_bank_id", "status");
