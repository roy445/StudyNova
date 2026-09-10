CREATE TABLE IF NOT EXISTS "question_analysis_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "total" integer NOT NULL DEFAULT 0,
  "processed" integer NOT NULL DEFAULT 0,
  "succeeded" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "quality_failed" integer NOT NULL DEFAULT 0,
  "question_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error_message" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "question_analysis_batch_status_idx" ON "question_analysis_batches" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "question_analysis_batch_user_idx" ON "question_analysis_batches" ("requested_by", "created_at");

INSERT INTO "platform_settings" ("key", "value") VALUES
('ai_question_studio_expert_settings', '{"enabled":true,"sourceStrictness":"strict","requireAnswerVerification":true,"requireExplanation":true,"avoidDuplicates":true,"avoidSensitiveContent":true,"bloomLevel":"understand","cognitiveSkills":["concept","application"],"distractorStrategy":"plausible","scenarioStyle":"balanced","language":"zh-TW","temperature":0.2,"qualityThreshold":80,"maxRetries":1,"outputFormat":"structured","referencePriority":"reference_only"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
