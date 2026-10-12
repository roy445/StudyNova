CREATE TABLE IF NOT EXISTS exam_vocabulary_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  exam_label text NOT NULL DEFAULT '英文段考',
  enabled boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_vocabulary_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES exam_vocabulary_sets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_vocabulary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES exam_vocabulary_sets(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES exam_vocabulary_units(id) ON DELETE CASCADE,
  word text NOT NULL,
  meaning text NOT NULL DEFAULT '',
  part_of_speech text NOT NULL DEFAULT '',
  phonetic text NOT NULL DEFAULT '',
  phrase text NOT NULL DEFAULT '',
  phrase_meaning text NOT NULL DEFAULT '',
  example text NOT NULL DEFAULT '',
  example_zh text NOT NULL DEFAULT '',
  source_file text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_vocab_items_set_word_uq UNIQUE (set_id, word)
);

CREATE INDEX IF NOT EXISTS exam_vocab_sets_public_idx ON exam_vocabulary_sets (enabled, published, sort_order);
CREATE INDEX IF NOT EXISTS exam_vocab_units_set_idx ON exam_vocabulary_units (set_id, sort_order);
CREATE INDEX IF NOT EXISTS exam_vocab_items_unit_idx ON exam_vocabulary_items (unit_id, sort_order);
CREATE INDEX IF NOT EXISTS exam_vocab_items_set_idx ON exam_vocabulary_items (set_id, sort_order);
