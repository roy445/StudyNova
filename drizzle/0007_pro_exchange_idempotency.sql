-- Nova Pro exchange request idempotency
ALTER TABLE "nova_pro_exchange_transactions"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

UPDATE "nova_pro_exchange_transactions"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "nova_pro_exchange_transactions"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "nova_pro_exchange_idempotency_uq"
  ON "nova_pro_exchange_transactions" ("idempotency_key");

INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0007_pro_exchange_idempotency', extract(epoch from now()) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM "__drizzle_migrations"
  WHERE "hash" = '0007_pro_exchange_idempotency'
);

-- Neon 線上執行：本 migration 可重複執行。
-- 注意：若 0006 尚未執行，請先執行 drizzle/0006_profile_frame.sql。
