-- Stable system identity used only for server-authoritative bot PK opponents.
-- The production users table uses `id` as its primary key and only permits
-- student/admin/owner roles. The bot identity is therefore a normal student
-- account; bot behavior is represented by pk_match_players.role = 'bot'.
INSERT INTO users (id, nova_id, email, password_hash, display_name, role, status, onboarded)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'NOVA-BOT',
  'nova-bot@system.studynova',
  'system-bot-disabled-login',
  'Nova Bot',
  'student',
  'active',
  true
)
ON CONFLICT (id) DO UPDATE
SET display_name = 'Nova Bot',
    status = 'active',
    onboarded = true;
