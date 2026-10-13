ALTER TABLE "exam_prep_subjects"
  ADD COLUMN IF NOT EXISTS "open_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "close_at" timestamptz;

CREATE INDEX IF NOT EXISTS "exam_prep_subjects_window_idx"
  ON "exam_prep_subjects" ("open_at", "close_at");
