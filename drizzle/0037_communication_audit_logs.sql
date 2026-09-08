CREATE TABLE IF NOT EXISTS "link_generation_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "target_type" text NOT NULL DEFAULT 'user',
  "target_id" uuid,
  "recipient" text NOT NULL DEFAULT '',
  "url" text NOT NULL,
  "code" text NOT NULL DEFAULT '',
  "value" integer,
  "expires_at" timestamptz,
  "reason" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "link_logs_created_idx" ON "link_generation_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "link_logs_kind_idx" ON "link_generation_logs" ("kind");

CREATE TABLE IF NOT EXISTS "email_message_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recipient" text NOT NULL,
  "display_name" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'system',
  "subject" text NOT NULL,
  "text_body" text NOT NULL DEFAULT '',
  "html_body" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "provider_message_id" text NOT NULL DEFAULT '',
  "error" text NOT NULL DEFAULT '',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "email_logs_created_idx" ON "email_message_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "email_logs_recipient_idx" ON "email_message_logs" ("recipient");
