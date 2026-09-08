ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "template" text DEFAULT '自由筆記' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "backlinks" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" text DEFAULT '其他' NOT NULL,
  "title" text NOT NULL,
  "kind" text DEFAULT 'concept' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "mastery" integer DEFAULT 0 NOT NULL,
  "source_type" text DEFAULT 'manual' NOT NULL,
  "source_id" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_nodes_user_subject_idx" ON "knowledge_nodes" ("user_id", "subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_nodes_user_kind_idx" ON "knowledge_nodes" ("user_id", "kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_node_id" uuid NOT NULL REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE,
  "to_node_id" uuid NOT NULL REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE,
  "relation" text DEFAULT 'related' NOT NULL,
  "weight" real DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_edges_uq" ON "knowledge_edges" ("user_id", "from_node_id", "to_node_id", "relation");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_edges_from_idx" ON "knowledge_edges" ("user_id", "from_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_edges_to_idx" ON "knowledge_edges" ("user_id", "to_node_id");
