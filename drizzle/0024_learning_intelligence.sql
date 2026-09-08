CREATE TABLE IF NOT EXISTS "learning_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" uuid,
  "concept_id" uuid,
  "session_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "duration_sec" integer DEFAULT 0 NOT NULL,
  "response_time_ms" integer DEFAULT 0 NOT NULL,
  "correct" boolean,
  "hint_used" boolean DEFAULT false NOT NULL,
  "confidence" integer,
  "source" text DEFAULT 'app' NOT NULL,
  "idempotency_key" text DEFAULT '' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_user_time_idx" ON "learning_events" ("user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_object_idx" ON "learning_events" ("object_type", "object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_concept_idx" ON "learning_events" ("concept_id", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learning_events_idempotency_uq" ON "learning_events" ("user_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "content_type" text NOT NULL,
  "content_id" uuid NOT NULL,
  "concept_id" uuid,
  "state" text DEFAULT 'new' NOT NULL,
  "due_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_reviewed_at" timestamp with time zone,
  "stability" real DEFAULT 0 NOT NULL,
  "difficulty" real DEFAULT 0 NOT NULL,
  "retrievability" real DEFAULT 0 NOT NULL,
  "reps" integer DEFAULT 0 NOT NULL,
  "lapses" integer DEFAULT 0 NOT NULL,
  "last_rating" text DEFAULT '' NOT NULL,
  "source_evidence_id" uuid,
  "suspended_reason" text DEFAULT '' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_items_user_content_uq" ON "review_items" ("user_id", "content_type", "content_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_items_due_idx" ON "review_items" ("user_id", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_items_concept_idx" ON "review_items" ("user_id", "concept_id");
