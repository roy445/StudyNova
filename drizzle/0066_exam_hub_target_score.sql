ALTER TABLE "exam_hubs"
  ADD COLUMN IF NOT EXISTS "target_score" integer NOT NULL DEFAULT 60;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exam_hubs_target_score_check'
  ) THEN
    ALTER TABLE "exam_hubs"
      ADD CONSTRAINT "exam_hubs_target_score_check"
      CHECK ("target_score" >= 0 AND "target_score" <= 100);
  END IF;
END $$;
