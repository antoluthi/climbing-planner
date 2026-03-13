-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — Migration coach-athlète
-- À exécuter intégralement dans Supabase SQL Editor
-- Sûr à re-exécuter (DROP IF EXISTS partout)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. TABLE coach_athletes ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_athletes (
  id          BIGSERIAL PRIMARY KEY,
  coach_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (coach_id, athlete_id)
);

ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches manage coach_athletes" ON coach_athletes;
CREATE POLICY "Coaches manage coach_athletes"
  ON coach_athletes FOR ALL
  USING      (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- ─── 2. RLS climbing_plans — remise à zéro complète ─────────────────────────
-- On supprime toutes les policies connues pour repartir proprement,
-- puis on recrée l'accès de base (propre à l'utilisateur) + accès coach.

-- Noms courants Supabase générés automatiquement ou créés manuellement :
DROP POLICY IF EXISTS "Enable read access for all users"       ON climbing_plans;
DROP POLICY IF EXISTS "Enable insert for authenticated users"  ON climbing_plans;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON climbing_plans;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON climbing_plans;
DROP POLICY IF EXISTS "Users manage own plan"                  ON climbing_plans;
DROP POLICY IF EXISTS "Users read own plan"                    ON climbing_plans;
DROP POLICY IF EXISTS "Users insert own plan"                  ON climbing_plans;
DROP POLICY IF EXISTS "Users update own plan"                  ON climbing_plans;
DROP POLICY IF EXISTS "Users delete own plan"                  ON climbing_plans;
DROP POLICY IF EXISTS "Own row full access"                    ON climbing_plans;
DROP POLICY IF EXISTS "Coaches can read athletes plans"        ON climbing_plans;
DROP POLICY IF EXISTS "Coaches can update athletes plans"      ON climbing_plans;
DROP POLICY IF EXISTS "Coaches read athletes"                  ON climbing_plans;
DROP POLICY IF EXISTS "Coaches update athletes"                ON climbing_plans;

-- Accès complet sur sa propre ligne (lecture + écriture)
CREATE POLICY "Own row full access"
  ON climbing_plans FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Coach : lecture des lignes de ses athlètes
CREATE POLICY "Coaches read athletes"
  ON climbing_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id   = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  );

-- Coach : mise à jour des lignes de ses athlètes
CREATE POLICY "Coaches update athletes"
  ON climbing_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id   = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_athletes
      WHERE coach_athletes.coach_id   = auth.uid()
        AND coach_athletes.athlete_id = climbing_plans.user_id
    )
  );

-- ─── 3. RPC search_athletes ───────────────────────────────────────────────────

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
