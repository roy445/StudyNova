CREATE TABLE IF NOT EXISTS "exam_hub_material_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exam_hub_id" uuid NOT NULL REFERENCES "exam_hubs"("id") ON DELETE CASCADE,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL DEFAULT 'application/octet-stream',
  "object_id" uuid REFERENCES "storage_objects"("id") ON DELETE SET NULL,
  "extracted_text" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending',
  "material_id" uuid REFERENCES "study_materials"("id") ON DELETE SET NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exam_material_import_hub_idx" ON "exam_hub_material_imports" ("exam_hub_id", "status");
CREATE INDEX IF NOT EXISTS "exam_material_import_user_idx" ON "exam_hub_material_imports" ("uploaded_by", "created_at");
COMMENT ON TABLE "exam_hub_material_imports" IS '段考資料上傳後的暫存審核佇列；只有管理員確認後才建立正式教材來源';

-- 既有公告全部撤銷；公告範例只由後台 ANNOUNCEMENT_TEMPLATES 顯示，不建立成真實公告。
UPDATE "announcements" SET "status" = 'archived', "ends_at" = now(), "pinned" = false, "marquee" = false, "show_home" = false, "show_pwa" = false WHERE "status" <> 'archived';
