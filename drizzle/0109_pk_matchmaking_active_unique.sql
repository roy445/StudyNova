-- Keep matchmaking history while allowing a user to cancel more than once.
-- The old (user_id, status) index made waiting -> cancelled fail whenever a
-- previous cancelled row already existed for the same user.
DROP INDEX IF EXISTS "pk_matchmaking_user_active_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "pk_matchmaking_user_active_uq"
  ON "pk_matchmaking_queue" USING btree ("user_id")
  WHERE "status" IN ('waiting', 'matching');
