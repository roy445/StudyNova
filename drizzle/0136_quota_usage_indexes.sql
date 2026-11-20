-- Migration 0136: Quota usage and feature usage performance indexes
CREATE INDEX IF NOT EXISTS "feature_usage_monthly_idx" ON "feature_usage" ("user_id", "feature", "usage_date", "count");
