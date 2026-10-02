-- Publish the V1.1.1 in-app release announcement.
-- Clients below 1.1.1 receive forceUpdate=true from /releases/latest.
INSERT INTO software_releases (
  version,
  previous_version,
  release_type,
  title,
  subtitle,
  description,
  release_notes,
  new_features,
  improvements,
  bug_fixes,
  breaking_changes,
  migration_required,
  minimum_supported_version,
  released_at,
  status
)
VALUES (
  '1.1.1',
  '1.1.0',
  'PATCH',
  'Online PK Beta、Nova Bot 與語音文章閱讀',
  'Online PK Beta、Nova Bot 對戰、語音朗讀與大型題庫匯入改善',
  'StudyNova V1.1.1 帶來全新的 Online PK Beta、Nova Bot 補位、語音朗讀與文章閱讀功能，並改善題庫匯入及競賽後台管理。',
  'Online PK 目前為 Beta 測試版本，部分配對規則、Bot 行為與競賽體驗將持續優化。低於 V1.1.1 的版本必須完成更新後才能使用最新版功能。',
  '[
    "全新 Online PK Beta：快速配對、好友 PK、自訂房間與公開競技場",
    "Nova Bot 真人不足自動補位，支援簡單、標準、困難強度",
    "語音朗讀文章、單字、例句、聽力與挑戰內容",
    "伺服器權威計分、即時排行榜與 PK 難度選擇"
  ]'::jsonb,
  '[
    "大型 PDF 題庫分批匯入、即時顯示已分析與已匯入題數",
    "題庫搜尋、分類篩選與每頁 100 題",
    "競賽中心與後台 PK／Bot 管理",
    "繁體中文圖片渲染與題庫資料同步"
  ]'::jsonb,
  '[
    "修正匯入完成後題數顯示為 0 題",
    "修正 PK 題庫與舊題目綁定及數量同步",
    "修正 Nova Bot 系統帳號資料庫 migration"
  ]'::jsonb,
  '[]'::jsonb,
  false,
  '1.1.1',
  now(),
  'PUBLISHED'
)
ON CONFLICT (version) DO UPDATE SET
  previous_version = EXCLUDED.previous_version,
  release_type = EXCLUDED.release_type,
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  release_notes = EXCLUDED.release_notes,
  new_features = EXCLUDED.new_features,
  improvements = EXCLUDED.improvements,
  bug_fixes = EXCLUDED.bug_fixes,
  breaking_changes = EXCLUDED.breaking_changes,
  migration_required = EXCLUDED.migration_required,
  minimum_supported_version = EXCLUDED.minimum_supported_version,
  released_at = COALESCE(software_releases.released_at, EXCLUDED.released_at),
  status = 'PUBLISHED',
  updated_at = now();
