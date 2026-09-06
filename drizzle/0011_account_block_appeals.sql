ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_reason" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz;

CREATE TABLE IF NOT EXISTS "account_appeals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_no" text NOT NULL UNIQUE,
  "user_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "contact_email" text NOT NULL,
  "blocked_reason" text NOT NULL DEFAULT '',
  "knows_mistake" text NOT NULL,
  "why_chance" text NOT NULL,
  "corrective_plan" text NOT NULL,
  "additional_evidence" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "admin_note" text NOT NULL DEFAULT '',
  "handled_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "handled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "appeal_status_idx" ON "account_appeals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "appeal_user_idx" ON "account_appeals" ("user_id");
