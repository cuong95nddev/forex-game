-- Create game_settings table to store system configuration
CREATE TABLE game_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_duration INT NOT NULL DEFAULT 15,
  price_update_interval INT NOT NULL DEFAULT 1,
  win_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.95,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO game_settings (round_duration, price_update_interval, win_rate)
VALUES (15, 1, 0.95);

-- Enable RLS
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Anyone can read, only admins can update (for now allow all)
CREATE POLICY "Anyone can view settings" ON game_settings
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update settings" ON game_settings
  FOR UPDATE USING (true);

-- Enable realtime for settings
ALTER PUBLICATION supabase_realtime ADD TABLE game_settings;
