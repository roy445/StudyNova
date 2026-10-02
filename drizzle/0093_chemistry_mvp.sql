CREATE TABLE IF NOT EXISTS chemistry_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL DEFAULT 'CHEMISTRY', slug text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'published', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(subject, slug)
);
CREATE TABLE IF NOT EXISTS chemistry_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid NOT NULL REFERENCES chemistry_topics(id) ON DELETE CASCADE, subject text NOT NULL DEFAULT 'CHEMISTRY', slug text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', level integer NOT NULL DEFAULT 1, mastery_threshold integer NOT NULL DEFAULT 70, sort_order integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'published', metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(subject, slug)
);
CREATE TABLE IF NOT EXISTS chemistry_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prerequisite_concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, weight real NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(prerequisite_concept_id, concept_id)
);
CREATE TABLE IF NOT EXISTS chemistry_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, title text NOT NULL, subtitle text NOT NULL DEFAULT '', level integer NOT NULL DEFAULT 0, estimated_minutes integer NOT NULL DEFAULT 5, sort_order integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'published', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chemistry_lesson_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES chemistry_lessons(id) ON DELETE CASCADE, step_type text NOT NULL DEFAULT 'explain', title text NOT NULL, body text NOT NULL, order_index integer NOT NULL DEFAULT 0, source jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(lesson_id, order_index)
);
CREATE TABLE IF NOT EXISTS chemistry_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, score real NOT NULL DEFAULT 0, confidence real NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0, correct_count integer NOT NULL DEFAULT 0, hint_count integer NOT NULL DEFAULT 0, consecutive_correct integer NOT NULL DEFAULT 0, last_practiced_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, concept_id)
);
CREATE TABLE IF NOT EXISTS chemistry_diagnostic_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'started', question_ids jsonb NOT NULL DEFAULT '[]'::jsonb, answers jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS chemistry_question_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE, concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, question_stage text NOT NULL DEFAULT 'practice', error_type text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(question_id, concept_id)
);
CREATE TABLE IF NOT EXISTS chemistry_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id uuid NOT NULL REFERENCES chemistry_lessons(id) ON DELETE CASCADE, completed_steps integer NOT NULL DEFAULT 0, completed boolean NOT NULL DEFAULT false, last_viewed_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS chemistry_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), concept_id uuid NOT NULL REFERENCES chemistry_concepts(id) ON DELETE CASCADE, title text NOT NULL, expression text NOT NULL, variables jsonb NOT NULL DEFAULT '[]'::jsonb, usage text NOT NULL DEFAULT '', common_mistakes text NOT NULL DEFAULT '', example text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'published', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chemistry_topics_status_idx ON chemistry_topics(subject, status, sort_order);
CREATE INDEX IF NOT EXISTS chemistry_concepts_topic_idx ON chemistry_concepts(topic_id, sort_order);
CREATE INDEX IF NOT EXISTS chemistry_prerequisites_concept_idx ON chemistry_prerequisites(concept_id);
CREATE INDEX IF NOT EXISTS chemistry_lessons_concept_idx ON chemistry_lessons(concept_id, level, sort_order);
CREATE INDEX IF NOT EXISTS chemistry_mastery_user_idx ON chemistry_mastery(user_id, score);
CREATE INDEX IF NOT EXISTS chemistry_question_links_concept_idx ON chemistry_question_links(concept_id, question_stage);

INSERT INTO chemistry_topics (subject, slug, title, description, sort_order) VALUES
('CHEMISTRY', 'atoms-elements', '原子與元素基礎', '從質子、中子、電子開始，建立理解元素與週期表的基礎。', 1),
('CHEMISTRY', 'formulas-basics', '化學式與基本化學概念', '讀懂化學式、分子組成、原子數量與相對分子質量。', 2)
ON CONFLICT (subject, slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'published';

WITH t AS (SELECT id, slug FROM chemistry_topics WHERE subject = 'CHEMISTRY')
INSERT INTO chemistry_concepts (topic_id, subject, slug, title, description, level, sort_order) VALUES
((SELECT id FROM t WHERE slug='atoms-elements'),'CHEMISTRY','atom-structure','原子基本結構','理解質子、中子、電子的位置與電荷。',1,1),
((SELECT id FROM t WHERE slug='atoms-elements'),'CHEMISTRY','proton-neutron-electron','質子、中子與電子','用粒子數量描述原子與離子。',1,2),
((SELECT id FROM t WHERE slug='atoms-elements'),'CHEMISTRY','atomic-number-mass-number','原子序與質量數','從原子序、質量數推算粒子數。',2,3),
((SELECT id FROM t WHERE slug='atoms-elements'),'CHEMISTRY','element-symbols','元素符號','讀寫常見元素符號與週期表位置。',2,4),
((SELECT id FROM t WHERE slug='atoms-elements'),'CHEMISTRY','periodic-table-basics','基礎週期表概念','理解週期與族提供的基本資訊。',3,5),
((SELECT id FROM t WHERE slug='formulas-basics'),'CHEMISTRY','chemical-formula','化學式','從化學式讀出物質組成。',2,1),
((SELECT id FROM t WHERE slug='formulas-basics'),'CHEMISTRY','molecule-counting','分子與原子數量','計算式中各元素的原子數量。',2,2),
((SELECT id FROM t WHERE slug='formulas-basics'),'CHEMISTRY','relative-atomic-mass','相對原子質量','理解相對原子質量的比較意義。',3,3),
((SELECT id FROM t WHERE slug='formulas-basics'),'CHEMISTRY','relative-molecular-mass','相對分子質量','依化學式加總相對原子質量。',3,4),
((SELECT id FROM t WHERE slug='formulas-basics'),'CHEMISTRY','formula-application','化學式綜合應用','在文字與計算情境中應用化學式。',4,5)
ON CONFLICT (subject, slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'published';

INSERT INTO chemistry_prerequisites (prerequisite_concept_id, concept_id)
SELECT a.id, b.id FROM chemistry_concepts a JOIN chemistry_concepts b ON (a.slug,b.slug) IN (('atom-structure','proton-neutron-electron'),('proton-neutron-electron','atomic-number-mass-number'),('atomic-number-mass-number','element-symbols'),('element-symbols','periodic-table-basics'),('element-symbols','chemical-formula'),('chemical-formula','molecule-counting'),('molecule-counting','relative-molecular-mass'),('relative-atomic-mass','relative-molecular-mass'),('relative-molecular-mass','formula-application'))
ON CONFLICT DO NOTHING;

DO $$
DECLARE c record; l_id uuid;
BEGIN
  FOR c IN SELECT id, title FROM chemistry_concepts WHERE subject='CHEMISTRY' LOOP
    INSERT INTO chemistry_lessons (concept_id, title, subtitle, level, estimated_minutes, sort_order) VALUES (c.id, c.title || '：先建立直覺', '用簡單例子理解這個概念要解決的問題。', 0, 5, 0) RETURNING id INTO l_id ON CONFLICT DO NOTHING;
    IF l_id IS NOT NULL THEN
      INSERT INTO chemistry_lesson_steps (lesson_id, step_type, title, body, order_index) VALUES (l_id, 'explain', '先問：為什麼需要這個概念？', '這一課會把化學符號連回可觀察的粒子與數量，不要求你先背公式。', 0), (l_id, 'example', '看一個簡單例子', '先圈出題目提供的資訊，再判斷它描述的是粒子、元素還是化合物。', 1), (l_id, 'check', '自我檢查', '用自己的話說明這個概念；如果說不清楚，可以回到前置概念。', 2) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

INSERT INTO chemistry_formulas (concept_id, title, expression, variables, usage, common_mistakes, example)
SELECT id, '相對分子質量', 'Mr = Σ(Ar × 原子數量)', '[{"symbol":"Mr","meaning":"相對分子質量","unit":"無單位"},{"symbol":"Ar","meaning":"相對原子質量","unit":"無單位"}]'::jsonb, '需要由化學式計算分子相對質量時使用。', '漏乘化學式下標，或把係數與下標混在一起。', 'H₂O：2×1 + 16 = 18'
FROM chemistry_concepts WHERE slug = 'relative-molecular-mass'
AND NOT EXISTS (SELECT 1 FROM chemistry_formulas f WHERE f.concept_id = chemistry_concepts.id AND f.title = '相對分子質量');

DO $$
DECLARE bank_id uuid; owner_id uuid; c record; q_id uuid; i integer := 0;
BEGIN
  SELECT id INTO owner_id FROM users WHERE role IN ('admin','owner') ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN; END IF;
  INSERT INTO question_banks (name, description, subject, grade, education_level, source, visibility, status, scope, bank_kind, created_by)
  VALUES ('高中化學 MVP 官方題庫', 'V1 第一階段：原子、元素、化學式與基本化學概念。', '化學', '高中', 'senior', 'StudyNova 官方內容', 'global', 'published', 'global', 'global', owner_id)
  ON CONFLICT DO NOTHING;
  SELECT id INTO bank_id FROM question_banks WHERE name = '高中化學 MVP 官方題庫' LIMIT 1;
  FOR c IN SELECT id, slug FROM chemistry_concepts WHERE slug IN ('atom-structure','proton-neutron-electron','atomic-number-mass-number','element-symbols','chemical-formula','molecule-counting','relative-molecular-mass') ORDER BY sort_order LIMIT 10 LOOP
    i := i + 1;
    INSERT INTO questions (bank_id, owner_id, origin, target_bank, bank_category, source_label, subject, topic, chapter, tags, source_type, estimated_seconds, points, status, level, difficulty, type, stem, options, answer, explanation, fingerprint)
    VALUES (bank_id, owner_id, 'admin', 'chemistry', 'chemistry', 'StudyNova 官方化學 MVP', '化學', '高中化學', '第一階段', ARRAY['chemistry', c.slug], 'official', 60, 1, 'published', 'senior', CASE WHEN i > 7 THEN 'hard' ELSE 'easy' END, 'single',
      CASE i WHEN 1 THEN '原子中帶正電的粒子是哪一種？' WHEN 2 THEN '原子序代表原子核中的哪一種數量？' WHEN 3 THEN '中性氧原子有 8 個質子，電子數是多少？' WHEN 4 THEN '質量數 23、原子序 11 的鈉原子有幾個中子？' WHEN 5 THEN '下列哪一個是氧元素的正確元素符號？' WHEN 6 THEN 'H₂O 中總共有幾個原子？' WHEN 7 THEN 'CO₂ 中氧原子的數量是多少？' WHEN 8 THEN 'H₂O 的相對分子質量是多少？（H=1，O=16）' WHEN 9 THEN 'NaCl 代表一個鈉原子和幾個氯原子？' ELSE '化學式下標 2 最直接表示什麼？' END,
      CASE i WHEN 1 THEN '["電子","質子","中子","原子核"]'::jsonb WHEN 2 THEN '["中子數","質子數","電子層數","質量數"]'::jsonb WHEN 3 THEN '["0","8","16","不一定"]'::jsonb WHEN 4 THEN '["11","12","23","34"]'::jsonb WHEN 5 THEN '["O","Ox","Og","0"]'::jsonb WHEN 6 THEN '["2","3","4","6"]'::jsonb WHEN 7 THEN '["1","2","3","4"]'::jsonb WHEN 8 THEN '["16","17","18","20"]'::jsonb WHEN 9 THEN '["0","1","2","不一定"]'::jsonb ELSE '["有 2 個相同原子","有 2 種元素","質量數是 2","電荷是 2"]'::jsonb END,
      CASE i WHEN 1 THEN '["質子"]'::jsonb WHEN 2 THEN '["質子數"]'::jsonb WHEN 3 THEN '["8"]'::jsonb WHEN 4 THEN '["12"]'::jsonb WHEN 5 THEN '["O"]'::jsonb WHEN 6 THEN '["3"]'::jsonb WHEN 7 THEN '["2"]'::jsonb WHEN 8 THEN '["18"]'::jsonb WHEN 9 THEN '["1"]'::jsonb ELSE '["有 2 個相同原子"]'::jsonb END,
      CASE i WHEN 1 THEN '質子在原子核中，帶正電；電子帶負電。' WHEN 2 THEN '中性原子的原子序等於質子數。' WHEN 3 THEN '中性原子的質子數等於電子數，所以是 8。' WHEN 4 THEN '中子數 = 質量數 − 質子數 = 23 − 11 = 12。' WHEN 5 THEN '氧的元素符號是大寫 O。' WHEN 6 THEN 'H₂O 有 2 個氫原子與 1 個氧原子，共 3 個。' WHEN 7 THEN 'CO₂ 的下標 2 表示有 2 個氧原子。' WHEN 8 THEN 'Mr(H₂O)=2×1+16=18。' WHEN 9 THEN 'NaCl 中 Na 與 Cl 各 1 個。' ELSE '下標是該元素原子數量，不是電荷或質量數。' END,
      md5('chemistry-mvp-' || i))
    ON CONFLICT (fingerprint) DO NOTHING RETURNING id INTO q_id;
    IF q_id IS NOT NULL THEN
      INSERT INTO chemistry_question_links (question_id, concept_id, question_stage) VALUES (q_id, c.id, CASE WHEN i <= 5 THEN 'diagnostic' ELSE 'practice' END) ON CONFLICT DO NOTHING;
      INSERT INTO question_bank_memberships (bank_id, question_id, relation, added_by) VALUES (bank_id, q_id, 'included', owner_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
