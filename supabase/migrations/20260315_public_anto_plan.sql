-- Allow anonymous users to read Anto's climbing plan (public planning view)
CREATE POLICY "public_anto_plan_read"
  ON climbing_plans
  FOR SELECT
  TO anon
  USING (user_id = '80f1690e-6fd2-45fa-9b02-c7b6edf1f112');
