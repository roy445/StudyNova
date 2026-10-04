-- Remove only the tester recruitment announcement created by migration 0104.
-- Other announcements remain untouched.
DELETE FROM "announcements"
WHERE "title" = 'StudyNova 測試員志願者徵選';
