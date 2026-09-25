-- Online PK domain. Answers and scoring are server-authoritative; clients never receive canonical answers.
CREATE TABLE IF NOT EXISTS "pk_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid,
  "owner_id" uuid NOT NULL,
  "status" text DEFAULT 'waiting' NOT NULL,
  "mode" text DEFAULT '1v1' NOT NULL,
  "team_mode" text DEFAULT 'solo' NOT NULL,
  "subject" text DEFAULT '英文' NOT NULL,
  "grade" text DEFAULT '' NOT NULL,
  "unit" text DEFAULT '' NOT NULL,
  "difficulty" text DEFAULT 'normal' NOT NULL,
  "question_count" integer DEFAULT 10 NOT NULL,
  "question_time_sec" integer DEFAULT 30 NOT NULL,
  "current_question" integer DEFAULT 0 NOT NULL,
  "allow_late_join" boolean DEFAULT false NOT NULL,
  "allow_spectators" boolean DEFAULT false NOT NULL,
  "show_ranking" boolean DEFAULT true NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "event_seq" integer DEFAULT 0 NOT NULL,
  "reward_nova" integer DEFAULT 20 NOT NULL,
  "reward_xp" integer DEFAULT 40 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid,
  "room_code" text NOT NULL,
  "share_token" text NOT NULL,
  "name" text NOT NULL,
  "visibility" text DEFAULT 'public' NOT NULL,
  "password_hash" text DEFAULT '' NOT NULL,
  "max_players" integer DEFAULT 2 NOT NULL,
  "mode" text DEFAULT '1v1' NOT NULL,
  "team_mode" text DEFAULT 'solo' NOT NULL,
  "allow_late_join" boolean DEFAULT false NOT NULL,
  "allow_spectators" boolean DEFAULT false NOT NULL,
  "show_ranking" boolean DEFAULT true NOT NULL,
  "host_id" uuid NOT NULL,
  "status" text DEFAULT 'waiting' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#37d3ff' NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "rank" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_match_players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "team_id" uuid,
  "role" text DEFAULT 'player' NOT NULL,
  "connection_state" text DEFAULT 'connected' NOT NULL,
  "option_orders" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "combo" integer DEFAULT 0 NOT NULL,
  "max_combo" integer DEFAULT 0 NOT NULL,
  "correct_count" integer DEFAULT 0 NOT NULL,
  "answered_count" integer DEFAULT 0 NOT NULL,
  "total_response_ms" integer DEFAULT 0 NOT NULL,
  "fastest_response_ms" integer,
  "rank" integer,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "current_question_started_at" timestamp with time zone,
  "finished_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "pk_match_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "order_index" integer NOT NULL,
  "type" text DEFAULT 'single' NOT NULL,
  "stem" text NOT NULL,
  "canonical_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "canonical_answer" text NOT NULL,
  "explanation" text DEFAULT '' NOT NULL,
  "source_label" text DEFAULT '' NOT NULL,
  "unit" text DEFAULT '' NOT NULL,
  "fingerprint" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_player_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "question_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "selected_option" text NOT NULL,
  "response_ms" integer DEFAULT 0 NOT NULL,
  "is_correct" boolean DEFAULT false NOT NULL,
  "score_awarded" integer DEFAULT 0 NOT NULL,
  "combo_after" integer DEFAULT 0 NOT NULL,
  "idempotency_key" text NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_match_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "combo" integer DEFAULT 0 NOT NULL,
  "correct_count" integer DEFAULT 0 NOT NULL,
  "answered_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_match_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "event_type" text NOT NULL,
  "user_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_matchmaking_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "match_type" text DEFAULT '1v1' NOT NULL,
  "subject" text DEFAULT '英文' NOT NULL,
  "grade" text DEFAULT '' NOT NULL,
  "unit" text DEFAULT '' NOT NULL,
  "difficulty" text DEFAULT 'normal' NOT NULL,
  "question_count" integer DEFAULT 10 NOT NULL,
  "question_time_sec" integer DEFAULT 30 NOT NULL,
  "status" text DEFAULT 'waiting' NOT NULL,
  "options" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_presence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "session_key" text NOT NULL,
  "state" text DEFAULT 'online' NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "current_match_id" uuid,
  "current_room_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "cover" text DEFAULT '⚔️' NOT NULL,
  "subject" text DEFAULT '英文' NOT NULL,
  "scope" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "question_count" integer DEFAULT 10 NOT NULL,
  "difficulty" text DEFAULT 'normal' NOT NULL,
  "eligibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reward_nova" integer DEFAULT 50 NOT NULL,
  "reward_xp" integer DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_activity_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "activity_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "rank" integer,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "pk_rewards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "nova" integer DEFAULT 0 NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "wrong_question_count" integer DEFAULT 0 NOT NULL,
  "vocabulary_added" integer DEFAULT 0 NOT NULL,
  "idempotency_key" text NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pk_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "match_id" uuid,
  "target_user_id" uuid,
  "action" text NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "pk_rooms_code_uq" ON "pk_rooms" USING btree ("room_code");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_rooms_share_uq" ON "pk_rooms" USING btree ("share_token");
CREATE INDEX IF NOT EXISTS "pk_rooms_status_idx" ON "pk_rooms" USING btree ("status", "created_at");
CREATE INDEX IF NOT EXISTS "pk_rooms_host_idx" ON "pk_rooms" USING btree ("host_id");
CREATE INDEX IF NOT EXISTS "pk_matches_status_idx" ON "pk_matches" USING btree ("status", "created_at");
CREATE INDEX IF NOT EXISTS "pk_matches_owner_idx" ON "pk_matches" USING btree ("owner_id", "created_at");
CREATE INDEX IF NOT EXISTS "pk_matches_live_idx" ON "pk_matches" USING btree ("status", "starts_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_teams_match_name_uq" ON "pk_teams" USING btree ("match_id", "name");
CREATE INDEX IF NOT EXISTS "pk_teams_match_idx" ON "pk_teams" USING btree ("match_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_players_uq" ON "pk_match_players" USING btree ("match_id", "user_id");
CREATE INDEX IF NOT EXISTS "pk_match_players_match_idx" ON "pk_match_players" USING btree ("match_id", "score");
CREATE INDEX IF NOT EXISTS "pk_match_players_presence_idx" ON "pk_match_players" USING btree ("user_id", "connection_state");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_questions_order_uq" ON "pk_match_questions" USING btree ("match_id", "order_index");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_questions_fingerprint_uq" ON "pk_match_questions" USING btree ("match_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "pk_match_questions_match_idx" ON "pk_match_questions" USING btree ("match_id", "order_index");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_player_answers_once_uq" ON "pk_player_answers" USING btree ("match_id", "question_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_player_answers_idem_uq" ON "pk_player_answers" USING btree ("idempotency_key");
CREATE INDEX IF NOT EXISTS "pk_player_answers_match_idx" ON "pk_player_answers" USING btree ("match_id", "answered_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_scores_uq" ON "pk_match_scores" USING btree ("match_id", "user_id");
CREATE INDEX IF NOT EXISTS "pk_match_scores_rank_idx" ON "pk_match_scores" USING btree ("match_id", "rank");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_match_events_seq_uq" ON "pk_match_events" USING btree ("match_id", "sequence");
CREATE INDEX IF NOT EXISTS "pk_match_events_match_idx" ON "pk_match_events" USING btree ("match_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_matchmaking_user_active_uq" ON "pk_matchmaking_queue" USING btree ("user_id", "status");
CREATE INDEX IF NOT EXISTS "pk_matchmaking_waiting_idx" ON "pk_matchmaking_queue" USING btree ("status", "match_type", "subject", "difficulty", "joined_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_presence_user_session_uq" ON "pk_presence" USING btree ("user_id", "session_key");
CREATE INDEX IF NOT EXISTS "pk_presence_expiry_idx" ON "pk_presence" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "pk_presence_match_idx" ON "pk_presence" USING btree ("current_match_id", "state");
CREATE INDEX IF NOT EXISTS "pk_activities_status_idx" ON "pk_activities" USING btree ("status", "starts_at", "ends_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_activity_participants_uq" ON "pk_activity_participants" USING btree ("activity_id", "user_id");
CREATE INDEX IF NOT EXISTS "pk_activity_participants_rank_idx" ON "pk_activity_participants" USING btree ("activity_id", "rank");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_rewards_match_user_uq" ON "pk_rewards" USING btree ("match_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pk_rewards_idem_uq" ON "pk_rewards" USING btree ("idempotency_key");
CREATE INDEX IF NOT EXISTS "pk_audit_logs_match_idx" ON "pk_audit_logs" USING btree ("match_id", "created_at");
CREATE INDEX IF NOT EXISTS "pk_audit_logs_admin_idx" ON "pk_audit_logs" USING btree ("admin_user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "pk_matches" ADD CONSTRAINT "pk_matches_room_id_pk_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."pk_rooms"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pk_rooms" ADD CONSTRAINT "pk_rooms_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pk_matches" ADD CONSTRAINT "pk_matches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_rooms" ADD CONSTRAINT "pk_rooms_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_teams" ADD CONSTRAINT "pk_teams_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_players" ADD CONSTRAINT "pk_match_players_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_players" ADD CONSTRAINT "pk_match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_players" ADD CONSTRAINT "pk_match_players_team_id_pk_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."pk_teams"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_match_questions" ADD CONSTRAINT "pk_match_questions_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_player_answers" ADD CONSTRAINT "pk_player_answers_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_player_answers" ADD CONSTRAINT "pk_player_answers_question_id_pk_match_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."pk_match_questions"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_player_answers" ADD CONSTRAINT "pk_player_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_scores" ADD CONSTRAINT "pk_match_scores_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_scores" ADD CONSTRAINT "pk_match_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_events" ADD CONSTRAINT "pk_match_events_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_match_events" ADD CONSTRAINT "pk_match_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_matchmaking_queue" ADD CONSTRAINT "pk_matchmaking_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_presence" ADD CONSTRAINT "pk_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_presence" ADD CONSTRAINT "pk_presence_current_match_id_pk_matches_id_fk" FOREIGN KEY ("current_match_id") REFERENCES "public"."pk_matches"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_presence" ADD CONSTRAINT "pk_presence_current_room_id_pk_rooms_id_fk" FOREIGN KEY ("current_room_id") REFERENCES "public"."pk_rooms"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_activities" ADD CONSTRAINT "pk_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_activity_participants" ADD CONSTRAINT "pk_activity_participants_activity_id_pk_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."pk_activities"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_activity_participants" ADD CONSTRAINT "pk_activity_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_rewards" ADD CONSTRAINT "pk_rewards_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_rewards" ADD CONSTRAINT "pk_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  ALTER TABLE "pk_audit_logs" ADD CONSTRAINT "pk_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;
  ALTER TABLE "pk_audit_logs" ADD CONSTRAINT "pk_audit_logs_match_id_pk_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."pk_matches"("id") ON DELETE SET NULL;
  ALTER TABLE "pk_audit_logs" ADD CONSTRAINT "pk_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
