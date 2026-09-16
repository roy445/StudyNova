CREATE TABLE IF NOT EXISTS "referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invitee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "share_id" uuid REFERENCES "shares"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'clicked',
  "qualified_at" timestamptz,
  "rewarded_at" timestamptz,
  "reward_nova" integer NOT NULL DEFAULT 0,
  "reward_xp" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "referral_not_self_ck" CHECK ("inviter_id" <> "invitee_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_pair_uq" ON "referrals" ("inviter_id", "invitee_id");
CREATE INDEX IF NOT EXISTS "referral_inviter_idx" ON "referrals" ("inviter_id", "created_at");
CREATE TABLE IF NOT EXISTS "referral_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referral_id" uuid NOT NULL REFERENCES "referrals"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "referral_event_uq" UNIQUE ("referral_id", "event_type")
);
CREATE TABLE IF NOT EXISTS "software_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" text NOT NULL,
  "previous_version" text NOT NULL DEFAULT '',
  "release_type" text NOT NULL DEFAULT 'PATCH',
  "title" text NOT NULL,
  "subtitle" text NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "release_notes" text NOT NULL DEFAULT '',
  "new_features" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "improvements" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bug_fixes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "breaking_changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "migration_required" boolean NOT NULL DEFAULT false,
  "minimum_supported_version" text NOT NULL DEFAULT '1.0.0',
  "released_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "software_release_version_uq" ON "software_releases" ("version");
CREATE INDEX IF NOT EXISTS "software_release_status_idx" ON "software_releases" ("status", "released_at");
