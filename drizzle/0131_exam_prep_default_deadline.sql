-- 統一目前所有未封存段考衝刺活動與科目挑戰的截止時間
-- 2026/10/20 00:00 Asia/Taipei = 2026-10-19 16:00:00 UTC
UPDATE "exam_prep_activities"
SET "close_at" = TIMESTAMPTZ '2026-10-19 16:00:00+00',
    "updated_at" = now()
WHERE "status" <> 'archived';

UPDATE "exam_prep_subjects" AS s
SET "close_at" = TIMESTAMPTZ '2026-10-19 16:00:00+00',
    "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "exam_prep_activities" AS a
  WHERE a."id" = s."activity_id"
    AND a."status" <> 'archived'
);
