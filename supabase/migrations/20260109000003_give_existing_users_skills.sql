-- Give all existing users the default steal_money skill
INSERT INTO public.user_skills (user_id, skill_id, quantity)
SELECT u.id, 'steal_money', 1
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_skills us 
  WHERE us.user_id = u.id AND us.skill_id = 'steal_money'
);
