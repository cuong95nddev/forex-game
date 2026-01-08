-- Create presence tracking table
CREATE TABLE IF NOT EXISTS presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  session_type TEXT NOT NULL CHECK (session_type IN ('admin', 'user')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_presence_session_type ON presence(session_type);
CREATE INDEX idx_presence_last_seen ON presence(last_seen);
CREATE INDEX idx_presence_user_id ON presence(user_id);

-- Enable RLS
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read presence
CREATE POLICY "Allow all to read presence" ON presence
  FOR SELECT
  USING (true);

-- Allow everyone to insert/update their own presence
CREATE POLICY "Allow all to insert presence" ON presence
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update their own presence" ON presence
  FOR UPDATE
  USING (true);

-- Allow everyone to delete presence (for cleanup)
CREATE POLICY "Allow all to delete presence" ON presence
  FOR DELETE
  USING (true);

-- Function to clean up stale presence (older than 30 seconds)
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS void AS $$
BEGIN
  DELETE FROM presence WHERE last_seen < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;

-- Enable realtime for presence table
ALTER PUBLICATION supabase_realtime ADD TABLE presence;
