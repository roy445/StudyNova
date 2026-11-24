BEGIN;

-- This repair is for databases where the base feature quota tables were never initialized.
-- It is safe to run repeatedly and does not remove existing rows.

CREATE TABLE IF NOT EXISTS public.feature_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT '系統與其他',
  enabled boolean NOT NULL DEFAULT true,
  tester_enabled boolean NOT NULL DEFAULT false,
  tester_description text NOT NULL DEFAULT '',
  pro_only boolean NOT NULL DEFAULT false,
  free_daily_limit integer NOT NULL DEFAULT 0,
  pro_daily_limit integer NOT NULL DEFAULT 0,
  monthly_limit integer NOT NULL DEFAULT 0,
  nova_cost integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_permissions
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '系統與其他',
  ADD COLUMN IF NOT EXISTS tester_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tester_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pro_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_daily_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_daily_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nova_cost integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS feature_perm_uq
  ON public.feature_permissions (feature);

CREATE TABLE IF NOT EXISTS public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  usage_date text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  unlimited boolean NOT NULL DEFAULT false,
  CONSTRAINT feature_usage_uq UNIQUE (user_id, feature, usage_date)
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

UPDATE public.feature_permissions
SET enabled = true,
    pro_only = false,
    free_daily_limit = 1,
    pro_daily_limit = 5,
    monthly_limit = -1,
    nova_cost = 50,
    updated_at = now()
WHERE feature = 'essay_grading';

INSERT INTO public.feature_permissions
  (feature, label, enabled, pro_only, free_daily_limit, pro_daily_limit, monthly_limit, nova_cost)
VALUES
  ('essay_grading', '英文作文批改', true, false, 1, 5, -1, 50)
ON CONFLICT (feature) DO UPDATE SET
  label = EXCLUDED.label,
  enabled = EXCLUDED.enabled,
  pro_only = EXCLUDED.pro_only,
  free_daily_limit = EXCLUDED.free_daily_limit,
  pro_daily_limit = EXCLUDED.pro_daily_limit,
  monthly_limit = EXCLUDED.monthly_limit,
  nova_cost = EXCLUDED.nova_cost,
  updated_at = now();

INSERT INTO public.platform_settings (key, value)
VALUES (
  'essay_grading_service',
  '{"status":"ENABLED","proOnly":false,"novaCost":50,"dailyLimit":1,"monthlyLimit":-1,"maintenanceNotice":"","showScores":true}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(platform_settings.value, '{status}', '"ENABLED"'::jsonb),
          '{proOnly}',
          'false'::jsonb
        ),
        '{novaCost}',
        '50'::jsonb
      ),
      '{dailyLimit}',
      '1'::jsonb
    ),
    '{monthlyLimit}',
    '-1'::jsonb
  ),
  updated_at = now();

COMMIT;

-- Verification
SELECT feature, enabled, pro_only, free_daily_limit, pro_daily_limit, monthly_limit, nova_cost
FROM public.feature_permissions
WHERE feature = 'essay_grading';

SELECT key, value
FROM public.platform_settings
WHERE key = 'essay_grading_service';
