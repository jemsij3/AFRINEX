-- Remove initial placeholder/stub catalog records and development-only user accounts.
-- Real user accounts and admin-published catalog records are preserved.

DELETE FROM lesson_progress
WHERE lesson_id IN ('lesson_ai_1', 'lesson_ai_2', 'lesson_tg_1', 'lesson_tg_2', 'lesson_auto_1');

DELETE FROM lessons
WHERE id IN ('lesson_ai_1', 'lesson_ai_2', 'lesson_tg_1', 'lesson_tg_2', 'lesson_auto_1');

DELETE FROM bookmarks
WHERE (item_type = 'course' AND item_id IN ('course_ai_foundations', 'course_tg_mini_apps', 'course_biz_automation'))
   OR (item_type = 'tool' AND item_id IN ('tool_workers_ai', 'tool_hono', 'tool_notion_ai', 'tool_figma', 'tool_copy_studio', 'tool_stripe_atlas'))
   OR (item_type = 'opportunity' AND item_id IN ('opp_cf_workers_fellow', 'opp_remote_ts', 'opp_web3_bounty', 'opp_africa_tech_summit'));

DELETE FROM courses
WHERE id IN ('course_ai_foundations', 'course_tg_mini_apps', 'course_biz_automation');

DELETE FROM ai_tools
WHERE id IN ('tool_workers_ai', 'tool_hono', 'tool_notion_ai', 'tool_figma', 'tool_copy_studio', 'tool_stripe_atlas');

DELETE FROM opportunities
WHERE id IN ('opp_cf_workers_fellow', 'opp_remote_ts', 'opp_web3_bounty', 'opp_africa_tech_summit');

DELETE FROM users
WHERE id IN ('usr_dev_admin', 'usr_dev_member');

DELETE FROM audit_logs
WHERE action = 'auth.dev_login';
