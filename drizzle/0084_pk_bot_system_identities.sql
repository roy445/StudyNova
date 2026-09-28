-- PK bots are first-class system profiles, never users/accounts.
-- This migration is safe for both fresh 0083 installs and databases that
-- already created the legacy pk_bot_profiles.user_id bot-account relation.

-- Allow profile-backed bot participants and their answers to exist without users rows.
ALTER TABLE pk_match_players ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE pk_player_answers ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE pk_player_answers ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE pk_match_players ADD COLUMN IF NOT EXISTS bot_profile_id uuid;
DO $$ BEGIN
  ALTER TABLE pk_match_players
    ADD CONSTRAINT pk_match_players_bot_profile_fk
    FOREIGN KEY (bot_profile_id) REFERENCES pk_bot_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pk_player_answers
    ADD CONSTRAINT pk_player_answers_player_id_pk_match_players_id_fk
    FOREIGN KEY (player_id) REFERENCES pk_match_players(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attach old bot participants to their profile before removing the profile's
-- legacy users FK. This branch is skipped on new installs where user_id never existed.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'pk_bot_profiles'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE pk_match_players AS p
      SET bot_profile_id = b.id
      FROM pk_bot_profiles AS b
      WHERE p.role = 'bot'
        AND p.bot_profile_id IS NULL
        AND p.user_id = b.user_id
    $sql$;
  END IF;
END $$;

-- Backfill stable participant identity for existing human and bot answers.
UPDATE pk_player_answers AS a
SET player_id = p.id
FROM pk_match_players AS p
WHERE a.player_id IS NULL
  AND a.match_id = p.match_id
  AND a.user_id = p.user_id;

-- Convert existing bot answer/player references to profile-backed identity.
UPDATE pk_player_answers AS a
SET user_id = NULL
FROM pk_match_players AS p
WHERE a.player_id = p.id
  AND p.role = 'bot';

UPDATE pk_match_players
SET user_id = NULL
WHERE role = 'bot'
  AND bot_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pk_match_players_bot_profile_uq
  ON pk_match_players (match_id, bot_profile_id)
  WHERE bot_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pk_player_answers_player_once_uq
  ON pk_player_answers (match_id, question_id, player_id)
  WHERE player_id IS NOT NULL;

-- Remove only indexes/columns introduced for the legacy account-backed bot design.
DROP INDEX IF EXISTS pk_bot_profiles_user_uq;
ALTER TABLE pk_bot_profiles DROP COLUMN IF EXISTS user_id CASCADE;

-- Clean up only the known system bot accounts created by previous versions.
-- Human users and their records are not targeted.
DELETE FROM users
WHERE nova_id IN ('NOVA-BOT', 'ALEX-BOT', 'MIA-BOT')
   OR (nova_id LIKE 'BOT-%' AND email LIKE 'bot-%@system.studynova')
   OR email IN ('nova-bot@system.studynova', 'alex-bot@system.studynova', 'mia-bot@system.studynova');
