-- Create active_double_win table to track when users activate double win skill
CREATE TABLE IF NOT EXISTS public.active_double_win (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  activated_round INTEGER NOT NULL,
  next_round INTEGER NOT NULL, -- The round where double win will be active
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, next_round)
);

-- Enable RLS
ALTER TABLE public.active_double_win ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read active double win"
  ON public.active_double_win FOR SELECT
  USING (true);

CREATE POLICY "System can insert active double win"
  ON public.active_double_win FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update active double win"
  ON public.active_double_win FOR UPDATE
  USING (true);

CREATE POLICY "System can delete active double win"
  ON public.active_double_win FOR DELETE
  USING (true);

-- Enable realtime for active_double_win
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_double_win;
