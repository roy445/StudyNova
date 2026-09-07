-- StudyNova word detail content and AI cache
ALTER TABLE daily_words
  ADD COLUMN IF NOT EXISTS english_definition text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS us_phonetic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uk_phonetic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS us_audio_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uk_audio_url text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS word_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
  word text NOT NULL,
  meaning text NOT NULL DEFAULT '',
  part_of_speech text NOT NULL DEFAULT '',
  difference text NOT NULL DEFAULT '',
  usage text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_synonyms_word_idx ON word_synonyms(word_id);

CREATE TABLE IF NOT EXISTS word_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
  english text NOT NULL,
  chinese text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT '一般',
  source_kind text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_examples_word_idx ON word_examples(word_id);

CREATE TABLE IF NOT EXISTS word_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  meaning text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_phrases_word_idx ON word_phrases(word_id);

CREATE TABLE IF NOT EXISTS word_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
  form text NOT NULL,
  part_of_speech text NOT NULL DEFAULT '',
  meaning text NOT NULL DEFAULT '',
  source_kind text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_forms_word_idx ON word_forms(word_id);

CREATE TABLE IF NOT EXISTS word_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL REFERENCES daily_words(id) ON DELETE CASCADE,
  explanation text NOT NULL,
  source_kind text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_explanations_word_idx ON word_explanations(word_id);

CREATE TABLE IF NOT EXISTS word_ai_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id uuid NOT NULL UNIQUE REFERENCES daily_words(id) ON DELETE CASCADE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL DEFAULT '',
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS word_ai_contents_word_uq ON word_ai_contents(word_id);
