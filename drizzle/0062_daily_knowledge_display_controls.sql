ALTER TABLE "daily_knowledge_items"
  ADD COLUMN IF NOT EXISTS "immediate_display" boolean NOT NULL DEFAULT false;
