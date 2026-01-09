-- Allow anyone to update user skills (needed for admin panel to process skill usage)
CREATE POLICY "Anyone can update user skills"
  ON public.user_skills FOR UPDATE
  USING (true);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can update their own skills" ON public.user_skills;
