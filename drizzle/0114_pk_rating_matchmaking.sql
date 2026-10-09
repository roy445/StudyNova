-- PK v4: rating-aware, atomic matchmaking.
-- Safe to run on a database that already has the PK queue.
ALTER TABLE pk_matchmaking_queue
  ADD COLUMN IF NOT EXISTS rating integer NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS pk_player_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1000,
  real_matches integer NOT NULL DEFAULT 0,
  real_wins integer NOT NULL DEFAULT 0,
  real_draws integer NOT NULL DEFAULT 0,
  real_losses integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pk_player_ratings_user_uq
  ON pk_player_ratings (user_id);
CREATE INDEX IF NOT EXISTS pk_player_ratings_rank_idx
  ON pk_player_ratings (rating DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS pk_matchmaking_rating_wait_idx
  ON pk_matchmaking_queue (status, match_type, grade, difficulty, rating, joined_at);

-- Preserve a stable default rating for existing queue tickets.
UPDATE pk_matchmaking_queue SET rating = 1000 WHERE rating IS NULL;
