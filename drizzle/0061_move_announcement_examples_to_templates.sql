-- 將 0057 建立的預設範例從實際公告資料搬到模板庫。
-- 只比對已知預設範例標題，不影響 Admin 自行建立的公告。
WITH example_titles(title) AS (
  VALUES
    ('系統維護通知'), ('StudyNova 系統更新'), ('段考專區已開放'), ('新的單字記憶卡'), ('我的單字資料夾'),
    ('AI 題目分析更新'), ('AI 背景分析'), ('每日知識更新'), ('PWA 安裝提醒'), ('版本更新完成'),
    ('段考倒數更新'), ('新增段考單字'), ('新的學習挑戰'), ('Nova Pro 提醒'), ('Nova Pro 續約'),
    ('題庫更新'), ('錯題複習提醒'), ('學習報告已更新'), ('系統安全更新'), ('服務恢復'),
    ('AI 助教 Novi 有新能力'), ('新的自我測驗'), ('學習連續天數'), ('系統公告'), ('維護即將開始')
)
INSERT INTO "announcement_templates" ("name", "title", "body", "type", "icon", "cta_label", "cta_url", "default_settings", "enabled")
SELECT a."title", a."title", a."body", a."type", '▤', a."cta_label", COALESCE(NULLIF(a."cta_url", ''), a."link"), jsonb_build_object('marquee', a."marquee", 'importance', a."importance"), true
FROM "announcements" a
JOIN example_titles e ON e.title = a."title"
WHERE NOT EXISTS (SELECT 1 FROM "announcement_templates" t WHERE t."title" = a."title");

-- 僅移除上述已搬移的預設範例；其他實際公告完全保留。
WITH example_titles(title) AS (
  VALUES
    ('系統維護通知'), ('StudyNova 系統更新'), ('段考專區已開放'), ('新的單字記憶卡'), ('我的單字資料夾'),
    ('AI 題目分析更新'), ('AI 背景分析'), ('每日知識更新'), ('PWA 安裝提醒'), ('版本更新完成'),
    ('段考倒數更新'), ('新增段考單字'), ('新的學習挑戰'), ('Nova Pro 提醒'), ('Nova Pro 續約'),
    ('題庫更新'), ('錯題複習提醒'), ('學習報告已更新'), ('系統安全更新'), ('服務恢復'),
    ('AI 助教 Novi 有新能力'), ('新的自我測驗'), ('學習連續天數'), ('系統公告'), ('維護即將開始')
)
DELETE FROM "announcements" a
USING example_titles e
WHERE a."title" = e.title
  AND a."status" = 'archived'
  AND a."show_home" = false
  AND a."show_pwa" = false;
