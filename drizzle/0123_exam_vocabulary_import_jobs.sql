-- Create queued jobs for importing exam vocabulary files.
-- The users table uses id as its primary key (not user_id).
CREATE TABLE IF NOT EXISTS exam_vocabulary_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES exam_vocabulary_sets(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES exam_vocabulary_units(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  accepted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_vocab_import_jobs_set_idx
  ON exam_vocabulary_import_jobs (set_id, created_at);

CREATE INDEX IF NOT EXISTS exam_vocab_import_jobs_status_idx
  ON exam_vocabulary_import_jobs (status, updated_at);
