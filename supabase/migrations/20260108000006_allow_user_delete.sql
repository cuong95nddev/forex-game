-- Add DELETE policy for users table
CREATE POLICY "Anyone can delete users" ON users
  FOR DELETE USING (true);

