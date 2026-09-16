CREATE TABLE IF NOT EXISTS "legal_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "document_slug" text NOT NULL,
  "document_version" text NOT NULL,
  "consent_type" text NOT NULL DEFAULT 'accept',
  "agreed_at" timestamptz NOT NULL DEFAULT now(),
  "ip" text NOT NULL DEFAULT '',
  "user_agent" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "legal_consent_user_idx" ON "legal_consents" ("user_id", "document_slug", "agreed_at");
CREATE INDEX IF NOT EXISTS "legal_consent_version_idx" ON "legal_consents" ("document_slug", "document_version");
INSERT INTO "legal_documents" ("slug", "title", "version", "body", "effective_at")
VALUES
('registration_terms', '註冊條款與使用規範', '1.0', '建立 StudyNova 帳號前，請閱讀並同意帳號使用規定、隱私與內容安全要求。不得冒用他人身分、分享他人私人資料、濫用網站功能、修改 Nova、XP、成績或權限、上傳違法或不當內容、利用 AI 產生惡意內容、騷擾或威脅其他使用者、繞過權限或大量濫用 API。分享內容必須具有適當使用權。違規時平台得限制功能或停權，並可能保留必要操作紀錄以維護安全。', now()),
('usage_rules', 'StudyNova 使用規章', '1.0', '使用 StudyNova 時，請遵守帳號安全、內容安全、分享權限與社群互動規範。不得利用漏洞、機器人或其他方式破壞服務、取得他人資料或影響學習結果。使用者應對自己建立、上傳及分享的內容負責。', now())
ON CONFLICT ("slug") DO NOTHING;
