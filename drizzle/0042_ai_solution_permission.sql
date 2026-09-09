-- AI solution quota and idempotency repair for PostgreSQL production.
-- Safe to run repeatedly. Existing feature permission values are never overwritten.
CREATE TABLE IF NOT EXISTS "feature_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature" text NOT NULL,
  "label" text NOT NULL,
  "category" text NOT NULL DEFAULT '系統與其他',
  "enabled" boolean NOT NULL DEFAULT true,
  "pro_only" boolean NOT NULL DEFAULT false,
  "free_daily_limit" integer NOT NULL DEFAULT 0,
  "pro_daily_limit" integer NOT NULL DEFAULT 0,
  "monthly_limit" integer NOT NULL DEFAULT 0,
  "nova_cost" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "feature_perm_uq" UNIQUE ("feature")
);

CREATE TABLE IF NOT EXISTS "feature_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "feature" text NOT NULL,
  "usage_date" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "unlimited" boolean NOT NULL DEFAULT false,
  CONSTRAINT "feature_usage_uq" UNIQUE ("user_id", "feature", "usage_date")
);

CREATE TABLE IF NOT EXISTS "solution_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "mode" text NOT NULL DEFAULT 'tutor',
  "mode_locked" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "file_context_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "result" jsonb,
  "nova_cost" integer NOT NULL DEFAULT 0,
  "charged" boolean NOT NULL DEFAULT false,
  "idempotency_key" text NOT NULL DEFAULT '',
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "solution_sessions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text NOT NULL DEFAULT '';

-- Existing legacy rows had no request key; give them stable non-empty values
-- before creating the uniqueness guarantee for new requests.
UPDATE "solution_sessions"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "solution_session_idem_uq"
  ON "solution_sessions" ("user_id", "idempotency_key");

INSERT INTO "feature_permissions"
  ("feature", "label", "enabled", "pro_only", "free_daily_limit", "pro_daily_limit", "monthly_limit", "nova_cost")
VALUES
  ('ai_solution', 'AI 解題初次分析', true, false, 3, 30, 0, 10)
ON CONFLICT ("feature") DO NOTHING;
