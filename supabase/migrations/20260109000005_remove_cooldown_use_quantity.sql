-- Update skill definitions to remove cooldown (set to 0)
UPDATE public.skill_definitions
SET cooldown_rounds = 0
WHERE id IN ('steal_money', 'double_win', 'shield');

-- Increase quantity for all existing users to 3 uses per skill
UPDATE public.user_skills
SET quantity = 3
WHERE skill_id = 'steal_money';
