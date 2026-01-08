-- Reset last_used_round for all skills so they can be used immediately
UPDATE user_skills
SET last_used_round = 0;
