-- PK Core v2 contract: keep production schema aligned with the current Drizzle model.
-- Every statement is additive/idempotent so existing matches and scores are preserved.
ALTER TABLE "pk_match_players"
  ADD COLUMN IF NOT EXISTS "bot_profile_id" uuid,
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS "connection_state" text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS "option_orders" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "current_question_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "finished_at" timestamptz;

ALTER TABLE "pk_player_answers"
  ADD COLUMN IF NOT EXISTS "player_id" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_players_role_uq"
  ON "pk_match_players" ("match_id", "user_id", "role");

CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_players_bot_profile_uq"
  ON "pk_match_players" ("match_id", "bot_profile_id")
  WHERE "bot_profile_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "pk_player_answers_player_once_uq"
  ON "pk_player_answers" ("match_id", "question_id", "player_id")
  WHERE "player_id" IS NOT NULL;
