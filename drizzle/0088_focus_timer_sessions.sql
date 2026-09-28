-- Make focus timer events server-authoritative while preserving historical rows.
ALTER TABLE focus_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS planned_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS reward_granted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS study_recorded boolean NOT NULL DEFAULT true;

ALTER TABLE focus_sessions ALTER COLUMN completed_at DROP DEFAULT;
ALTER TABLE focus_sessions ALTER COLUMN completed_at DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS focus_one_active_per_user_uq
  ON focus_sessions (user_id)
  WHERE status IN ('running', 'paused');
