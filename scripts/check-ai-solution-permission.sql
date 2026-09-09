-- Run with a privileged production DATABASE_URL only:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-ai-solution-permission.sql
-- This query returns schema state only; it never prints credentials or row data beyond the feature config.
SELECT
  to_regclass('public.feature_permissions') AS feature_permissions_table,
  to_regclass('public.feature_usage') AS feature_usage_table,
  to_regclass('public.solution_sessions') AS solution_sessions_table;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('feature_permissions', 'feature_usage', 'solution_sessions')
ORDER BY table_name, ordinal_position;

SELECT feature, enabled, pro_only, free_daily_limit, pro_daily_limit, monthly_limit, nova_cost
FROM public.feature_permissions
WHERE feature = 'ai_solution';
