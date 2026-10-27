CREATE TABLE IF NOT EXISTS "english_reading_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "source_kind" text NOT NULL DEFAULT 'text',
  "source_object_id" uuid,
  "original_text" text NOT NULL DEFAULT '',
  "summary" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'ready',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "english_reader_documents_user_idx" ON "english_reading_documents" ("user_id", "updated_at");
CREATE TABLE IF NOT EXISTS "english_reading_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "english_reading_documents"("id") ON DELETE CASCADE,
  "item_type" text NOT NULL DEFAULT 'vocabulary',
  "order_index" integer NOT NULL DEFAULT 0,
  "word" text NOT NULL DEFAULT '',
  "meaning" text NOT NULL DEFAULT '',
  "part_of_speech" text NOT NULL DEFAULT '',
  "phonetic" text NOT NULL DEFAULT '',
  "sentence" text NOT NULL DEFAULT '',
  "sentence_zh" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "english_reader_items_document_idx" ON "english_reading_items" ("document_id", "item_type", "order_index");
