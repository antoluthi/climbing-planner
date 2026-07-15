-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — Notifications + invitations coach-athlète (consentement)
-- À exécuter intégralement dans Supabase SQL Editor.
-- Sûr à re-exécuter (IF NOT EXISTS / DROP IF EXISTS partout).
--
-- Ce que change cette migration :
--  1. Table `notifications` (cloche in-app) : demandes de coaching,
--     acceptations/refus, et mises à jour de planning par le coach.
--  2. `coach_athletes` : le lien n'est plus créé par le coach mais par
--     l'ATHLÈTE qui accepte l'invitation (consentement mutuel). Corrige au
--     passage la faille : avant, n'importe quel utilisateur authentifié
--     pouvait s'auto-déclarer coach de n'importe quel non-coach et obtenir
--     lecture/écriture sur toutes ses données.
--  3. `search_athletes` : inclut le nouveau statut explicite 'solo'
--     (écrit par l'onboarding à la place de NULL — NULL signifie désormais
--     « n'a jamais choisi », ce qui fiabilise l'affichage du choix de rôle).
--  4. RPC `get_my_coaches()` : permet à un athlète de voir qui le coache
--     (le nom du coach n'est pas lisible via RLS climbing_plans).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. TABLE notifications ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- destinataire
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,          -- émetteur
  type         TEXT NOT NULL,             -- 'coach_request' | 'coach_accepted' | 'coach_declined' | 'plan_update'
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb, -- { fromName, weeks, cyclesChanged, ... }
  status       TEXT NOT NULL DEFAULT 'unread',     -- 'unread' | 'read' | 'accepted' | 'declined'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif recipient read"  ON notifications;
DROP POLICY IF EXISTS "notif sender read"     ON notifications;
DROP POLICY IF EXISTS "notif sender insert"   ON notifications;
DROP POLICY IF EXISTS "notif recipient update" ON notifications;
DROP POLICY IF EXISTS "notif delete"          ON notifications;

-- Destinataire ET émetteur peuvent lire (l'émetteur voit l'état de ses invitations)
CREATE POLICY "notif recipient read"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = from_user_id);

-- Seul l'émetteur authentifié peut créer une notification en son nom
CREATE POLICY "notif sender insert"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- Seul le destinataire change le statut (lu / accepté / refusé)
CREATE POLICY "notif recipient update"
  ON notifications FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Destinataire ou émetteur peuvent supprimer (annuler une invitation)
CREATE POLICY "notif delete"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = from_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;

-- Temps réel : la cloche se met à jour sans recharger
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. coach_athletes : le lien est créé par l'athlète (consentement) ──────

DROP POLICY IF EXISTS "Coaches manage coach_athletes" ON coach_athletes;
DROP POLICY IF EXISTS "athlete accepts link"          ON coach_athletes;
DROP POLICY IF EXISTS "both sides read link"          ON coach_athletes;
DROP POLICY IF EXISTS "both sides delete link"        ON coach_athletes;

-- INSERT : uniquement l'athlète (en acceptant une invitation)
CREATE POLICY "athlete accepts link"
  ON coach_athletes FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

-- SELECT : les deux côtés voient la relation
CREATE POLICY "both sides read link"
  ON coach_athletes FOR SELECT
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- DELETE : le coach retire un athlète, ou l'athlète quitte son coach
CREATE POLICY "both sides delete link"
  ON coach_athletes FOR DELETE
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- ─── 3. search_athletes : inclut le statut explicite 'solo' ─────────────────

CREATE OR REPLACE FUNCTION search_athletes(search_term text)
RETURNS TABLE (user_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.user_id, cp.first_name, cp.last_name
  FROM   climbing_plans cp
  WHERE  cp.user_id != auth.uid()
    AND  (cp.status IS NULL OR cp.status IN ('athlete', 'auto', 'solo'))
    AND  (
      cp.first_name ILIKE '%' || search_term || '%'
      OR cp.last_name  ILIKE '%' || search_term || '%'
    )
  ORDER BY cp.first_name, cp.last_name
  LIMIT 15;
$$;

-- ─── 4. RPC get_my_coaches : l'athlète voit qui le coache ───────────────────
-- SECURITY DEFINER car l'athlète n'a pas le droit de lire la ligne
-- climbing_plans de son coach via RLS.

CREATE OR REPLACE FUNCTION get_my_coaches()
RETURNS TABLE (relation_id bigint, user_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.id, cp.user_id, cp.first_name, cp.last_name
  FROM   coach_athletes ca
  JOIN   climbing_plans cp ON cp.user_id = ca.coach_id
  WHERE  ca.athlete_id = auth.uid()
  ORDER BY cp.first_name;
$$;

GRANT EXECUTE ON FUNCTION get_my_coaches() TO authenticated;
