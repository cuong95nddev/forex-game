-- Remove all skill-related database objects

-- Drop functions first (due to dependencies)
DROP FUNCTION IF EXISTS use_steal_money_skill(uuid, uuid, integer);
DROP FUNCTION IF EXISTS use_double_skill(uuid, integer);
DROP FUNCTION IF EXISTS use_freeze_skill(uuid, uuid, integer);
DROP FUNCTION IF EXISTS cleanup_expired_freeze_effects(integer);
DROP FUNCTION IF EXISTS assign_skills_to_all_users();
DROP FUNCTION IF EXISTS resolve_bet_with_skills(uuid, text, numeric);

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS skill_requests CASCADE;
DROP TABLE IF EXISTS skill_usage_history CASCADE;
DROP TABLE IF EXISTS active_skill_effects CASCADE;
DROP TABLE IF EXISTS user_skills CASCADE;
DROP TABLE IF EXISTS skill_definitions CASCADE;
