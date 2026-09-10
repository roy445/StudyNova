CREATE TABLE IF NOT EXISTS "ai_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature" text NOT NULL,
  "strategy" text NOT NULL DEFAULT 'guided',
  "allow_direct_answer" boolean NOT NULL DEFAULT false,
  "require_detailed_analysis" boolean NOT NULL DEFAULT false,
  "allow_web_search" boolean NOT NULL DEFAULT false,
  "max_hint_level" integer NOT NULL DEFAULT 2,
  "system_policy" text NOT NULL DEFAULT '',
  "version" integer NOT NULL DEFAULT 1,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_policies_feature_uq" UNIQUE ("feature")
);
CREATE INDEX IF NOT EXISTS "ai_policies_enabled_idx" ON "ai_policies" ("enabled", "feature");

CREATE TABLE IF NOT EXISTS "ai_policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "policy_id" uuid NOT NULL REFERENCES "ai_policies"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "before" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_policy_versions_uq" UNIQUE ("policy_id", "version")
);
CREATE INDEX IF NOT EXISTS "ai_policy_versions_policy_idx" ON "ai_policy_versions" ("policy_id", "created_at");

INSERT INTO "ai_policies" ("feature", "strategy", "allow_direct_answer", "require_detailed_analysis", "allow_web_search", "max_hint_level")
VALUES
  ('ai_chat', 'guided', false, false, false, 2),
  ('question_analysis', 'structured', true, true, false, 5),
  ('exam_hint', 'exam', false, false, false, 1),
  ('wrong_answer_review', 'teaching', true, true, false, 5),
  ('ocr_solution', 'structured', true, true, false, 5),
  ('question_generation', 'structured', true, true, false, 5)
ON CONFLICT ("feature") DO NOTHING;
