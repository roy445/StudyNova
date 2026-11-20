-- Migration 0135: ECPay and payment transaction fields
CREATE TABLE IF NOT EXISTS "payment_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "provider" text NOT NULL DEFAULT 'ecpay',
  "product_code" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'TWD',
  "amount_minor" integer NOT NULL,
  "nova_amount" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "idempotency_key" text,
  "provider_checkout_id" text,
  "provider_payment_intent_id" text,
  "provider_trade_no" text,
  "provider_transaction_no" text,
  "payment_type" text,
  "payment_info" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "provider_paid_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "paid_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'ecpay',
  "provider_event_id" text,
  "event_type" text NOT NULL,
  "payload_hash" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'received',
  "failure_reason" text NOT NULL DEFAULT '',
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payment_orders_user_idx" ON "payment_orders" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_orders_status_idx" ON "payment_orders" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "payment_events_status_idx" ON "payment_events" ("status", "created_at");
