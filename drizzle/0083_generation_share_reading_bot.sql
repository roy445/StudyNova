-- StudyNova generation, sharing, reading and bot runtime extensions.
-- Additive and idempotent so a rolling deploy can run this safely more than once.

ALTER TABLE shares ADD COLUMN IF NOT EXISTS artifact_id uuid;
CREATE INDEX IF NOT EXISTS shares_artifact_idx ON shares (artifact_id);

CREATE TABLE IF NOT EXISTS share_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS share_analytics_share_idx ON share_analytics (share_id, created_at);
CREATE INDEX IF NOT EXISTS share_analytics_event_idx ON share_analytics (event_type, created_at);

CREATE TABLE IF NOT EXISTS share_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  copied_kind text DEFAULT 'reference' NOT NULL,
  copy_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS share_copies_once_uq ON share_copies (share_id, user_id);
CREATE INDEX IF NOT EXISTS share_copies_user_idx ON share_copies (user_id, created_at);

CREATE TABLE IF NOT EXISTS illustrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  asset_url text DEFAULT '' NOT NULL,
  fallback_icon text DEFAULT '✦' NOT NULL,
  category text DEFAULT 'STUDY' NOT NULL,
  subjects jsonb DEFAULT '[]'::jsonb NOT NULL,
  keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
  content_types jsonb DEFAULT '[]'::jsonb NOT NULL,
  style text DEFAULT 'Cute Study' NOT NULL,
  status text DEFAULT 'ACTIVE' NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  use_contexts jsonb DEFAULT '["share", "note", "pdf", "mind_map"]'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS illustrations_status_idx ON illustrations (status, sort_order);
CREATE INDEX IF NOT EXISTS illustrations_category_idx ON illustrations (category);
CREATE UNIQUE INDEX IF NOT EXISTS illustrations_name_uq ON illustrations (name);
INSERT INTO illustrations (name, fallback_icon, category, subjects, keywords, content_types, style, sort_order)
VALUES
  ('Study Spark', '✦', 'STUDY', '["其他", "英文", "數學", "國文"]', '["重點", "複習", "學習"]', '["summary", "mind_map", "share"]', 'Cute Study', 10),
  ('Book Garden', '📚', 'STUDY', '["國文", "歷史", "地理"]', '["閱讀", "文本", "文章"]', '["reading", "summary", "share"]', 'Cute Study', 20),
  ('Science Leaf', '🌱', 'SCIENCE', '["自然", "物理", "化學", "生物"]', '["實驗", "公式", "觀察"]', '["formula", "note", "share"]', 'Cute Study', 30),
  ('Number Lab', '🧮', 'MATH', '["數學"]', '["公式", "計算", "題型"]', '["formula", "quiz", "share"]', 'Cute Study', 40),
  ('Language Star', '⭐', 'LANGUAGE', '["英文", "國文"]', '["單字", "句型", "語言"]', '["vocabulary", "reading", "share"]', 'Cute Study', 50)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS study_material_reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  material_id uuid NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_page integer DEFAULT 1 NOT NULL,
  current_block_id uuid,
  percent real DEFAULT 0 NOT NULL,
  last_read_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS material_reading_progress_uq ON study_material_reading_progress (material_id, user_id);
CREATE INDEX IF NOT EXISTS material_reading_progress_user_idx ON study_material_reading_progress (user_id, last_read_at);

CREATE TABLE IF NOT EXISTS study_material_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  material_id uuid NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_number integer DEFAULT 1 NOT NULL,
  block_id uuid,
  selected_text text NOT NULL,
  color text DEFAULT 'yellow' NOT NULL,
  note text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS material_highlights_user_idx ON study_material_highlights (user_id, created_at);
CREATE INDEX IF NOT EXISTS material_highlights_material_idx ON study_material_highlights (material_id, page_number);

CREATE TABLE IF NOT EXISTS content_understanding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  material_id uuid NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  language text DEFAULT 'zh-TW' NOT NULL,
  summary text DEFAULT '' NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_message text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS content_understanding_material_version_uq ON content_understanding_documents (material_id, version);
CREATE INDEX IF NOT EXISTS content_understanding_user_idx ON content_understanding_documents (user_id, created_at);

CREATE TABLE IF NOT EXISTS content_understanding_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL REFERENCES content_understanding_documents(id) ON DELETE CASCADE,
  page_number integer DEFAULT 1 NOT NULL,
  order_index integer DEFAULT 0 NOT NULL,
  block_type text DEFAULT 'paragraph' NOT NULL,
  heading_path jsonb DEFAULT '[]'::jsonb NOT NULL,
  content text NOT NULL,
  plain_text text NOT NULL,
  semantic_tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  confidence real DEFAULT 0 NOT NULL,
  source_ref jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS content_understanding_block_order_uq ON content_understanding_blocks (document_id, page_number, order_index);
CREATE INDEX IF NOT EXISTS content_understanding_block_doc_idx ON content_understanding_blocks (document_id, page_number);

CREATE TABLE IF NOT EXISTS content_reading_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL REFERENCES content_understanding_documents(id) ON DELETE CASCADE,
  block_id uuid REFERENCES content_understanding_blocks(id) ON DELETE SET NULL,
  order_index integer DEFAULT 0 NOT NULL,
  text text NOT NULL,
  language text DEFAULT 'zh-TW' NOT NULL,
  pronunciation_hints jsonb DEFAULT '[]'::jsonb NOT NULL,
  estimated_seconds integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS content_reading_segment_order_uq ON content_reading_segments (document_id, order_index);
CREATE INDEX IF NOT EXISTS content_reading_segment_doc_idx ON content_reading_segments (document_id, order_index);

CREATE TABLE IF NOT EXISTS tts_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES study_materials(id) ON DELETE CASCADE,
  document_id uuid REFERENCES content_understanding_documents(id) ON DELETE CASCADE,
  provider text DEFAULT 'cosyvoice' NOT NULL,
  voice text DEFAULT 'default' NOT NULL,
  language text DEFAULT 'zh-TW' NOT NULL,
  speed real DEFAULT 1 NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  progress real DEFAULT 0 NOT NULL,
  idempotency_key text NOT NULL,
  error_code text DEFAULT '' NOT NULL,
  error_message text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tts_job_idem_uq ON tts_jobs (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS tts_job_user_idx ON tts_jobs (user_id, created_at);
CREATE INDEX IF NOT EXISTS tts_job_status_idx ON tts_jobs (status, updated_at);

CREATE TABLE IF NOT EXISTS tts_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL REFERENCES tts_jobs(id) ON DELETE CASCADE,
  segment_index integer NOT NULL,
  text text NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  duration_ms integer DEFAULT 0 NOT NULL,
  error_message text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tts_segment_order_uq ON tts_segments (job_id, segment_index);
CREATE INDEX IF NOT EXISTS tts_segment_job_idx ON tts_segments (job_id, status);

-- Bots are system profiles, not account rows. No users records are created.
CREATE TABLE IF NOT EXISTS pk_bot_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  bot_key text NOT NULL,
  display_name text NOT NULL,
  avatar_url text DEFAULT '' NOT NULL,
  avatar_seed text DEFAULT 'nova-bot' NOT NULL,
  personality text DEFAULT 'friendly' NOT NULL,
  grade_levels jsonb DEFAULT '[]'::jsonb NOT NULL,
  subject_preferences jsonb DEFAULT '[]'::jsonb NOT NULL,
  difficulty text DEFAULT 'normal' NOT NULL,
  accuracy real DEFAULT 0.72 NOT NULL,
  response_min_ms integer DEFAULT 850 NOT NULL,
  response_max_ms integer DEFAULT 3200 NOT NULL,
  question_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  win_rate real DEFAULT 0 NOT NULL,
  bot_level integer DEFAULT 1 NOT NULL,
  bot_xp integer DEFAULT 0 NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pk_bot_profiles_key_uq ON pk_bot_profiles (bot_key);
CREATE INDEX IF NOT EXISTS pk_bot_profiles_active_idx ON pk_bot_profiles (enabled, difficulty);

ALTER TABLE pk_match_players ADD COLUMN IF NOT EXISTS bot_profile_id uuid;
DO $$ BEGIN
  ALTER TABLE pk_match_players ADD CONSTRAINT pk_match_players_bot_profile_fk FOREIGN KEY (bot_profile_id) REFERENCES pk_bot_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Upgrade a partially/previously applied account-backed profile schema in place.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'pk_bot_profiles'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE pk_match_players AS p
      SET bot_profile_id = b.id
      FROM pk_bot_profiles AS b
      WHERE p.role = 'bot'
        AND p.bot_profile_id IS NULL
        AND p.user_id = b.user_id
    $sql$;
    DROP INDEX IF EXISTS pk_bot_profiles_user_uq;
    ALTER TABLE pk_bot_profiles DROP COLUMN user_id CASCADE;
  END IF;
END $$;
ALTER TABLE pk_match_players ALTER COLUMN user_id DROP NOT NULL;

INSERT INTO pk_bot_profiles (bot_key, display_name, avatar_seed, personality, grade_levels, subject_preferences, difficulty, accuracy, response_min_ms, response_max_ms)
VALUES
  ('nova', 'Nova Bot', 'nova-bot', 'friendly', '["junior", "senior"]', '["英文", "國文", "數學", "自然"]', 'normal', 0.72, 850, 3200),
  ('alex', 'Alex', 'alex-bot', 'competitive', '["senior"]', '["英文", "數學"]', 'hard', 0.84, 700, 2300),
  ('mia', 'Mia', 'mia-bot', 'encouraging', '["junior", "senior"]', '["國文", "自然", "英文"]', 'easy', 0.61, 1100, 3900)
ON CONFLICT (bot_key) DO UPDATE SET display_name = EXCLUDED.display_name, enabled = true;

INSERT INTO pk_bot_profiles (bot_key, display_name, avatar_seed, personality, grade_levels, subject_preferences, difficulty, accuracy, response_min_ms, response_max_ms)
SELECT 'bot-' || i::text, 'Bot ' || i::text, 'bot-' || i::text,
       CASE WHEN i % 2 = 0 THEN 'competitive' ELSE 'friendly' END,
       '["junior", "senior"]'::jsonb, '["英文", "數學", "自然", "國文"]'::jsonb,
       CASE WHEN i % 3 = 0 THEN 'hard' WHEN i % 3 = 1 THEN 'normal' ELSE 'easy' END,
       CASE WHEN i % 3 = 0 THEN 0.82 WHEN i % 3 = 1 THEN 0.72 ELSE 0.62 END,
       800 + i * 37, 2600 + i * 83
FROM generate_series(4, 12) AS i
ON CONFLICT (bot_key) DO UPDATE SET display_name = EXCLUDED.display_name, enabled = true;

CREATE TABLE IF NOT EXISTS pk_bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  match_id uuid NOT NULL REFERENCES pk_matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES pk_match_players(id) ON DELETE CASCADE,
  bot_profile_id uuid NOT NULL REFERENCES pk_bot_profiles(id) ON DELETE CASCADE,
  state text DEFAULT 'active' NOT NULL,
  last_question_index integer DEFAULT -1 NOT NULL,
  last_action_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pk_bot_sessions_match_profile_uq ON pk_bot_sessions (match_id, bot_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS pk_bot_sessions_player_uq ON pk_bot_sessions (player_id);
CREATE INDEX IF NOT EXISTS pk_bot_sessions_state_idx ON pk_bot_sessions (state, updated_at);

CREATE TABLE IF NOT EXISTS pk_bot_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL REFERENCES pk_bot_sessions(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES pk_matches(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  question_id uuid,
  status text DEFAULT 'queued' NOT NULL,
  available_at timestamptz DEFAULT now() NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  idempotency_key text NOT NULL,
  error_message text DEFAULT '' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS pk_bot_jobs_idem_uq ON pk_bot_jobs (idempotency_key);
CREATE INDEX IF NOT EXISTS pk_bot_jobs_due_idx ON pk_bot_jobs (status, available_at);
CREATE INDEX IF NOT EXISTS pk_bot_jobs_match_idx ON pk_bot_jobs (match_id, question_index);
