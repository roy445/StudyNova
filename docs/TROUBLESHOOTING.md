# StudyNova Production Troubleshooting

## Admin textbook creation (`POST /api/v1/admin/textbooks`)

The endpoint validates the administrator request, inserts one row into `textbook_editions`, writes an audit event, and returns the created edition. Validation failures return `SN-REQ-2002`; database failures return `SN-ADM-TB-002`. The server logs a structured diagnostic containing the request ID, route, administrator user ID and role, PostgreSQL error category, operation, validation result, timestamp, and server-only stack trace. Secrets, cookies, authorization headers, passwords, tokens, and API keys must never be logged.

If the error category is `missing_table_or_column`, compare the production table with `drizzle/0041_textbook_detail_ocr.sql` and the repair migration `drizzle/0067_repair_textbook_edition_columns.sql`. The required additive columns are `description`, `isbn`, and `metadata`. Apply the idempotent migration through the normal production migration workflow, then verify that the deployment uses the commit containing the migration.

The September 2026 incident was caused by production schema drift: the application schema and route expected the three additive textbook-detail columns, while production `textbook_editions` did not contain them. The columns were restored idempotently in Neon and the repair migration was committed so the mismatch does not recur in another environment.
