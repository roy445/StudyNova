-- Per-exam-hub access controls for the student-facing sprint area.
-- Defaults preserve the existing behavior for all current hubs.
ALTER TABLE "exam_hubs"
  ADD COLUMN IF NOT EXISTS "allow_vocabulary" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_self_quiz" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_timed_exam" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allow_score_analysis" boolean NOT NULL DEFAULT true;
