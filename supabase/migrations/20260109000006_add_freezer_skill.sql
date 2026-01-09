-- Add freezer skill to skill_definitions
INSERT INTO public.skill_definitions (id, name, description, icon, cooldown_rounds) 
VALUES 
  ('freezer', 'Freezer', 'Freeze a trader for 1 round, blocking them from betting', '🧊', 2)
ON CONFLICT (id) DO NOTHING;

-- Create frozen_users table to track frozen status
CREATE TABLE IF NOT EXISTS public.frozen_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  frozen_until_round INTEGER NOT NULL,
  frozen_by_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.frozen_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for frozen_users
CREATE POLICY "Users can read all frozen users"
  ON public.frozen_users FOR SELECT
  USING (true);

CREATE POLICY "System can manage frozen users"
  ON public.frozen_users FOR ALL
  USING (true);

-- Enable realtime for frozen_users so users can see when they get frozen
ALTER PUBLICATION supabase_realtime ADD TABLE public.frozen_users;
