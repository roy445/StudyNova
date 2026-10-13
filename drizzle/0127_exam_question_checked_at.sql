-- StudyNova: distinguish a temporarily saved choice from a question explicitly checked/submitted.
ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS checked_at timestamptz;

CREATE INDEX IF NOT EXISTS answers_checked_at_idx
  ON answers (attempt_id, checked_at);
