import { sql } from "drizzle-orm";
import { db } from "@/db";

let identitySchemaPromise: Promise<void> | null = null;
let identitySchemaRetryAfter = 0;

/**
 * The app is deployed on platforms where a Git push does not necessarily run
 * Drizzle migrations. This idempotent preflight keeps the additive identity
 * group feature compatible while the migration is being applied manually.
 */
export function ensureIdentityGroupSchema() {
  if (identitySchemaRetryAfter > Date.now()) return Promise.resolve();
  if (!identitySchemaPromise) {
    const query = db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS "identity_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "badge" text NOT NULL DEFAULT '身分',
        "color" text NOT NULL DEFAULT '#37d3ff',
        "enabled" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "identity_groups_name_uq" ON "identity_groups" ("name");
      CREATE INDEX IF NOT EXISTS "identity_groups_enabled_idx" ON "identity_groups" ("enabled");
      CREATE TABLE IF NOT EXISTS "identity_group_members" (
        "identity_group_id" uuid NOT NULL REFERENCES "identity_groups"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("identity_group_id", "user_id")
      );
      CREATE INDEX IF NOT EXISTS "identity_group_members_user_idx" ON "identity_group_members" ("user_id");
      CREATE INDEX IF NOT EXISTS "identity_group_members_group_idx" ON "identity_group_members" ("identity_group_id");
      ALTER TABLE "weekly_exam_weeks" ADD COLUMN IF NOT EXISTS "allowed_identity_group_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE "exam_hubs" ADD COLUMN IF NOT EXISTS "target_score" integer NOT NULL DEFAULT 60;
      ALTER TABLE "exam_hubs" ADD COLUMN IF NOT EXISTS "formal_scope" jsonb NOT NULL DEFAULT '{"educationLevel":"","schoolName":"","grade":1,"subject":"","examNumber":"","chapters":[],"units":[],"vocabularyRange":[],"questionTypes":[],"difficulty":"normal"}'::jsonb;
      ALTER TABLE "exam_hubs" ADD COLUMN IF NOT EXISTS "question_bank_id" uuid;
      CREATE TABLE IF NOT EXISTS "pro_renewal_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "wants_renewal" boolean NOT NULL,
        "reason" text NOT NULL DEFAULT '',
        "requested_features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "other_feedback" text NOT NULL DEFAULT '',
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pro_renewal_request_user_uq" UNIQUE ("user_id")
      );
      CREATE INDEX IF NOT EXISTS "pro_renewal_request_date_idx" ON "pro_renewal_requests" ("submitted_at");
      ALTER TABLE "system_logs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
      CREATE INDEX IF NOT EXISTS "system_logs_user_idx" ON "system_logs" ("user_id", "created_at");
    `));
    identitySchemaPromise = Promise.race([
      query.then(() => undefined),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("identity schema preflight timeout")), 8_000)),
    ]).catch((error) => {
      identitySchemaPromise = null;
      identitySchemaRetryAfter = Date.now() + 30_000;
      throw error;
    });
  }
  return identitySchemaPromise;
}
