ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS available_for_pk boolean NOT NULL DEFAULT true;

-- Existing published/imported questions are canonical repository records and can
-- participate in PK unless an administrator explicitly disables them later.
UPDATE questions
SET available_for_pk = true
WHERE available_for_pk IS NULL;

CREATE INDEX IF NOT EXISTS questions_pk_repository_idx
  ON questions (level, status, available_for_pk, difficulty);
