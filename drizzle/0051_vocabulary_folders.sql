CREATE TABLE IF NOT EXISTS "vocabulary_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vocabulary_folders_user_name_uq" ON "vocabulary_folders" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "vocabulary_folders_user_idx" ON "vocabulary_folders" ("user_id", "updated_at");
CREATE TABLE IF NOT EXISTS "vocabulary_folder_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "folder_id" uuid NOT NULL REFERENCES "vocabulary_folders"("id") ON DELETE CASCADE,
  "vocabulary_id" uuid NOT NULL REFERENCES "user_vocabularies"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vocabulary_folder_items_uq" ON "vocabulary_folder_items" ("folder_id", "vocabulary_id");
CREATE INDEX IF NOT EXISTS "vocabulary_folder_items_folder_idx" ON "vocabulary_folder_items" ("folder_id");
CREATE INDEX IF NOT EXISTS "vocabulary_folder_items_vocab_idx" ON "vocabulary_folder_items" ("vocabulary_id");
