ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "preferred_name" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "learning_style" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "explanation_preference" text NOT NULL DEFAULT 'simple_then_deep',
  ADD COLUMN IF NOT EXISTS "proactive_ai_reminders" boolean NOT NULL DEFAULT true;

ALTER TABLE "word_progress"
  ADD COLUMN IF NOT EXISTS "review_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "first_seen_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_correct" boolean,
  ADD COLUMN IF NOT EXISTS "self_rating" text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "exam_mode_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mode" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "education_level" text NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_mode_policy_enabled_idx" ON "exam_mode_policies" ("enabled");

CREATE TABLE IF NOT EXISTS "exam_mode_selections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "exam_id" uuid REFERENCES "exams"("id") ON DELETE CASCADE,
  "mode" text NOT NULL,
  "subject" text NOT NULL DEFAULT '',
  "scope" text NOT NULL DEFAULT '',
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_mode_selection_user_idx" ON "exam_mode_selections" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "exam_mode_selection_exam_idx" ON "exam_mode_selections" ("exam_id");

CREATE TABLE IF NOT EXISTS "learning_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "material_id" uuid NOT NULL REFERENCES "study_materials"("id") ON DELETE CASCADE,
  "selected_steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'queued',
  "progress" integer NOT NULL DEFAULT 0,
  "current_step" text NOT NULL DEFAULT '',
  "results" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "errors" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "learning_packages_user_idx" ON "learning_packages" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "learning_packages_material_idx" ON "learning_packages" ("material_id");

CREATE TABLE IF NOT EXISTS "ai_content_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "feature" text NOT NULL,
  "content_type" text NOT NULL,
  "content_id" uuid,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "admin_note" text NOT NULL DEFAULT '',
  "resolved_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_content_reports_status_idx" ON "ai_content_reports" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "ai_content_reports_user_idx" ON "ai_content_reports" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "ai_proactive_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "alert_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "action" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "read_at" timestamptz,
  "dismissed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_proactive_alerts_user_idx" ON "ai_proactive_alerts" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_proactive_alerts_unread_idx" ON "ai_proactive_alerts" ("user_id", "read_at");

CREATE TABLE IF NOT EXISTS "admin_feature_customizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature" text NOT NULL UNIQUE,
  "label" text NOT NULL DEFAULT '',
  "enabled" boolean NOT NULL DEFAULT true,
  "allowed_roles" jsonb NOT NULL DEFAULT '["student"]'::jsonb,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "exam_mode_policies" ("mode", "label", "education_level", "description", "rules") VALUES
('general', '一般練習', 'all', '依照個人程度與指定範圍練習。', '{"readingWeight":0.2,"crossConcept":false,"ability":"practice"}'::jsonb),
('junior_exam', '國中會考', 'junior', '偏重綜合能力、跨概念與閱讀理解。', '{"readingWeight":0.35,"crossConcept":true,"ability":"comprehensive"}'::jsonb),
('senior_midterm', '高中段考', 'senior', '依高中課程章節與校內範圍評量。', '{"readingWeight":0.25,"crossConcept":true,"ability":"curriculum"}'::jsonb),
('gsat', '學測', 'senior', '高中學科素養、長文閱讀、推理與跨單元能力導向。', '{"readingWeight":0.45,"crossConcept":true,"ability":"literacy","longReading":true}'::jsonb),
('tech_exam', '統測', 'senior', '依技高專業與共同科目能力要求出題。', '{"readingWeight":0.3,"crossConcept":true,"ability":"technical"}'::jsonb),
('custom', '自訂考試', 'all', '由使用者與管理員設定規則。', '{"readingWeight":0.2,"crossConcept":false,"ability":"custom"}'::jsonb)
ON CONFLICT ("mode") DO NOTHING;
