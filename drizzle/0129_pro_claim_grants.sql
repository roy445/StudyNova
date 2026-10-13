CREATE TABLE IF NOT EXISTS "pro_claim_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "title" text NOT NULL DEFAULT '你收到一份 Nova Pro 資格',
  "days" integer NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "action" text NOT NULL DEFAULT 'grant',
  "status" text NOT NULL DEFAULT 'pending',
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "claimed_at" timestamptz,
  "expires_at" timestamptz,
  CONSTRAINT "pro_claim_grants_days_ck" CHECK ("days" BETWEEN 1 AND 3650),
  CONSTRAINT "pro_claim_grants_action_ck" CHECK ("action" IN ('grant', 'extend')),
  CONSTRAINT "pro_claim_grants_status_ck" CHECK ("status" IN ('pending', 'claimed', 'expired'))
);

CREATE INDEX IF NOT EXISTS "pro_claim_user_status_idx"
  ON "pro_claim_grants" ("user_id", "status", "granted_at");

CREATE INDEX IF NOT EXISTS "pro_claim_status_idx"
  ON "pro_claim_grants" ("status", "granted_at");
