CREATE TABLE IF NOT EXISTS "tester_feedback_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text NOT NULL DEFAULT '心得',
  "status" text NOT NULL DEFAULT 'open',
  "pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tester_feedback_posts_created_idx" ON "tester_feedback_posts" ("created_at");
CREATE INDEX IF NOT EXISTS "tester_feedback_posts_status_idx" ON "tester_feedback_posts" ("status", "pinned", "updated_at");

CREATE TABLE IF NOT EXISTS "tester_feedback_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "tester_feedback_posts"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "tester_feedback_comments_post_idx" ON "tester_feedback_comments" ("post_id", "created_at");
