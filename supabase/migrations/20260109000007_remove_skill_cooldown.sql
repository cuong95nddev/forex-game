-- Remove cooldown from skills - they can be used immediately

-- Update steal skill to have no cooldown
UPDATE skill_definitions
SET cooldown_rounds = 0
WHERE skill_type = 'steal';

-- Update double skill to have no cooldown
UPDATE skill_definitions
SET cooldown_rounds = 0
WHERE skill_type = 'double';
