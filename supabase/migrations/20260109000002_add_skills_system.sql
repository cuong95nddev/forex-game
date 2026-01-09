-- Create skill_definitions table
CREATE TABLE IF NOT EXISTS public.skill_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT '⚡',
  cooldown_rounds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_skills table
CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES public.skill_definitions(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  last_used_round INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

-- Create skill_usage_log table
CREATE TABLE IF NOT EXISTS public.skill_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES public.skill_definitions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  amount INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create skill_signals table for real-time communication
CREATE TABLE IF NOT EXISTS public.skill_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type TEXT NOT NULL, -- 'skill_request', 'skill_executed'
  from_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID,
  skill_id TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  round_number INTEGER,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default skill definitions
INSERT INTO public.skill_definitions (id, name, description, icon, cooldown_rounds) 
VALUES 
  ('steal_money', 'Steal Money', 'Steal bananas from another trader', '💰', 3),
  ('double_win', 'Double Win', 'Double your winnings next round', '🎲', 5),
  ('shield', 'Shield', 'Protect yourself from steal attempts', '🛡️', 4)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for skill_definitions (everyone can read)
CREATE POLICY "Anyone can read skill definitions"
  ON public.skill_definitions FOR SELECT
  USING (true);

-- RLS Policies for user_skills
CREATE POLICY "Users can read all user skills"
  ON public.user_skills FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own skills"
  ON public.user_skills FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert user skills"
  ON public.user_skills FOR INSERT
  WITH CHECK (true);

-- RLS Policies for skill_usage_log
CREATE POLICY "Users can read skill usage logs"
  ON public.skill_usage_log FOR SELECT
  USING (true);

CREATE POLICY "System can insert skill usage logs"
  ON public.skill_usage_log FOR INSERT
  WITH CHECK (true);

-- RLS Policies for skill_signals
CREATE POLICY "Users can read all skill signals"
  ON public.skill_signals FOR SELECT
  USING (true);

CREATE POLICY "Users can insert skill signals"
  ON public.skill_signals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update skill signals"
  ON public.skill_signals FOR UPDATE
  USING (true);

CREATE POLICY "System can delete skill signals"
  ON public.skill_signals FOR DELETE
  USING (true);

-- Enable realtime for skill_signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_skills;

-- Function to initialize default skills for new users
CREATE OR REPLACE FUNCTION initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
  -- Give new user the steal_money skill
  INSERT INTO public.user_skills (user_id, skill_id, quantity)
  VALUES (NEW.id, 'steal_money', 1);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to initialize skills when user is created
CREATE TRIGGER on_user_created_initialize_skills
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_skills();
