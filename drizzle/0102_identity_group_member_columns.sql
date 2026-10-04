-- Backfill columns for identity group tables created by an older deployment.
-- Safe to run repeatedly on production databases.
ALTER TABLE "identity_group_members"
  ADD COLUMN IF NOT EXISTS "added_by" uuid;

ALTER TABLE "identity_group_members"
  ADD COLUMN IF NOT EXISTS "joined_at" timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'identity_group_members_added_by_users_fk'
  ) THEN
    ALTER TABLE "identity_group_members"
      ADD CONSTRAINT "identity_group_members_added_by_users_fk"
      FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
