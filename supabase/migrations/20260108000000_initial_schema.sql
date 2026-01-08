-- Create users table
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 10000.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create gold_prices table
CREATE TABLE gold_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  price DECIMAL(10, 2) NOT NULL,
  change DECIMAL(10, 2) DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trades table
CREATE TABLE trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('buy', 'sell')) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  gold_quantity DECIMAL(15, 6) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create positions table
CREATE TABLE positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  gold_quantity DECIMAL(15, 6) DEFAULT 0,
  average_price DECIMAL(10, 2) DEFAULT 0
);

-- Create indexes
CREATE INDEX idx_users_fingerprint ON users(fingerprint);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX idx_gold_prices_timestamp ON gold_prices(timestamp DESC);
CREATE INDEX idx_positions_user_id ON positions(user_id);

-- Insert initial gold price
INSERT INTO gold_prices (price, change) VALUES (2000.00, 0);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can insert themselves" ON users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update themselves" ON users
  FOR UPDATE USING (true);

-- RLS Policies for gold_prices
CREATE POLICY "Anyone can view gold prices" ON gold_prices
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert gold prices" ON gold_prices
  FOR INSERT WITH CHECK (true);

-- RLS Policies for trades
CREATE POLICY "Users can view all trades" ON trades
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their trades" ON trades
  FOR INSERT WITH CHECK (true);

-- RLS Policies for positions
CREATE POLICY "Users can view all positions" ON positions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their positions" ON positions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their positions" ON positions
  FOR UPDATE USING (true);
