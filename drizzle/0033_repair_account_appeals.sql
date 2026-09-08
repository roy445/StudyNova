-- Repair migration for environments where the account appeal migration was skipped
-- or was created from an older users(user_id) schema. This is additive and safe to rerun.
CREATE TABLE IF NOT EXISTS "account_appeals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_no" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "contact_email" text NOT NULL DEFAULT '',
  "blocked_reason" text NOT NULL DEFAULT '',
  "knows_mistake" text NOT NULL DEFAULT '',
  "why_chance" text NOT NULL DEFAULT '',
  "corrective_plan" text NOT NULL DEFAULT '',
  "additional_evidence" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "admin_note" text NOT NULL DEFAULT '',
  "handled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "contact_email" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "blocked_reason" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "knows_mistake" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "why_chance" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "corrective_plan" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "additional_evidence" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'open';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "admin_note" text NOT NULL DEFAULT '';
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "handled_at" timestamptz;
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "account_appeals" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "appeal_ticket_uq" ON "account_appeals" ("ticket_no");
CREATE INDEX IF NOT EXISTS "appeal_status_idx" ON "account_appeals" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "appeal_user_idx" ON "account_appeals" ("user_id");
