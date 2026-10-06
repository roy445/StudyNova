-- Runtime repair for PK bot/player inserts.
-- Safe to run repeatedly on partially migrated production databases.
ALTER TABLE "pk_match_players"
  ADD COLUMN IF NOT EXISTS "user_id" uuid,
  ADD COLUMN IF NOT EXISTS "bot_profile_id" uuid,
  ADD COLUMN IF NOT EXISTS "team_id" uuid,
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS "connection_state" text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS "option_orders" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "score" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "combo" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_combo" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "correct_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "answered_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_response_ms" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fastest_response_ms" integer,
  ADD COLUMN IF NOT EXISTS "rank" integer,
  ADD COLUMN IF NOT EXISTS "joined_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "current_question_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "finished_at" timestamptz;

DO $$ BEGIN
  ALTER TABLE "pk_match_players"
    ADD CONSTRAINT "pk_match_players_bot_profile_fk"
    FOREIGN KEY ("bot_profile_id") REFERENCES "pk_bot_profiles"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_players_bot_profile_uq"
  ON "pk_match_players" ("match_id", "bot_profile_id")
  WHERE "bot_profile_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "pk_match_players_presence_idx"
  ON "pk_match_players" ("user_id", "connection_state");
