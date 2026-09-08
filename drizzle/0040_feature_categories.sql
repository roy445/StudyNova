ALTER TABLE "feature_permissions" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT '系統與其他';
UPDATE "feature_permissions" SET "category" = CASE
  WHEN lower("feature") LIKE '%ai%' OR lower("feature") LIKE '%ocr%' OR lower("feature") LIKE '%quiz%' THEN 'AI'
  WHEN lower("feature") LIKE '%challenge%' OR lower("feature") LIKE '%friend%' OR lower("feature") LIKE '%room%' OR lower("feature") LIKE '%activity%' THEN '社交與活動'
  WHEN lower("feature") LIKE '%nova%' OR lower("feature") LIKE '%pro%' OR lower("feature") LIKE '%reward%' THEN '會員與 Nova'
  WHEN lower("feature") LIKE '%word%' OR lower("feature") LIKE '%study%' OR lower("feature") LIKE '%material%' OR lower("feature") LIKE '%wrong%' THEN '學習'
  ELSE '系統與其他'
END
WHERE "category" = '系統與其他';
