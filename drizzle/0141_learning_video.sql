CREATE TABLE IF NOT EXISTS "learning_videos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "title" text NOT NULL, "description" text NOT NULL DEFAULT '',
  "subject" text NOT NULL DEFAULT '英文', "chapter" text NOT NULL DEFAULT '',
  "cover_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "video_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft', "pro_only" boolean NOT NULL DEFAULT true,
  "published_at" timestamptz, "created_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "learning_videos_status_idx" ON "learning_videos" ("status", "published_at");
CREATE INDEX IF NOT EXISTS "learning_videos_subject_idx" ON "learning_videos" ("subject", "chapter");
CREATE TABLE IF NOT EXISTS "learning_video_trial_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "video_id" uuid NOT NULL REFERENCES "learning_videos"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL UNIQUE, "code_last4" text NOT NULL, "expires_at" timestamptz,
  "max_uses" integer NOT NULL DEFAULT 1, "used_count" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("user_id") ON DELETE SET NULL, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "learning_video_trial_code_video_idx" ON "learning_video_trial_codes" ("video_id", "enabled");
CREATE TABLE IF NOT EXISTS "learning_video_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "code_id" uuid NOT NULL REFERENCES "learning_video_trial_codes"("id") ON DELETE CASCADE,
  "video_id" uuid NOT NULL REFERENCES "learning_videos"("id") ON DELETE CASCADE, "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "redeemed_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("user_id", "video_id")
);
CREATE INDEX IF NOT EXISTS "learning_video_redemption_code_idx" ON "learning_video_redemptions" ("code_id", "redeemed_at");
CREATE TABLE IF NOT EXISTS "learning_video_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "video_id" uuid NOT NULL REFERENCES "learning_videos"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE, "source" text NOT NULL,
  "last_authorized_at" timestamptz NOT NULL DEFAULT now(), "created_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("user_id", "video_id")
);
CREATE INDEX IF NOT EXISTS "learning_video_authorization_user_idx" ON "learning_video_authorizations" ("user_id", "last_authorized_at");
CREATE TABLE IF NOT EXISTS "learning_video_watch_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "video_id" uuid NOT NULL REFERENCES "learning_videos"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE, "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_heartbeat_at" timestamptz NOT NULL DEFAULT now(), "watched_seconds" integer NOT NULL DEFAULT 0, "completed" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "learning_video_watch_user_idx" ON "learning_video_watch_logs" ("user_id", "started_at");
CREATE INDEX IF NOT EXISTS "learning_video_watch_video_idx" ON "learning_video_watch_logs" ("video_id", "started_at");
