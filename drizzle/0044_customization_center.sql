CREATE TABLE IF NOT EXISTS customization_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'spark',
  route_path text NOT NULL DEFAULT '',
  component_key text NOT NULL DEFAULT 'page',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customization_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES customization_categories(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsive jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(category_id, version_no)
);
CREATE INDEX IF NOT EXISTS customization_categories_order_idx ON customization_categories(enabled, sort_order);
CREATE INDEX IF NOT EXISTS customization_versions_category_idx ON customization_versions(category_id, version_no DESC);
INSERT INTO customization_categories (slug, name, description, icon, route_path, component_key, status, sort_order)
VALUES
 ('dashboard','Dashboard','首頁與學習總覽的視覺風格','home','/dashboard','page','published',10),
 ('vocabulary','單字','單字學習與複習區域','study','/study','page','published',20),
 ('question-bank','題庫','題庫、題目與匯入介面','question','/study','page','published',30),
 ('ai-tools','AI 工具','AI 對話、解題與分析功能','nova','/ai','page','published',40),
 ('exams','考試','每週小考與考試功能','weekly','/weekly','page','published',50),
 ('reports','學習報告','成績、統計與學習報告','grades','/grades','page','published',60),
 ('profile','個人頁面','個人設定與 Novi 介面','profile','/profile','page','published',70),
 ('bottom-navigation','Bottom Navigation','行動版底部導覽列','menu','*','bottom-nav','published',80)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO customization_versions (category_id, version_no, status, tokens, responsive, change_note)
SELECT id, 1, 'published', '{"primary":"#7c5cff","secondary":"#37d3ff","accent":"#ffc857","surface":"rgba(16,26,51,0.72)","line":"rgba(124,92,255,0.18)","radius":"22px","shadow":"0 18px 50px -24px rgba(6,10,30,0.9)","glow":"0 0 24px rgba(124,92,255,0.22)","buttonRadius":"14px","motion":"220ms","pageBackground":""}'::jsonb, '{}'::jsonb, '初始 Design System token'
FROM customization_categories c
WHERE NOT EXISTS (SELECT 1 FROM customization_versions v WHERE v.category_id = c.id);
