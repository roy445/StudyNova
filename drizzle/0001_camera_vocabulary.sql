CREATE TABLE IF NOT EXISTS "user_vocabularies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "word" text NOT NULL,
  "normalized_word" text NOT NULL,
  "part_of_speech" text DEFAULT '' NOT NULL,
  "meaning" text DEFAULT '' NOT NULL,
  "phonetic" text DEFAULT '' NOT NULL,
  "example" text DEFAULT '' NOT NULL,
  "example_zh" text DEFAULT '' NOT NULL,
  "analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_document_id" uuid REFERENCES "ocr_documents"("id") ON DELETE SET NULL,
  "source_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "familiarity" integer DEFAULT 0 NOT NULL,
  "review_count" integer DEFAULT 0 NOT NULL,
  "last_reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_vocabularies_word_uq" ON "user_vocabularies" ("user_id", "normalized_word");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vocabularies_user_idx" ON "user_vocabularies" ("user_id", "updated_at");
