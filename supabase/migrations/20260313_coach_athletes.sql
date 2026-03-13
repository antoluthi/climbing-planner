-- ─── COACH-ATHLETE RELATIONSHIPS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_athletes (
  id          BIGSERIAL PRIMARY KEY,
  coach_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (coach_id, athlete_id)
);

ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;

-- Coaches manage their own athlete relationships
CREATE POLICY "Coaches manage coach_athletes"
  ON coach_athletes FOR ALL
  USING      (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- ─── climbing_plans: allow coaches to read/write their athletes' rows ─────────
-- NOTE: Supabase ORs multiple policies of the same FOR action together.
-- These are additive to your existing "users read/write own row" policy.

CREATE POLICY "Coaches can read athletes plans"
  ON climbing_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id  = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  );

CREATE POLICY "Coaches can update athletes plans"
  ON climbing_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id  = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id  = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  );

-- ─── search_athletes RPC ──────────────────────────────────────────────────────
-- Returns user_id + names for athletes matching the search term.
-- Uses SECURITY DEFINER so coaches can discover athletes they don't coach yet.
-- Only returns non-coach users (status IS NULL, 'athlete', or 'auto').
-- Excludes the caller themselves.

CREATE OR REPLACE FUNCTION search_athletes(search_term text)
RETURNS TABLE (user_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.user_id, cp.first_name, cp.last_name
  FROM   climbing_plans cp
  WHERE  cp.user_id != auth.uid()
    AND  (cp.status IS NULL OR cp.status IN ('athlete', 'auto'))
    AND  (
      cp.first_name ILIKE '%' || search_term || '%'
      OR cp.last_name  ILIKE '%' || search_term || '%'
    )
  ORDER BY cp.first_name, cp.last_name
  LIMIT 15;
$$;
