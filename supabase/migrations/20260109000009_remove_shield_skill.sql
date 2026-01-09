-- Remove shield skill

-- Delete user_skills entries for shield
DELETE FROM public.user_skills WHERE skill_id = 'shield';

-- Delete shield skill definition
DELETE FROM public.skill_definitions WHERE id = 'shield';

-- Update the initialize_user_skills function to remove shield
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
  -- Give new user all default skills (without shield)
  INSERT INTO public.user_skills (user_id, skill_id, quantity)
  VALUES 
    (NEW.id, 'steal_money', 3),
    (NEW.id, 'double_win', 3),
    (NEW.id, 'freezer', 3)
  ON CONFLICT (user_id, skill_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
