-- Migration 0134: Schema alignment repairs
-- Safe idempotent repair for cross-environment schema alignment.
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
