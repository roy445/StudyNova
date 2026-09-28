-- Repair deployed PK matchmaking schemas safely.
-- 0073 names the queue timestamp joined_at; the Drizzle schema must use the same name.
-- 0075 adds question_bank_id. Repeat these guards so a partially migrated production DB
-- can be brought forward without renaming/dropping existing data.
ALTER TABLE "pk_matchmaking_queue"
  ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE "pk_matchmaking_queue"
  ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;

DO $$ BEGIN
  ALTER TABLE "pk_matchmaking_queue"
    ADD CONSTRAINT "pk_matchmaking_queue_question_bank_id_question_banks_id_fk"
    FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "pk_matchmaking_bank_idx"
  ON "pk_matchmaking_queue" USING btree ("question_bank_id", "status");
