-- Create rounds table to track betting rounds
CREATE TABLE rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  round_number BIGINT UNIQUE NOT NULL,
  start_price DECIMAL(10, 2) NOT NULL,
  end_price DECIMAL(10, 2),
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('active', 'completed')) DEFAULT 'active'
);

-- Drop old trades table and create new one for betting
DROP TABLE IF EXISTS trades CASCADE;

CREATE TABLE bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  prediction TEXT CHECK (prediction IN ('up', 'down')) NOT NULL,
  bet_amount DECIMAL(15, 2) NOT NULL,
  result TEXT CHECK (result IN ('pending', 'won', 'lost')) DEFAULT 'pending',
  profit DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, round_id) -- One bet per user per round
);

-- Drop positions table as we don't need it anymore
DROP TABLE IF EXISTS positions CASCADE;

-- Create indexes
CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_rounds_round_number ON rounds(round_number DESC);
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_round_id ON bets(round_id);
CREATE INDEX idx_bets_result ON bets(result);

-- Enable RLS
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rounds
CREATE POLICY "Anyone can view rounds" ON rounds
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert rounds" ON rounds
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update rounds" ON rounds
  FOR UPDATE USING (true);

-- RLS Policies for bets
CREATE POLICY "Users can view all bets" ON bets
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their bets" ON bets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bets" ON bets
  FOR UPDATE USING (true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE bets;
