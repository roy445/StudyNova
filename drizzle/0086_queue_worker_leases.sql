-- Recover queue rows left in `running` when a serverless worker is terminated.
-- Additive and safe to re-run during rolling deployments.
ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE INDEX IF NOT EXISTS job_queue_running_lease_idx
  ON job_queue (started_at)
  WHERE status = 'running';
