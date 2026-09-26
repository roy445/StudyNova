ALTER TABLE "pk_matches"
  ADD COLUMN IF NOT EXISTS "source_type" text NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS "source_id" uuid;

CREATE INDEX IF NOT EXISTS "pk_matches_source_idx" ON "pk_matches" ("source_type", "source_id");

INSERT INTO "ai_policies" ("id", "feature", "strategy", "allow_direct_answer", "require_detailed_analysis", "allow_web_search", "max_hint_level", "system_policy", "version", "enabled", "pro_only")
SELECT gen_random_uuid(), 'ai_folder_creation', 'guided', true, false, false, 5, '管理員可控制 Novi 是否能在使用者確認後建立單字資料夾。', 1, true, false
WHERE NOT EXISTS (SELECT 1 FROM "ai_policies" WHERE "feature" = 'ai_folder_creation');
