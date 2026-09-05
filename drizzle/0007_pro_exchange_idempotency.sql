-- Nova Pro exchange tables and request idempotency.
-- Safe to run after the base schema; also repairs databases where 0006 was not fully applied.

CREATE TABLE IF NOT EXISTS "nova_pro_exchange_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "days" integer NOT NULL UNIQUE,
  "price_nova" integer NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "nova_pro_exchange_plans" ("days", "price_nova", "enabled")
VALUES (1, 80, true), (7, 500, true), (14, 1100, true), (30, 2600, true)
ON CONFLICT ("days") DO UPDATE SET
  "price_nova" = EXCLUDED."price_nova",
  "enabled" = EXCLUDED."enabled";

CREATE TABLE IF NOT EXISTS "nova_pro_exchange_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "days" integer NOT NULL,
  "price_nova" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "nova_pro_exchange_transactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

UPDATE "nova_pro_exchange_transactions"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "nova_pro_exchange_transactions"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "nova_pro_exchange_idempotency_uq"
  ON "nova_pro_exchange_transactions" ("idempotency_key");

CREATE INDEX IF NOT EXISTS "nova_pro_exchange_user_idx"
  ON "nova_pro_exchange_transactions" ("user_id", "created_at");

INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0007_pro_exchange_idempotency', extract(epoch from now()) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM "__drizzle_migrations"
  WHERE "hash" = '0007_pro_exchange_idempotency'
);
