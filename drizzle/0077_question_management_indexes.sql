CREATE INDEX IF NOT EXISTS "questions_bank_category_idx" ON "questions" USING btree ("bank_category", "type", "level");
CREATE INDEX IF NOT EXISTS "questions_bank_id_idx" ON "questions" USING btree ("bank_id", "created_at");
