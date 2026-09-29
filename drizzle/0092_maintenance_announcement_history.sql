CREATE TABLE IF NOT EXISTS maintenance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'maintenance' CHECK (category IN ('maintenance', 'repair', 'major_release')),
  title text NOT NULL,
  reason text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  badge_text text NOT NULL DEFAULT '',
  notice text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  estimated_recovery_at timestamptz,
  ended_at timestamptz,
  actual_recovery_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_history_started_idx ON maintenance_history(started_at DESC);
CREATE INDEX IF NOT EXISTS maintenance_history_open_idx ON maintenance_history(ended_at) WHERE ended_at IS NULL;
