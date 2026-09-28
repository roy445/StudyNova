-- Some production baselines created focus_sessions without completed_at.
-- 0088 changes the column to nullable, so create it first when it is missing.
-- Safe to run repeatedly and preserves existing rows without inventing timestamps.
ALTER TABLE focus_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
