-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — TOUTES LES MIGRATIONS EN ATTENTE (juillet 2026)
-- Un seul copier-coller dans Supabase Dashboard → SQL Editor → Run.
-- Ré-exécutable sans risque (tous les scripts sont idempotents).
-- Contenu, dans l'ordre : realtime · bucket avatars · bibliothèque commune
--                         · profils publics · notifications + invitations
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══ 20260331_realtime_climbing_plans.sql ═══╗

-- Active Supabase Realtime sur la table climbing_plans.
-- Nécessaire pour que les autres appareils/onglets soient notifiés en temps réel
-- quand un appareil sauvegarde, ce qui permet de recharger silencieusement
-- et d'éviter les écrasements de données entre appareils.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'climbing_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.climbing_plans;
  END IF;
END $$;


-- ╔═══ 20260512_avatars_bucket.sql ═══╗

-- ─── Avatars bucket ──────────────────────────────────────────────────────────
-- Bucket public en lecture pour héberger les photos de profil.
-- Path convention : {auth.uid()}.jpg ou {auth.uid()}.png
-- Chaque utilisateur peut INSERT / UPDATE / DELETE uniquement son propre
-- fichier ; SELECT public via `public = true` sur le bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lecture publique (le bucket est déjà `public = true` mais on rend
-- explicite via une policy).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- INSERT : un utilisateur ne peut uploader que son propre fichier
-- (nom = {auth.uid()}.{ext}).
DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] IS NULL
    AND name LIKE auth.uid()::text || '.%'
  );

-- UPDATE : idem
DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  );

-- DELETE : idem
DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  );


-- ╔═══ 20260513_shared_sessions_catalog.sql ═══╗

-- ─── Catalogue de séances et de blocs partagé ───────────────────────────────
-- Avant : chaque utilisateur ne voyait/modifiait que ses propres rows
-- ("own rows" RLS).
-- Maintenant : la bibliothèque est commune à tous les utilisateurs
-- authentifiés. Tout le monde peut LIRE, INSÉRER, MODIFIER, SUPPRIMER.
-- La colonne user_id / created_by reste renseignée pour la traçabilité
-- (qui a créé la séance) mais n'est plus utilisée comme filtre RLS.

-- ── sessions_catalog ─────────────────────────────────────────────────────────
ALTER TABLE sessions_catalog ENABLE ROW LEVEL SECURITY;

-- Drop des anciennes policies (peu importe leurs noms : on les remplace
-- toutes par les 4 nouvelles).
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sessions_catalog'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON sessions_catalog', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "sessions_catalog_select_all"
  ON sessions_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sessions_catalog_insert_all"
  ON sessions_catalog FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "sessions_catalog_update_all"
  ON sessions_catalog FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "sessions_catalog_delete_all"
  ON sessions_catalog FOR DELETE
  TO authenticated
  USING (true);

-- ── session_blocks ──────────────────────────────────────────────────────────
ALTER TABLE session_blocks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_blocks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON session_blocks', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "session_blocks_select_all"
  ON session_blocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "session_blocks_insert_all"
  ON session_blocks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "session_blocks_update_all"
  ON session_blocks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "session_blocks_delete_all"
  ON session_blocks FOR DELETE
  TO authenticated
  USING (true);


-- ╔═══ 20260517_public_profiles.sql ═══╗

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


-- ╔═══ 20260715_notifications_coach_invites.sql ═══╗

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


-- ═══ Vérifications (doivent toutes passer sans erreur) ═══
select count(*) as notifications_ok from notifications;
select policyname from pg_policies where tablename = 'coach_athletes';
select count(*) as coaches_ok from get_my_coaches();
