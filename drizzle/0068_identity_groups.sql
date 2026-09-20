CREATE TABLE IF NOT EXISTS "identity_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "badge" text NOT NULL DEFAULT '身分',
  "color" text NOT NULL DEFAULT '#37d3ff',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "identity_groups_name_uq" ON "identity_groups" ("name");
CREATE INDEX IF NOT EXISTS "identity_groups_enabled_idx" ON "identity_groups" ("enabled");

CREATE TABLE IF NOT EXISTS "identity_group_members" (
  "identity_group_id" uuid NOT NULL REFERENCES "identity_groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "added_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("identity_group_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "identity_group_members_user_idx" ON "identity_group_members" ("user_id");
CREATE INDEX IF NOT EXISTS "identity_group_members_group_idx" ON "identity_group_members" ("identity_group_id");

ALTER TABLE "weekly_exam_weeks" ADD COLUMN IF NOT EXISTS "allowed_identity_group_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
