-- StudyNova admin role management for Neon SQL Editor
--
-- 1) Run the SELECT first and confirm the target account.
-- 2) Uncomment exactly ONE UPDATE statement, replace the email, then run it.
-- 3) Use role = 'admin' for normal back-office access.
--    Use role = 'owner' only for the primary platform owner.
--
-- New registrations always start as role = 'student'.

SELECT user_id, nova_id, email, display_name, role, status, created_at
FROM users
ORDER BY created_at ASC;

-- Grant normal administrator access by email:
-- UPDATE users
-- SET role = 'admin', updated_at = now()
-- WHERE lower(email) = lower('admin@example.com');

-- Revoke administrator access:
-- UPDATE users
-- SET role = 'student', updated_at = now()
-- WHERE lower(email) = lower('admin@example.com');

-- Set the primary platform owner (use sparingly):
-- UPDATE users
-- SET role = 'owner', updated_at = now()
-- WHERE lower(email) = lower('owner@example.com');

-- Verify the result:
-- SELECT user_id, nova_id, email, display_name, role, status
-- FROM users
-- WHERE lower(email) = lower('admin@example.com');
