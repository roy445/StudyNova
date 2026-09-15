CREATE TABLE IF NOT EXISTS "pro_renewal_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wants_renewal" boolean NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "requested_features" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "other_feedback" text NOT NULL DEFAULT '',
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pro_renewal_request_user_uq" UNIQUE ("user_id")
);
CREATE INDEX IF NOT EXISTS "pro_renewal_request_date_idx" ON "pro_renewal_requests" ("submitted_at");

CREATE TABLE IF NOT EXISTS "pro_extension_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "before_expires_at" timestamptz,
  "after_expires_at" timestamptz,
  "days" integer NOT NULL,
  "reason" text NOT NULL,
  "admin_note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pro_extension_audit_user_idx" ON "pro_extension_audits" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pro_extension_audit_admin_idx" ON "pro_extension_audits" ("admin_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "pro_activation_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" text NOT NULL UNIQUE,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "target_email" text NOT NULL DEFAULT '',
  "days" integer NOT NULL DEFAULT 3,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pro_activation_link_expiry_idx" ON "pro_activation_links" ("expires_at");
CREATE INDEX IF NOT EXISTS "pro_activation_link_target_idx" ON "pro_activation_links" ("target_user_id");
