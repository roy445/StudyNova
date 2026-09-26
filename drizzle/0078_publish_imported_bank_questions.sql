-- Imported questions are confirmed by an admin and must be available to PK immediately.
-- Older confirm/import paths omitted status, leaving them at the table default ('draft').
UPDATE questions
SET status = 'published', updated_at = now()
WHERE origin = 'bank'
  AND bank_id IS NOT NULL
  AND status = 'draft';
