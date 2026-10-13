-- Independent multiplayer exam rooms for the Exam Prep Center.
-- This domain intentionally does not reuse the legacy online PK tables.
CREATE TABLE IF NOT EXISTS "exam_pk_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_code" text NOT NULL,
  "activity_id" uuid NOT NULL REFERENCES "exam_prep_activities"("id") ON DELETE RESTRICT,
  "host_user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE RESTRICT,
  "subject" text NOT NULL,
  "scope" text NOT NULL DEFAULT '',
  "question_bank_id" uuid REFERENCES "question_banks"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'WAITING',
  "max_players" integer NOT NULL DEFAULT 50,
  "duration_minutes" integer NOT NULL DEFAULT 50,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "ends_at" timestamptz,
  "finished_at" timestamptz,
  CONSTRAINT "exam_pk_rooms_status_ck" CHECK ("status" IN ('WAITING', 'RUNNING', 'FINISHED', 'CANCELLED')),
  CONSTRAINT "exam_pk_rooms_players_ck" CHECK ("max_players" BETWEEN 2 AND 100),
  CONSTRAINT "exam_pk_rooms_duration_ck" CHECK ("duration_minutes" BETWEEN 10 AND 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_pk_rooms_code_uq" ON "exam_pk_rooms" ("room_code");
CREATE INDEX IF NOT EXISTS "exam_pk_rooms_status_idx" ON "exam_pk_rooms" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "exam_pk_rooms_activity_idx" ON "exam_pk_rooms" ("activity_id", "created_at");

CREATE TABLE IF NOT EXISTS "exam_pk_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "exam_pk_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'JOINED',
  "submitted_at" timestamptz,
  "score" real,
  "correct_count" integer NOT NULL DEFAULT 0,
  "wrong_count" integer NOT NULL DEFAULT 0,
  "unanswered_count" integer NOT NULL DEFAULT 0,
  "rank" integer,
  "last_seen_at" timestamptz,
  CONSTRAINT "exam_pk_participants_status_ck" CHECK ("status" IN ('JOINED', 'READY', 'ANSWERING', 'SUBMITTED', 'DISCONNECTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_pk_participants_room_user_uq" ON "exam_pk_participants" ("room_id", "user_id");
CREATE INDEX IF NOT EXISTS "exam_pk_participants_room_idx" ON "exam_pk_participants" ("room_id", "joined_at");
CREATE INDEX IF NOT EXISTS "exam_pk_participants_user_idx" ON "exam_pk_participants" ("user_id", "joined_at");

CREATE TABLE IF NOT EXISTS "exam_pk_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "exam_pk_rooms"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE RESTRICT,
  "order_index" integer NOT NULL,
  "question_version" integer NOT NULL DEFAULT 1,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_pk_questions_room_order_uq" ON "exam_pk_questions" ("room_id", "order_index");
CREATE UNIQUE INDEX IF NOT EXISTS "exam_pk_questions_room_question_uq" ON "exam_pk_questions" ("room_id", "question_id");
CREATE INDEX IF NOT EXISTS "exam_pk_questions_room_idx" ON "exam_pk_questions" ("room_id", "order_index");

CREATE TABLE IF NOT EXISTS "exam_pk_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "exam_pk_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "exam_pk_questions"("id") ON DELETE CASCADE,
  "answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_correct" boolean NOT NULL DEFAULT false,
  "answered_at" timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz,
  "time_spent" integer NOT NULL DEFAULT 0,
  "changed_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_pk_answers_room_user_question_uq" ON "exam_pk_answers" ("room_id", "user_id", "question_id");
CREATE INDEX IF NOT EXISTS "exam_pk_answers_room_idx" ON "exam_pk_answers" ("room_id", "updated_at");
CREATE INDEX IF NOT EXISTS "exam_pk_answers_user_idx" ON "exam_pk_answers" ("user_id", "room_id");

CREATE TABLE IF NOT EXISTS "exam_pk_answer_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "exam_pk_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "exam_pk_questions"("id") ON DELETE CASCADE,
  "old_answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "new_answer" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "changed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_pk_answer_history_room_idx" ON "exam_pk_answer_history" ("room_id", "changed_at");
CREATE INDEX IF NOT EXISTS "exam_pk_answer_history_user_idx" ON "exam_pk_answer_history" ("user_id", "room_id");
