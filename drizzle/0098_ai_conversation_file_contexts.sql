CREATE TABLE IF NOT EXISTS "ai_conversation_file_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "file_context_id" uuid NOT NULL REFERENCES "file_contexts"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_conv_file_context_uq" UNIQUE ("conversation_id", "file_context_id")
);
CREATE INDEX IF NOT EXISTS "ai_conv_file_context_conv_idx" ON "ai_conversation_file_contexts" ("conversation_id", "created_at");
