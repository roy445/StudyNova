-- Identity group member columns are applied as a migration, not during every API request.
ALTER TABLE "identity_group_members"
  ADD COLUMN IF NOT EXISTS "added_by" uuid,
  ADD COLUMN IF NOT EXISTS "joined_at" timestamptz NOT NULL DEFAULT now();
