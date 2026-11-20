-- Migration 0137: Exam hub feature flags and controls
ALTER TABLE IF EXISTS "exam_hubs" ADD COLUMN IF NOT EXISTS "allow_vocabulary" boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS "exam_hubs" ADD COLUMN IF NOT EXISTS "allow_self_quiz" boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS "exam_hubs" ADD COLUMN IF NOT EXISTS "allow_timed_exam" boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS "exam_hubs" ADD COLUMN IF NOT EXISTS "allow_score_analysis" boolean NOT NULL DEFAULT true;
