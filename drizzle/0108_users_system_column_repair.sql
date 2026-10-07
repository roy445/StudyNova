-- Forward-only repair for Production databases that missed 0107_pk_bot_accounts.sql.
-- The application schema and admin routes require users.is_system to hide non-login
-- PK system accounts from normal user reports. IF NOT EXISTS keeps this safe for
-- databases where 0107 was already applied.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
