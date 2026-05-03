-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — Catalog communautaire + feedback séances personnalisées
-- À exécuter intégralement dans Supabase SQL Editor
-- Sûr à re-exécuter (DROP IF EXISTS partout)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. sessions_catalog — catalog communautaire ──────────────────────────────
-- Tous les utilisateurs authentifiés peuvent lire, créer et modifier
-- toutes les séances du catalog (modèle communautaire).

DROP POLICY IF EXISTS "own_sessions_catalog"           ON public.sessions_catalog;
DROP POLICY IF EXISTS "community_catalog_select"       ON public.sessions_catalog;
DROP POLICY IF EXISTS "community_catalog_insert"       ON public.sessions_catalog;
DROP POLICY IF EXISTS "community_catalog_update"       ON public.sessions_catalog;
DROP POLICY IF EXISTS "community_catalog_delete"       ON public.sessions_catalog;

-- Lecture : tout utilisateur authentifié voit toutes les séances actives
CREATE POLICY "community_catalog_select"
  ON public.sessions_catalog FOR SELECT
  TO authenticated
  USING (true);

-- Insertion : tout utilisateur authentifié peut créer une séance (avec son user_id)
CREATE POLICY "community_catalog_insert"
  ON public.sessions_catalog FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Modification : tout utilisateur authentifié peut modifier n'importe quelle séance
CREATE POLICY "community_catalog_update"
  ON public.sessions_catalog FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Suppression : tout utilisateur authentifié peut supprimer n'importe quelle séance
CREATE POLICY "community_catalog_delete"
  ON public.sessions_catalog FOR DELETE
  TO authenticated
  USING (true);


-- ─── 2. session_blocks — blocs communautaires ─────────────────────────────────
-- Idem : tous les utilisateurs peuvent lire et modifier les blocs.

DROP POLICY IF EXISTS "own_session_blocks"           ON public.session_blocks;
DROP POLICY IF EXISTS "community_blocks_select"      ON public.session_blocks;
DROP POLICY IF EXISTS "community_blocks_insert"      ON public.session_blocks;
DROP POLICY IF EXISTS "community_blocks_update"      ON public.session_blocks;
DROP POLICY IF EXISTS "community_blocks_delete"      ON public.session_blocks;

CREATE POLICY "community_blocks_select"
  ON public.session_blocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "community_blocks_insert"
  ON public.session_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "community_blocks_update"
  ON public.session_blocks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "community_blocks_delete"
  ON public.session_blocks FOR DELETE
  TO authenticated
  USING (true);
