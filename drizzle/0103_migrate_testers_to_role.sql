-- Preserve existing testers while moving the application to the users.role model.
-- The guarded block is safe on databases where the legacy identity-group tables
-- have already been removed.
DO $$
BEGIN
  IF to_regclass('public.identity_groups') IS NOT NULL
     AND to_regclass('public.identity_group_members') IS NOT NULL THEN
    UPDATE "users" AS u
    SET "role" = 'tester', "updated_at" = now()
    WHERE u."role" = 'student'
      AND EXISTS (
        SELECT 1
        FROM "identity_group_members" AS m
        INNER JOIN "identity_groups" AS g ON g."id" = m."identity_group_id"
        WHERE m."user_id" = u."id"
          AND g."name" = '測試員'
          AND g."enabled" = true
      );
  END IF;
END $$;
