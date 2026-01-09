-- Update initial skill quantity from 3 to 1 for each skill

-- Update the initialize_user_skills function to give 1x each skill
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
  -- Give new user all default skills with 1x quantity
  INSERT INTO public.user_skills (user_id, skill_id, quantity)
  VALUES 
    (NEW.id, 'steal_money', 1),
    (NEW.id, 'double_win', 1),
    (NEW.id, 'freezer', 1),
    (NEW.id, 'bank_loan', 1)
  ON CONFLICT (user_id, skill_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
