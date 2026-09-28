DROP INDEX IF EXISTS pk_match_players_uq;
CREATE UNIQUE INDEX IF NOT EXISTS pk_match_players_uq
  ON pk_match_players (match_id, user_id, role);
