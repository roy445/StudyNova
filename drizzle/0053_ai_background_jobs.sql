-- StudyNova large AI background jobs
-- Safe additive migration: does not alter or delete existing data.
CREATE TABLE IF NOT EXISTS public.ai_background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  feature text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  skipped_items integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 20,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  last_error_code text NOT NULL DEFAULT '',
  last_error_message text NOT NULL DEFAULT '',
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_background_job_idem_uq ON public.ai_background_jobs (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS ai_background_job_user_idx ON public.ai_background_jobs (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_background_job_status_idx ON public.ai_background_jobs (status, updated_at);

CREATE TABLE IF NOT EXISTS public.ai_background_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_background_jobs(id) ON DELETE CASCADE,
  batch_index integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  locked_by text NOT NULL DEFAULT '',
  locked_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_background_batch_order_uq ON public.ai_background_batches (job_id, batch_index);
CREATE INDEX IF NOT EXISTS ai_background_batch_status_idx ON public.ai_background_batches (status, next_run_at);

CREATE TABLE IF NOT EXISTS public.ai_background_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_background_jobs(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.ai_background_batches(id) ON DELETE CASCADE,
  item_index integer NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  idempotency_key text NOT NULL,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  latency_ms integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_background_item_idem_uq ON public.ai_background_items (job_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ai_background_item_order_uq ON public.ai_background_items (job_id, item_index);
CREATE INDEX IF NOT EXISTS ai_background_item_status_idx ON public.ai_background_items (batch_id, status);

CREATE TABLE IF NOT EXISTS public.ai_background_usage_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_background_jobs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.ai_background_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'claimed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_background_usage_claim_idem_uq ON public.ai_background_usage_claims (idempotency_key);
CREATE INDEX IF NOT EXISTS ai_background_usage_claim_job_idx ON public.ai_background_usage_claims (job_id);
