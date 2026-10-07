-- Create ten non-login system accounts for PK bots.
-- They are hidden from the normal admin user directory via users.is_system,
-- while remaining available to the PK runtime and PK management dashboard.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE pk_bot_profiles ADD COLUMN IF NOT EXISTS user_id uuid;

DO $$ BEGIN
  ALTER TABLE pk_bot_profiles
    ADD CONSTRAINT pk_bot_profiles_user_fk
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pk_bot_profiles_user_uq
  ON pk_bot_profiles (user_id)
  WHERE user_id IS NOT NULL;

WITH bot_seed(bot_no, bot_key, display_name, difficulty, bot_level, accuracy, response_min_ms, response_max_ms) AS (
  VALUES
    (1, 'nova-bot-01', 'Nova Bot 01', 'easy',   1, 0.58, 1800, 5200),
    (2, 'nova-bot-02', 'Nova Bot 02', 'easy',   1, 0.62, 1600, 4800),
    (3, 'nova-bot-03', 'Nova Bot 03', 'easy',   2, 0.66, 1500, 4400),
    (4, 'nova-bot-04', 'Nova Bot 04', 'normal', 2, 0.70, 1250, 3600),
    (5, 'nova-bot-05', 'Nova Bot 05', 'normal', 2, 0.73, 1150, 3400),
    (6, 'nova-bot-06', 'Nova Bot 06', 'normal', 3, 0.76, 1050, 3200),
    (7, 'nova-bot-07', 'Nova Bot 07', 'normal', 3, 0.79,  980, 3000),
    (8, 'nova-bot-08', 'Nova Bot 08', 'hard',   3, 0.82,  900, 2700),
    (9, 'nova-bot-09', 'Nova Bot 09', 'hard',   4, 0.86,  820, 2450),
    (10,'nova-bot-10', 'Nova Bot 10', 'hard',   5, 0.90,  740, 2200)
), created_users AS (
  INSERT INTO users (nova_id, email, password_hash, display_name, role, status, is_system, onboarded, avatar_seed)
  SELECT
    'NOVA-PK-' || lpad(bot_no::text, 2, '0'),
    'pk-bot-' || lpad(bot_no::text, 2, '0') || '@system.studynova',
    'system-bot-disabled-login',
    display_name,
    'student',
    'active',
    true,
    true,
    bot_key
  FROM bot_seed
  ON CONFLICT (nova_id) DO UPDATE SET
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    role = 'student',
    status = 'active',
    is_system = true,
    onboarded = true,
    avatar_seed = EXCLUDED.avatar_seed,
    updated_at = now()
  RETURNING user_id, nova_id
)
INSERT INTO pk_bot_profiles (
  user_id, bot_key, display_name, avatar_seed, personality, grade_levels,
  subject_preferences, difficulty, accuracy, response_min_ms, response_max_ms,
  bot_level, enabled, updated_at
)
SELECT
  u.user_id,
  b.bot_key,
  b.display_name,
  b.bot_key,
  CASE WHEN b.difficulty = 'hard' THEN 'focused' WHEN b.difficulty = 'easy' THEN 'cheerful' ELSE 'friendly' END,
  '["JUNIOR_HIGH", "SENIOR_HIGH"]'::jsonb,
  '["國文", "英文", "數學", "自然", "社會", "化學", "物理", "生物"]'::jsonb,
  b.difficulty,
  b.accuracy,
  b.response_min_ms,
  b.response_max_ms,
  b.bot_level,
  true,
  now()
FROM bot_seed b
JOIN users u ON u.nova_id = 'NOVA-PK-' || lpad(b.bot_no::text, 2, '0')
ON CONFLICT (bot_key) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  display_name = EXCLUDED.display_name,
  avatar_seed = EXCLUDED.avatar_seed,
  difficulty = EXCLUDED.difficulty,
  accuracy = EXCLUDED.accuracy,
  response_min_ms = EXCLUDED.response_min_ms,
  response_max_ms = EXCLUDED.response_max_ms,
  bot_level = EXCLUDED.bot_level,
  enabled = true,
  updated_at = now();

-- Attach any pre-existing profile with the matching stable key to its account.
UPDATE pk_bot_profiles p
SET user_id = u.user_id, updated_at = now()
FROM users u
WHERE p.bot_key ~ '^nova-bot-(0[1-9]|10)$'
  AND u.nova_id = 'NOVA-PK-' || right(p.bot_key, 2)
  AND p.user_id IS DISTINCT FROM u.user_id;
