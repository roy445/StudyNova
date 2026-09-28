-- Stable system identity used only for server-authoritative bot PK opponents.
INSERT INTO users (user_id, nova_id, email, password_hash, display_name, role, status, onboarded)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'NOVA-BOT',
  'nova-bot@system.studynova',
  'system-bot-disabled-login',
  'Nova Bot',
  'bot',
  'active',
  true
)
ON CONFLICT (user_id) DO UPDATE SET display_name = 'Nova Bot', role = 'bot', status = 'active';
