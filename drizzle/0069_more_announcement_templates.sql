INSERT INTO "announcement_templates" ("name", "title", "body", "type", "icon", "cta_label", "cta_url", "default_settings")
SELECT * FROM (VALUES
  ('維護完成', 'StudyNova 維護完成', '網站維護已完成，所有主要功能現在可以正常使用。感謝你的耐心等候。', 'maintenance', '✓', '回到首頁', '/dashboard', '{"marquee":true,"importance":"high","notify":true,"push":true}'::jsonb),
  ('系統更新完成', 'StudyNova 系統更新完成', '本次系統更新已完成，新增功能與穩定性改善已正式上線。', 'update', '↑', '查看新功能', '/dashboard', '{"marquee":true,"importance":"normal","notify":true,"push":true}'::jsonb),
  ('功能暫停通知', '部分功能暫時維護中', '為了進行系統維護，部分功能將暫時停止使用，完成後會立即通知你。', 'maintenance', '⚠', '查看狀態', '/dashboard', '{"marquee":true,"importance":"high","notify":true,"push":true}'::jsonb),
  ('安全性更新', 'StudyNova 安全性更新', '我們已完成安全性更新，請重新登入以確保帳號安全。', 'security', '盾', '重新登入', '/login', '{"marquee":true,"importance":"critical","notify":true,"push":true}'::jsonb),
  ('新功能上線', '新功能正式上線！', 'StudyNova 帶來新的學習工具與管理功能，現在就前往探索。', 'feature', '✦', '立即探索', '/dashboard', '{"marquee":false,"importance":"normal","notify":true,"push":true}'::jsonb),
  ('活動即將結束', '活動即將結束提醒', '目前活動即將結束，還沒完成任務的同學請把握最後時間。', 'activity', '⏳', '前往活動', '/activities', '{"marquee":true,"importance":"normal","notify":true,"push":true}'::jsonb)
) AS v("name", "title", "body", "type", "icon", "cta_label", "cta_url", "default_settings")
WHERE NOT EXISTS (SELECT 1 FROM "announcement_templates" t WHERE t."name" = v."name");
