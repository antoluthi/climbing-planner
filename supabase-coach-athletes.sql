-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : coach_athletes
-- Relation coach → athlète : le coach crée/édite les cycles, l'athlète les lit.
--
-- À exécuter dans : Supabase Dashboard > SQL Editor
--
-- Workflow :
--   1. Le coach invite un athlète par email (INSERT status='pending')
--   2. L'athlète (une fois connecté) accepte (UPDATE status='accepted')
--   3. Le coach peut modifier les mésocycles/cycles de l'athlète
--   4. L'athlète voit ses cycles en mode lecture seule (timeline verrouillée)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_athletes (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  athlete_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email  TEXT        NOT NULL,              -- email de l'athlète invité
  status         TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_id, invited_email)
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_coach_athletes_coach   ON coach_athletes(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_athletes_athlete ON coach_athletes(athlete_id);
CREATE INDEX IF NOT EXISTS idx_coach_athletes_email   ON coach_athletes(invited_email);
CREATE INDEX IF NOT EXISTS idx_coach_athletes_status  ON coach_athletes(status);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_coach_athletes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coach_athletes_updated_at ON coach_athletes;
CREATE TRIGGER trg_coach_athletes_updated_at
  BEFORE UPDATE ON coach_athletes
  FOR EACH ROW EXECUTE FUNCTION update_coach_athletes_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE coach_athletes ENABLE ROW LEVEL SECURITY;

-- Un coach voit ses propres relations (lignes où il est coach)
CREATE POLICY "coach_athletes_coach_select"
  ON coach_athletes FOR SELECT
  TO authenticated
  USING (auth.uid() = coach_id);

-- Un athlète voit les invitations qui le concernent (par athlete_id ou par email)
CREATE POLICY "coach_athletes_athlete_select"
  ON coach_athletes FOR SELECT
  TO authenticated
  USING (
    auth.uid() = athlete_id
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Seul le coach peut créer une invitation
CREATE POLICY "coach_athletes_coach_insert"
  ON coach_athletes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = coach_id);

-- Le coach peut supprimer ses relations / l'athlète peut rejeter (UPDATE status)
CREATE POLICY "coach_athletes_update"
  ON coach_athletes FOR UPDATE
  TO authenticated
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- Le coach peut supprimer la relation
CREATE POLICY "coach_athletes_delete"
  ON coach_athletes FOR DELETE
  TO authenticated
  USING (auth.uid() = coach_id);

-- ── FONCTION HELPER : lier athlete_id lors de l'acceptation ──────────────────
-- Appelée par l'athlète après connexion : met à jour athlete_id + status
-- Usage : SELECT accept_coach_invitation('email@du.coach', '<uuid_coach>');
CREATE OR REPLACE FUNCTION accept_coach_invitation(p_coach_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  UPDATE coach_athletes
  SET athlete_id = auth.uid(),
      status = 'accepted'
  WHERE coach_id = p_coach_id
    AND invited_email = v_email
    AND status = 'pending';
END;
$$;
