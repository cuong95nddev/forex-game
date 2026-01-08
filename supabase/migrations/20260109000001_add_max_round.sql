-- Add max_round field to game_settings table
ALTER TABLE game_settings ADD COLUMN max_round INT DEFAULT NULL;

-- Add game_status field to track game state
ALTER TABLE game_settings ADD COLUMN game_status TEXT CHECK (game_status IN ('running', 'completed')) DEFAULT 'running';

-- Comment: max_round = NULL means unlimited rounds, any positive number means game ends after that round
