-- Phase 3: AI analysis, answer validation and review state for exam-prep drafts.
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "analysis" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "quality" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "analysis_status" text NOT NULL DEFAULT 'queued';
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "analysis_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "analysis_error" text NOT NULL DEFAULT '';
ALTER TABLE "exam_prep_question_drafts" ADD COLUMN IF NOT EXISTS "analyzed_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "exam_prep_question_drafts_analysis_idx" ON "exam_prep_question_drafts" ("analysis_status", "updated_at");
