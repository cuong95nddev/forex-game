-- Add bet limits and default balance to game_settings
ALTER TABLE game_settings
ADD COLUMN default_user_balance DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
ADD COLUMN min_bet_amount DECIMAL(15, 2) NOT NULL DEFAULT 10.00,
ADD COLUMN max_bet_amount DECIMAL(15, 2) NOT NULL DEFAULT 50000.00;

-- Update existing settings with default values
UPDATE game_settings
SET 
  default_user_balance = 10000.00,
  min_bet_amount = 10.00,
  max_bet_amount = 50000.00
WHERE default_user_balance IS NULL OR min_bet_amount IS NULL OR max_bet_amount IS NULL;
