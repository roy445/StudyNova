CREATE SEQUENCE IF NOT EXISTS software_release_version_code_seq;

ALTER TABLE software_releases
  ADD COLUMN IF NOT EXISTS version_code integer,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS migration_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_error_log text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS migration_updated_by uuid;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id)::integer AS code
  FROM software_releases
  WHERE version_code IS NULL
)
UPDATE software_releases AS releases
SET version_code = ranked.code
FROM ranked
WHERE releases.id = ranked.id;

SELECT setval('software_release_version_code_seq', COALESCE((SELECT MAX(version_code) FROM software_releases), 0) + 1, false);
ALTER TABLE software_releases ALTER COLUMN version_code SET DEFAULT nextval('software_release_version_code_seq');
ALTER TABLE software_releases ALTER COLUMN version_code SET NOT NULL;
ALTER SEQUENCE software_release_version_code_seq OWNED BY software_releases.version_code;

UPDATE software_releases
SET migration_status = CASE WHEN migration_required THEN 'PENDING' ELSE 'NOT_REQUIRED' END
WHERE migration_status = 'NOT_REQUIRED' AND migration_required = true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_releases_published_by_fk') THEN
    ALTER TABLE software_releases ADD CONSTRAINT software_releases_published_by_fk FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'software_releases_migration_updated_by_fk') THEN
    ALTER TABLE software_releases ADD CONSTRAINT software_releases_migration_updated_by_fk FOREIGN KEY (migration_updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS software_release_version_code_uq ON software_releases(version_code);
CREATE INDEX IF NOT EXISTS software_release_schedule_idx ON software_releases(status, scheduled_at);

CREATE TABLE IF NOT EXISTS client_version_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  app_version text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_version_session_uq UNIQUE(user_id, session_hash)
);
CREATE INDEX IF NOT EXISTS client_version_sessions_version_seen_idx ON client_version_sessions(app_version, last_seen_at);

CREATE TABLE IF NOT EXISTS feature_version_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  feature_name text NOT NULL,
  required_version text NOT NULL DEFAULT '1.0.0',
  minimum_version text NOT NULL DEFAULT '1.0.0',
  enabled boolean NOT NULL DEFAULT true,
  release_status text NOT NULL DEFAULT 'DRAFT',
  release_date timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_version_gate_key_uq UNIQUE(feature_key)
);
CREATE INDEX IF NOT EXISTS feature_version_gate_status_idx ON feature_version_gates(release_status, enabled);
