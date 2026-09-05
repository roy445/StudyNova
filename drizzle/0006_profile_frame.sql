ALTER TABLE "assistant_profiles"
ADD COLUMN IF NOT EXISTS "frame" text NOT NULL DEFAULT 'frame-default';

UPDATE "assistant_profiles"
SET "frame" = 'frame-default'
WHERE "frame" IS NULL OR "frame" = '';

UPDATE "assistant_items"
SET "enabled" = false
WHERE "category" IN ('skin', 'core', 'effect', 'float', 'voice');

INSERT INTO "assistant_items" ("code", "name", "category", "price_nova", "description", "payload", "required_level", "pro_only", "enabled")
VALUES
  ('frame-default', '經典頭像框', 'frame', 0, 'StudyNova 預設頭像框', '{}'::jsonb, 1, false, true),
  ('frame-aurora', '極光頭像框', 'frame', 180, '青藍極光流動頭像框', '{"color":"#22d3ee"}'::jsonb, 1, false, true),
  ('frame-nebula', '星雲頭像框', 'frame', 320, '紫色星雲質感頭像框', '{"color":"#a78bfa"}'::jsonb, 2, false, true),
  ('frame-gold', 'Nova Pro 金色頭像框', 'frame', 520, 'Nova Pro 專屬金色頭像框', '{"color":"#fbbf24"}'::jsonb, 1, true, true),
  ('badge-focus', '專注徽章', 'badge', 120, '完成專注學習後可展示的徽章', '{"icon":"◎"}'::jsonb, 1, false, true),
  ('badge-scholar', '學習達人徽章', 'badge', 260, '象徵持續學習的收藏徽章', '{"icon":"✦"}'::jsonb, 2, false, true),
  ('title-wordsmith', '單字探險家', 'title', 150, '顯示在個人檔案與公開 NOVA 頁面', '{}'::jsonb, 1, false, true),
  ('title-top-scholar', '頂尖學習者', 'title', 360, '高階學習稱號，展示你的學習成果', '{}'::jsonb, 3, false, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "price_nova" = EXCLUDED."price_nova",
  "description" = EXCLUDED."description",
  "payload" = EXCLUDED."payload",
  "required_level" = EXCLUDED."required_level",
  "pro_only" = EXCLUDED."pro_only",
  "enabled" = EXCLUDED."enabled";

UPDATE "assistant_profiles"
SET "skin" = 'core-classic', "core" = 'none', "effect" = 'none', "float" = 'none', "voice" = 'default';

-- Nova Pro 兌換價格：天數越長，總價越高；30 天方案單價也較高。
CREATE TABLE IF NOT EXISTS "nova_pro_exchange_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "days" integer NOT NULL UNIQUE,
  "price_nova" integer NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "nova_pro_exchange_plans" ("days", "price_nova", "enabled")
VALUES (1, 80, true), (7, 500, true), (14, 1100, true), (30, 2600, true)
ON CONFLICT ("days") DO UPDATE SET "price_nova" = EXCLUDED."price_nova", "enabled" = EXCLUDED."enabled";

CREATE TABLE IF NOT EXISTS "nova_pro_exchange_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
  "days" integer NOT NULL,
  "price_nova" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "nova_pro_exchange_user_idx" ON "nova_pro_exchange_transactions" ("user_id", "created_at");

INSERT INTO "__drizzle_migrations" ("hash", "created_at")
SELECT '0006_profile_frame', extract(epoch from now()) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "__drizzle_migrations" WHERE "hash" = '0006_profile_frame');

-- 成績輸入預設關閉；後台可日後重新開放。
INSERT INTO "platform_settings" ("key", "value")
VALUES ('grade_input_window', '{"enabled":false,"startsAt":null,"endsAt":null}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value" = '{"enabled":false,"startsAt":null,"endsAt":null}'::jsonb, "updated_at" = now();
