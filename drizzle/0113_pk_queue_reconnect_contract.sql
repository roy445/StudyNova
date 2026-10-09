-- Neon PK v3: durable queue tickets, match linkage, and reconnect credentials.
ALTER TABLE "pk_matchmaking_queue"
  ADD COLUMN IF NOT EXISTS "match_id" uuid,
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

UPDATE "pk_matchmaking_queue"
SET "idempotency_key" = gen_random_uuid()::text
WHERE "idempotency_key" IS NULL OR "idempotency_key" = '';

ALTER TABLE "pk_matchmaking_queue"
  ALTER COLUMN "idempotency_key" SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "pk_match_players"
  ADD COLUMN IF NOT EXISTS "reconnect_token_hash" text,
  ADD COLUMN IF NOT EXISTS "reconnect_expires_at" timestamptz;

DO $$ BEGIN
  ALTER TABLE "pk_matchmaking_queue" ADD CONSTRAINT "pk_matchmaking_queue_match_id_fk"
    FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pk_matchmaking_idempotency_uq"
  ON "pk_matchmaking_queue" ("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "pk_matchmaking_match_idx"
  ON "pk_matchmaking_queue" ("match_id");
CREATE INDEX IF NOT EXISTS "pk_match_players_reconnect_idx"
  ON "pk_match_players" ("reconnect_token_hash")
  WHERE "reconnect_token_hash" IS NOT NULL;
