-- Balance AI quotas: free users can use speech, while Pro retains a moderate advantage.
UPDATE feature_permissions SET free_daily_limit = 12, pro_daily_limit = 40 WHERE feature = 'ai_context';
UPDATE feature_permissions SET free_daily_limit = 3, pro_daily_limit = 8 WHERE feature = 'ai_practice';
UPDATE feature_permissions SET free_daily_limit = 3, pro_daily_limit = 8 WHERE feature = 'material_organize';
UPDATE feature_permissions SET enabled = true, pro_only = false, free_daily_limit = 1, pro_daily_limit = 3 WHERE feature = 'ai_study_plan';
UPDATE feature_permissions SET free_daily_limit = 6, pro_daily_limit = 15 WHERE feature = 'wrong_review_ai';
UPDATE feature_permissions SET enabled = true, pro_only = false, free_daily_limit = -1, pro_daily_limit = -1 WHERE feature = 'ai_speech';
INSERT INTO feature_permissions (feature, label, enabled, pro_only, free_daily_limit, pro_daily_limit, monthly_limit, nova_cost)
VALUES ('speech_analysis', 'AI 語音分析', true, false, 2, 6, 0, 0)
ON CONFLICT (feature) DO UPDATE SET enabled = true, pro_only = false, free_daily_limit = 2, pro_daily_limit = 6, monthly_limit = 0;
UPDATE feature_permissions SET free_daily_limit = 3, pro_daily_limit = 10 WHERE feature = 'ai_visual';
UPDATE feature_permissions SET free_daily_limit = 10, pro_daily_limit = 40 WHERE feature = 'learning_ai_chat';
UPDATE feature_permissions SET free_daily_limit = 2, pro_daily_limit = 8 WHERE feature = 'learning_ai_question_generation';
UPDATE feature_permissions SET enabled = true, pro_only = false, free_daily_limit = -1, pro_daily_limit = -1, monthly_limit = 0 WHERE feature = 'learning_chapter_pdf';
UPDATE feature_permissions SET free_daily_limit = 5, pro_daily_limit = 20 WHERE feature = 'image_ocr';
UPDATE feature_permissions SET enabled = true, pro_only = false, free_daily_limit = 2, pro_daily_limit = 6 WHERE feature = 'multi_image_ocr';
UPDATE feature_permissions SET free_daily_limit = 3, pro_daily_limit = 15 WHERE feature = 'ai_solution';
UPDATE feature_permissions SET free_daily_limit = 8, pro_daily_limit = 25 WHERE feature = 'ai_solution_upload';
UPDATE feature_permissions SET free_daily_limit = 1, pro_daily_limit = 5, monthly_limit = 20 WHERE feature = 'essay_grading';
