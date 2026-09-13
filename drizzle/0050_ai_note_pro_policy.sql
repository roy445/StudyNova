ALTER TABLE "ai_policies"
  ADD COLUMN IF NOT EXISTS "pro_only" boolean NOT NULL DEFAULT false;

INSERT INTO "ai_policies" ("feature", "strategy", "allow_direct_answer", "require_detailed_analysis", "allow_web_search", "max_hint_level", "system_policy", "version", "enabled", "pro_only")
VALUES ('ai_note_creation', 'guided', true, true, false, 5, 'AI 建立筆記預設限 Nova Pro；管理員可調整 proOnly。', 1, true, true)
ON CONFLICT ("feature") DO NOTHING;
