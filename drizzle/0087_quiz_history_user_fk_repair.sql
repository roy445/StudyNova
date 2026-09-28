-- Repair deployments where 0071_daily_question_history.sql was applied from
-- a historical branch that referenced users(user_id). The current schema maps
-- users.userId to the physical users.id column.
DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('quiz_question_history') IS NOT NULL THEN
    FOR fk_name IN
      SELECT DISTINCT c.conname
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) AS key(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      WHERE c.conrelid = to_regclass('quiz_question_history')
        AND c.contype = 'f'
        AND a.attname = 'user_id'
    LOOP
      EXECUTE format('ALTER TABLE quiz_question_history DROP CONSTRAINT %I', fk_name);
    END LOOP;

    ALTER TABLE quiz_question_history
      ADD CONSTRAINT quiz_question_history_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
