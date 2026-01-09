-- Add bank loan skill

-- Insert bank_loan skill definition
INSERT INTO public.skill_definitions (id, name, description, icon, cooldown_rounds) 
VALUES 
  ('bank_loan', 'Bank Loan', 'Get instant cash from the bank', '🏦', 0)
ON CONFLICT (id) DO NOTHING;

-- Give existing users the bank_loan skill
INSERT INTO public.user_skills (user_id, skill_id, quantity)
SELECT u.id, 'bank_loan', 1
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_skills us 
  WHERE us.user_id = u.id AND us.skill_id = 'bank_loan'
);

-- Update the initialize_user_skills function to include bank_loan
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
