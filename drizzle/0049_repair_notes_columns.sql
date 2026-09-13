ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "template" text NOT NULL DEFAULT '自由筆記',
  ADD COLUMN IF NOT EXISTS "backlinks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "material_id" uuid REFERENCES "study_materials"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS "share_slug" text;

CREATE INDEX IF NOT EXISTS "notes_user_idx" ON "notes" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "notes_slug_uq" ON "notes" ("share_slug");
