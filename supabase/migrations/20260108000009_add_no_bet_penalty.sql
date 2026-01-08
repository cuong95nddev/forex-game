-- Add no_bet_penalty to game_settings
-- This penalty will be deducted from users who don't place a bet in a round
ALTER TABLE game_settings
ADD COLUMN no_bet_penalty DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- Add description comment
COMMENT ON COLUMN game_settings.no_bet_penalty IS 'Amount to deduct from users who do not place a bet in a round. Set to 0 to disable penalty.';

-- Update existing settings with default value (0 = no penalty)
UPDATE game_settings
SET no_bet_penalty = 0.00
WHERE no_bet_penalty IS NULL;
