-- Add is_public flag to climbing_plans so users can opt-in to public visibility.
-- To enable for your profile, run in Supabase SQL editor:
--   UPDATE climbing_plans SET is_public = true WHERE user_id = 'your-user-id';
-- Replace 'your-user-id' with your actual UUID from auth.users (visible in Authentication > Users).

ALTER TABLE climbing_plans ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Drop the old Anto-specific anon policy if it exists
DROP POLICY IF EXISTS "Public read Anto plan" ON climbing_plans;
DROP POLICY IF EXISTS "Public read for Anto plan" ON climbing_plans;
DROP POLICY IF EXISTS "anon read anto" ON climbing_plans;

-- Generic policy: anonymous users can read any row marked is_public = true
CREATE POLICY "Public read for public profiles"
  ON climbing_plans
  FOR SELECT
  TO anon
  USING (is_public = true);
