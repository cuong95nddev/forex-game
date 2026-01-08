-- Add allowed_users column to rounds table to track which users can participate
ALTER TABLE rounds ADD COLUMN allowed_users UUID[] DEFAULT '{}';

-- Add index for faster queries
CREATE INDEX idx_rounds_allowed_users ON rounds USING GIN (allowed_users);

-- Add comment
COMMENT ON COLUMN rounds.allowed_users IS 'Array of user IDs who were online when the round started and are allowed to participate';
