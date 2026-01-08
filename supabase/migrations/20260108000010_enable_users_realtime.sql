-- Enable realtime for users table
-- This allows clients to subscribe to user balance changes in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Add comment for documentation
COMMENT ON TABLE users IS 'Users table with realtime enabled for balance updates and penalty notifications';
