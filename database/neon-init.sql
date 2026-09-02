-- StudyNova Neon PostgreSQL initial schema
-- Generated from src/db/schema.ts by Drizzle Kit.
-- Run this file once in Neon SQL Editor. Do not commit secrets here.
-- After schema creation, deploy the app with ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME and call /api/health to run idempotent seed and create the initial owner.
-- This file creates tables, indexes, unique constraints and foreign keys only.

CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '🏅' NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"metric" text NOT NULL,
	"reward_nova" integer DEFAULT 0 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover" text DEFAULT '🎉' NOT NULL,
	"kind" text DEFAULT 'weekend_double' NOT NULL,
	"goal_metric" text DEFAULT 'minutes' NOT NULL,
	"goal_value" integer DEFAULT 60 NOT NULL,
	"reward_nova" integer DEFAULT 50 NOT NULL,
	"reward_xp" integer DEFAULT 100 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"nova" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '新的對話' NOT NULL,
	"mode" text DEFAULT 'teacher' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"context_material_id" uuid,
	"allow_context" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"action" jsonb,
	"action_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_health" (
	"provider" text PRIMARY KEY NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_until" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_category" text DEFAULT '' NOT NULL,
	"input_rate_per_million" real DEFAULT 0.1 NOT NULL,
	"output_rate_per_million" real DEFAULT 0.4 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"feature" text NOT NULL,
	"success" boolean NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"fallback_from" text DEFAULT '' NOT NULL,
	"failure_category" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"audience_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"marquee" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"response" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"due_date" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price_nova" integer DEFAULT 100 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"pro_only" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_levels" (
	"level" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"required_xp" integer NOT NULL,
	"upgrade_cost_nova" integer DEFAULT 0 NOT NULL,
	"ability" text DEFAULT '' NOT NULL,
	"aura" text DEFAULT '#38bdf8' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Novi' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"skin" text DEFAULT 'core-classic' NOT NULL,
	"effect" text DEFAULT 'none' NOT NULL,
	"voice" text DEFAULT 'default' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" text NOT NULL,
	"cost_nova" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"kind" text DEFAULT 'word' NOT NULL,
	"title" text NOT NULL,
	"quiz_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'nova' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_date" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"reward_nova" integer DEFAULT 5 NOT NULL,
	"reward_xp" integer DEFAULT 10 NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"meaning" text NOT NULL,
	"part_of_speech" text DEFAULT '' NOT NULL,
	"example" text DEFAULT '' NOT NULL,
	"example_zh" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'A2' NOT NULL,
	"week_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"target_score" real
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"exam_date" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"related_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"pro_only" boolean DEFAULT false NOT NULL,
	"free_daily_limit" integer DEFAULT 0 NOT NULL,
	"pro_daily_limit" integer DEFAULT 0 NOT NULL,
	"monthly_limit" integer DEFAULT 0 NOT NULL,
	"nova_cost" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"usage_date" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"minutes" integer NOT NULL,
	"reflection" text DEFAULT '' NOT NULL,
	"room_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"exam_name" text NOT NULL,
	"exam_type" text DEFAULT 'quiz' NOT NULL,
	"exam_date" text NOT NULL,
	"full_score" real DEFAULT 100 NOT NULL,
	"score" real NOT NULL,
	"percentage" real NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"class_average" real,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"target_score" real,
	"baseline_score" real,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'room' NOT NULL,
	"owner_id" uuid NOT NULL,
	"join_code" text NOT NULL,
	"goal_minutes" integer DEFAULT 120 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_no" text NOT NULL,
	"user_id" uuid,
	"contact_email" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'bug' NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"error_code" text DEFAULT '' NOT NULL,
	"request_id" text DEFAULT '' NOT NULL,
	"page_url" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"app_version" text DEFAULT '' NOT NULL,
	"attachment_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"handled_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"unique_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"body" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"tier" text NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"material_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'system' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_earned" integer DEFAULT 0 NOT NULL,
	"lifetime_spent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nova_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"actor_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '未命名辨識' NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"combined_text" text DEFAULT '' NOT NULL,
	"ai_result" jsonb,
	"error_message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"object_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"rotation" integer DEFAULT 0 NOT NULL,
	"crop" jsonb,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"origin" text DEFAULT 'ai' NOT NULL,
	"subject" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'junior' NOT NULL,
	"difficulty" text DEFAULT 'normal' NOT NULL,
	"type" text DEFAULT 'single' NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reward_granted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"difficulty" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"material_id" uuid,
	"week_id" uuid,
	"time_limit_sec" integer DEFAULT 600 NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sentence_id" uuid NOT NULL,
	"familiarity" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"memory_tip" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"en" text NOT NULL,
	"zh" text NOT NULL,
	"level" text DEFAULT 'A2' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"week_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" text DEFAULT 'link' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"driver" text DEFAULT 'db' NOT NULL,
	"storage_key" text NOT NULL,
	"bucket" text DEFAULT '' NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"filename" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_material_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"object_id" uuid
);
--> statement-breakpoint
CREATE TABLE "study_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_slug" text,
	"content" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" text NOT NULL,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"generated_by" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"record_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"scope" text DEFAULT 'app' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"due_date" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"unlocked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"school_level" text DEFAULT 'junior' NOT NULL,
	"grade" integer DEFAULT 1 NOT NULL,
	"daily_goal_minutes" integer DEFAULT 45 NOT NULL,
	"favorite_subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"english_level" text DEFAULT 'A2' NOT NULL,
	"daily_word_count" integer DEFAULT 10 NOT NULL,
	"reminder_time" text DEFAULT '20:00' NOT NULL,
	"ai_reminder_frequency" text DEFAULT 'normal' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nova_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_seed" text DEFAULT 'nova' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"fluency" integer DEFAULT 0 NOT NULL,
	"accuracy" integer DEFAULT 0 NOT NULL,
	"completeness" integer DEFAULT 0 NOT NULL,
	"pace" integer DEFAULT 0 NOT NULL,
	"missing_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advice" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"object_id" uuid,
	"mode" text DEFAULT 'reading' NOT NULL,
	"subject" text DEFAULT '英文' NOT NULL,
	"reference_text" text DEFAULT '' NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"question_number" integer NOT NULL,
	"answer_text" text NOT NULL,
	"matched_question_id" uuid,
	"confidence" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"object_id" uuid,
	"file_kind" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"ocr_text" text DEFAULT '' NOT NULL,
	"ocr_status" text DEFAULT 'pending' NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"ai_confidence" real DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"score" real DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"recite_completed" boolean DEFAULT false NOT NULL,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"en" text NOT NULL,
	"zh" text DEFAULT '' NOT NULL,
	"highlight_color" text DEFAULT 'blue' NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_code" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"open_mode" text DEFAULT 'schedule' NOT NULL,
	"open_days" jsonb DEFAULT '[6,0]'::jsonb NOT NULL,
	"open_time" text DEFAULT '08:00' NOT NULL,
	"close_time" text DEFAULT '23:59' NOT NULL,
	"open_from" timestamp with time zone,
	"open_until" timestamp with time zone,
	"nova_cost" integer DEFAULT 0 NOT NULL,
	"pro_only" boolean DEFAULT false NOT NULL,
	"allowed_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlight_map" jsonb DEFAULT '{"yellow":"本次考試","green":"重要","blue":"句子","pink":"單字","orange":"注意"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_exam_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"word" text NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"example" text DEFAULT '' NOT NULL,
	"highlight_color" text DEFAULT 'pink' NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"familiarity" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"memory_tip" text DEFAULT '' NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wrong_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"subject" text DEFAULT '其他' NOT NULL,
	"wrong_count" integer DEFAULT 1 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"mastery" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"ai_tip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"total_after" integer NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_rewards" ADD CONSTRAINT "activity_rewards_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_rewards" ADD CONSTRAINT "activity_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_context_material_id_study_materials_id_fk" FOREIGN KEY ("context_material_id") REFERENCES "public"."study_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_inventory" ADD CONSTRAINT "assistant_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_inventory" ADD CONSTRAINT "assistant_inventory_item_id_assistant_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."assistant_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_transactions" ADD CONSTRAINT "assistant_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_transactions" ADD CONSTRAINT "assistant_transactions_item_id_assistant_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."assistant_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage" ADD CONSTRAINT "feature_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_blocks" ADD CONSTRAINT "friend_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_blocks" ADD CONSTRAINT "friend_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_attachment_id_storage_objects_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_material_id_study_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."study_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova_accounts" ADD CONSTRAINT "nova_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova_transactions" ADD CONSTRAINT "nova_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nova_transactions" ADD CONSTRAINT "nova_transactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_pages" ADD CONSTRAINT "ocr_pages_document_id_ocr_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ocr_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_pages" ADD CONSTRAINT "ocr_pages_object_id_storage_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_material_id_study_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."study_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_progress" ADD CONSTRAINT "sentence_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_progress" ADD CONSTRAINT "sentence_progress_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_material_pages" ADD CONSTRAINT "study_material_pages_material_id_study_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."study_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_material_pages" ADD CONSTRAINT "study_material_pages_object_id_storage_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_records" ADD CONSTRAINT "study_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_analysis" ADD CONSTRAINT "voice_analysis_record_id_voice_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."voice_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_records" ADD CONSTRAINT "voice_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_records" ADD CONSTRAINT "voice_records_object_id_storage_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_transcripts" ADD CONSTRAINT "voice_transcripts_record_id_voice_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."voice_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_answers" ADD CONSTRAINT "weekly_exam_answers_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_answers" ADD CONSTRAINT "weekly_exam_answers_matched_question_id_weekly_exam_questions_id_fk" FOREIGN KEY ("matched_question_id") REFERENCES "public"."weekly_exam_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_attempts" ADD CONSTRAINT "weekly_exam_attempts_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_attempts" ADD CONSTRAINT "weekly_exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_drafts" ADD CONSTRAINT "weekly_exam_drafts_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_files" ADD CONSTRAINT "weekly_exam_files_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_files" ADD CONSTRAINT "weekly_exam_files_object_id_storage_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_questions" ADD CONSTRAINT "weekly_exam_questions_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_results" ADD CONSTRAINT "weekly_exam_results_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_results" ADD CONSTRAINT "weekly_exam_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_results" ADD CONSTRAINT "weekly_exam_results_attempt_id_weekly_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."weekly_exam_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_sentences" ADD CONSTRAINT "weekly_exam_sentences_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_exam_words" ADD CONSTRAINT "weekly_exam_words_week_id_weekly_exam_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weekly_exam_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_word_id_daily_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."daily_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrong_questions" ADD CONSTRAINT "wrong_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrong_questions" ADD CONSTRAINT "wrong_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_code_uq" ON "achievements" USING btree ("code");--> statement-breakpoint
CREATE INDEX "activities_pub_idx" ON "activities" USING btree ("published","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_part_uq" ON "activity_participants" USING btree ("activity_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_reward_uq" ON "activity_rewards" USING btree ("activity_id","user_id");--> statement-breakpoint
CREATE INDEX "admin_logs_idx" ON "admin_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_logs_actor_idx" ON "admin_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "ai_conv_user_idx" ON "ai_conversations" USING btree ("user_id","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memory_uq" ON "ai_memory" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "ai_msg_conv_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_logs_provider_idx" ON "ai_usage_logs" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "ai_logs_feature_idx" ON "ai_usage_logs" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "announcements_idx" ON "announcements" USING btree ("pinned","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_attempt_question_uq" ON "answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "assignments_user_idx" ON "assignments" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_inv_uq" ON "assistant_inventory" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_items_code_uq" ON "assistant_items" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_part_uq" ON "challenge_participants" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "challenge_creator_idx" ON "challenges" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redeem_uq" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_task_uq" ON "daily_tasks" USING btree ("user_id","task_date","code");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_words_uq" ON "daily_words" USING btree ("word","level");--> statement-breakpoint
CREATE INDEX "daily_words_week_idx" ON "daily_words" USING btree ("week_id");--> statement-breakpoint
CREATE INDEX "exam_subjects_exam_idx" ON "exam_subjects" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exams_user_idx" ON "exams" USING btree ("user_id","exam_date");--> statement-breakpoint
CREATE UNIQUE INDEX "faq_slug_uq" ON "faq_entries" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "faq_cat_idx" ON "faq_entries" USING btree ("category","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_perm_uq" ON "feature_permissions" USING btree ("feature");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_usage_uq" ON "feature_usage" USING btree ("user_id","feature","usage_date");--> statement-breakpoint
CREATE INDEX "focus_user_idx" ON "focus_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_block_uq" ON "friend_blocks" USING btree ("user_id","blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_req_uq" ON "friend_requests" USING btree ("from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "friend_req_to_idx" ON "friend_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friends_uq" ON "friends" USING btree ("user_id","friend_id");--> statement-breakpoint
CREATE INDEX "gr_user_subject_idx" ON "grade_records" USING btree ("user_id","subject");--> statement-breakpoint
CREATE INDEX "gr_user_date_idx" ON "grade_records" USING btree ("user_id","exam_date");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_user_subject_uq" ON "grades" USING btree ("user_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_code_uq" ON "groups" USING btree ("join_code");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_ticket_uq" ON "issue_reports" USING btree ("ticket_no");--> statement-breakpoint
CREATE INDEX "issue_status_idx" ON "issue_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "issue_user_idx" ON "issue_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_code_idx" ON "issue_reports" USING btree ("error_code");--> statement-breakpoint
CREATE UNIQUE INDEX "job_unique_uq" ON "job_queue" USING btree ("unique_key");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "job_queue" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "membership_hist_user_idx" ON "membership_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_user_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_slug_uq" ON "notes" USING btree ("share_slug");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notif_dedupe_uq" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "nova_tx_idem_uq" ON "nova_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "nova_tx_user_idx" ON "nova_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ocr_docs_user_idx" ON "ocr_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ocr_pages_doc_idx" ON "ocr_pages" USING btree ("document_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "prt_token_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_fingerprint_uq" ON "questions" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "questions_subject_idx" ON "questions" USING btree ("subject","difficulty");--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_quiz_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quizzes_user_idx" ON "quizzes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_slug_uq" ON "quizzes" USING btree ("share_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_uq" ON "rate_limits" USING btree ("bucket","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "sentence_progress_uq" ON "sentence_progress" USING btree ("user_id","sentence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sentences_uq" ON "sentences" USING btree ("en");--> statement-breakpoint
CREATE INDEX "sentences_week_idx" ON "sentences" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_slug_uq" ON "shares" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "shares_user_idx" ON "shares" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_key_uq" ON "storage_objects" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "storage_user_idx" ON "storage_objects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mat_pages_idx" ON "study_material_pages" USING btree ("material_id","page_number");--> statement-breakpoint
CREATE INDEX "materials_user_idx" ON "study_materials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_slug_uq" ON "study_materials" USING btree ("share_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_user_date_uq" ON "study_plans" USING btree ("user_id","plan_date");--> statement-breakpoint
CREATE INDEX "study_records_user_date_idx" ON "study_records" USING btree ("user_id","record_date");--> statement-breakpoint
CREATE INDEX "system_logs_idx" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ach_uq" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_nova_id_uq" ON "users" USING btree ("nova_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "voice_user_idx" ON "voice_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "week_ans_idx" ON "weekly_exam_answers" USING btree ("week_id","question_number");--> statement-breakpoint
CREATE INDEX "week_attempt_idx" ON "weekly_exam_attempts" USING btree ("week_id","user_id");--> statement-breakpoint
CREATE INDEX "week_draft_idx" ON "weekly_exam_drafts" USING btree ("week_id","status");--> statement-breakpoint
CREATE INDEX "week_files_idx" ON "weekly_exam_files" USING btree ("week_id","file_kind","order_index");--> statement-breakpoint
CREATE INDEX "week_q_idx" ON "weekly_exam_questions" USING btree ("week_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "week_result_uq" ON "weekly_exam_results" USING btree ("week_id","user_id");--> statement-breakpoint
CREATE INDEX "week_sent_idx" ON "weekly_exam_sentences" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weeks_code_uq" ON "weekly_exam_weeks" USING btree ("week_code");--> statement-breakpoint
CREATE INDEX "weeks_status_idx" ON "weekly_exam_weeks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "week_words_idx" ON "weekly_exam_words" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_progress_uq" ON "word_progress" USING btree ("user_id","word_id");--> statement-breakpoint
CREATE INDEX "word_progress_next_idx" ON "word_progress" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wq_user_question_uq" ON "wrong_questions" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "wq_user_next_idx" ON "wrong_questions" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_tx_idem_uq" ON "xp_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "xp_tx_user_idx" ON "xp_transactions" USING btree ("user_id");