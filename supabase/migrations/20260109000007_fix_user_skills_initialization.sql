-- Update the initialize_user_skills function to give all available skills to new users
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
  -- Give new user all default skills
  INSERT INTO public.user_skills (user_id, skill_id, quantity)
  VALUES 
    (NEW.id, 'steal_money', 3),
    (NEW.id, 'double_win', 3),
    (NEW.id, 'shield', 3),
    (NEW.id, 'freezer', 3)
  ON CONFLICT (user_id, skill_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also ensure all existing users have all skills (run once)
INSERT INTO public.user_skills (user_id, skill_id, quantity)
SELECT u.id, 'double_win', 3
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_skills us 
  WHERE us.user_id = u.id AND us.skill_id = 'double_win'
);

INSERT INTO public.user_skills (user_id, skill_id, quantity)
SELECT u.id, 'shield', 3
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_skills us 
  WHERE us.user_id = u.id AND us.skill_id = 'shield'
);

INSERT INTO public.user_skills (user_id, skill_id, quantity)
SELECT u.id, 'freezer', 3
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_skills us 
  WHERE us.user_id = u.id AND us.skill_id = 'freezer'
);

-- Update steal_money quantity to 3 for all users who have it with quantity 1
UPDATE public.user_skills
SET quantity = 3
WHERE skill_id = 'steal_money' AND quantity = 1;
