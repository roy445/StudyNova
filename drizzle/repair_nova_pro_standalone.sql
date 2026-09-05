-- StudyNova Nova Pro standalone repair
-- 請在 Neon SQL Editor 一次完整執行本檔案，不要分段執行。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.nova_pro_exchange_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  days integer NOT NULL UNIQUE,
  price_nova integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nova_pro_exchange_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  days integer NOT NULL,
  price_nova integer NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nova_pro_exchange_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.nova_pro_exchange_transactions
SET idempotency_key = 'legacy:' || id::text
WHERE idempotency_key IS NULL OR idempotency_key = '';

ALTER TABLE public.nova_pro_exchange_transactions
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS nova_pro_exchange_idempotency_uq
  ON public.nova_pro_exchange_transactions (idempotency_key);

CREATE INDEX IF NOT EXISTS nova_pro_exchange_user_idx
  ON public.nova_pro_exchange_transactions (user_id, created_at);

INSERT INTO public.nova_pro_exchange_plans (days, price_nova, enabled)
VALUES
  (1, 80, true),
  (7, 500, true),
  (14, 1100, true),
  (30, 2600, true)
ON CONFLICT (days) DO UPDATE SET
  price_nova = EXCLUDED.price_nova,
  enabled = EXCLUDED.enabled;

SELECT
  to_regclass('public.nova_pro_exchange_plans') AS plans_table,
  to_regclass('public.nova_pro_exchange_transactions') AS transactions_table,
  (SELECT count(*) FROM public.nova_pro_exchange_plans) AS plan_count;
