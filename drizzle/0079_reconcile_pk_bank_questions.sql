-- Reconcile the legacy PK import: older imports stored the questions but did not
-- populate bank_id, so the PK bank showed zero despite the questions existing.
WITH pk_bank AS (
  SELECT id
  FROM question_banks
  WHERE name = 'PK題庫'
  ORDER BY updated_at DESC
  LIMIT 1
)
UPDATE questions AS q
SET bank_id = pk_bank.id,
    status = 'published',
    updated_at = now()
FROM pk_bank
WHERE q.bank_id IS NULL
  AND q.origin = 'bank'
  AND (
    q.target_bank = 'exclusive'
    OR q.source_label IN ('線上上傳題目檔案', 'PK題庫')
    OR q.bank_category = 'PK題庫'
  );

-- A bank created for PK should be visible as an active bank after its questions
-- have been reconciled. This is idempotent and leaves other banks untouched.
UPDATE question_banks
SET status = 'published', updated_at = now()
WHERE name = 'PK題庫'
  AND status = 'draft'
  AND EXISTS (SELECT 1 FROM questions WHERE questions.bank_id = question_banks.id);
