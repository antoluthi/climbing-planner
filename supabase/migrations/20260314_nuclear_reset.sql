-- ═══════════════════════════════════════════════════════════════════════════════
-- CLIMBING PLANNER — RESET COMPLET DE LA BASE DE DONNÉES
-- À exécuter dans Supabase SQL Editor (Settings > SQL Editor > New query)
--
-- ⚠️  CE SCRIPT SUPPRIME ET RECRÉE TOUTES LES TABLES
-- ⚠️  Si tu as des données à garder, exécute d'abord le bloc BACKUP ci-dessous
-- ✅  Sûr à re-exécuter (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── OPTIONNEL : backup si tu veux récupérer des données existantes ───────────
-- Décommente si nécessaire :
-- CREATE TABLE IF NOT EXISTS climbing_plans_backup AS SELECT * FROM climbing_plans;


-- ─── 1. SUPPRESSION (ordre important : FK d'abord) ───────────────────────────

DROP TABLE IF EXISTS public.session_feedbacks  CASCADE;
DROP TABLE IF EXISTS public.community_sessions CASCADE;
DROP TABLE IF EXISTS public.session_blocks     CASCADE;
DROP TABLE IF EXISTS public.sessions_catalog   CASCADE;
DROP TABLE IF EXISTS public.coach_athletes     CASCADE;
DROP TABLE IF EXISTS public.climbing_plans     CASCADE;

DROP FUNCTION IF EXISTS public.search_athletes(text);


-- ─── 2. TABLE coach_athletes ─────────────────────────────────────────────────
-- Créée en premier car climbing_plans y fait référence dans ses policies

CREATE TABLE public.coach_athletes (
  id          BIGSERIAL   PRIMARY KEY,
  coach_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, athlete_id)
);

ALTER TABLE public.coach_athletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_manages_own_athletes"
  ON public.coach_athletes FOR ALL
  USING      (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

GRANT ALL ON TABLE public.coach_athletes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.coach_athletes_id_seq TO authenticated;


-- ─── 3. TABLE climbing_plans ─────────────────────────────────────────────────
-- Une ligne par utilisateur. Contient TOUT : planning, cycles, notes, profil.

CREATE TABLE public.climbing_plans (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  first_name  TEXT,
  last_name   TEXT,
  status      TEXT        CHECK (status IN ('coach', 'athlete', 'auto')),
  -- NULL = athlète solo (défaut)
  -- 'coach'   = coach avec accès bibliothèque + athlètes
  -- 'athlete' = athlète suivi, cycles en lecture seule
  -- 'auto'    = athlète autonome, même accès que coach
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.climbing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_row"
  ON public.climbing_plans FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "coach_read_athletes"
  ON public.climbing_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = auth.uid() AND ca.athlete_id = climbing_plans.user_id
    )
  );

CREATE POLICY "coach_update_athletes"
  ON public.climbing_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = auth.uid() AND ca.athlete_id = climbing_plans.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = auth.uid() AND ca.athlete_id = climbing_plans.user_id
    )
  );

GRANT ALL ON TABLE public.climbing_plans TO authenticated;


-- ─── 4. TABLE sessions_catalog ───────────────────────────────────────────────

CREATE TABLE public.sessions_catalog (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT,
  name           TEXT        NOT NULL,
  charge         INT,
  min_recovery   INT,
  estimated_time INT,
  description    TEXT,
  extra          JSONB,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order     INT         NOT NULL DEFAULT 999,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_sessions_catalog"
  ON public.sessions_catalog FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.sessions_catalog TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sessions_catalog_id_seq TO authenticated;


-- ─── 5. TABLE session_blocks ─────────────────────────────────────────────────

CREATE TABLE public.session_blocks (
  id          BIGSERIAL   PRIMARY KEY,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_type  TEXT,
  name        TEXT        NOT NULL,
  duration    INT,
  charge      INT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_session_blocks"
  ON public.session_blocks FOR ALL
  USING      (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

GRANT ALL ON TABLE public.session_blocks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.session_blocks_id_seq TO authenticated;


-- ─── 6. TABLE session_feedbacks ──────────────────────────────────────────────

CREATE TABLE public.session_feedbacks (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_name    TEXT,
  session_id      INT,
  session_name    TEXT        NOT NULL,
  feedback_date   DATE        NOT NULL,
  week_key        TEXT,
  done            BOOLEAN,
  rpe             INT,
  quality         INT,
  notes           TEXT,
  block_feedbacks JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_name, feedback_date)
);

ALTER TABLE public.session_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_feedbacks"
  ON public.session_feedbacks FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Coach peut lire les feedbacks de ses athlètes
CREATE POLICY "authenticated_read_feedbacks"
  ON public.session_feedbacks FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.session_feedbacks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.session_feedbacks_id_seq TO authenticated;


-- ─── 7. TABLE community_sessions ─────────────────────────────────────────────

CREATE TABLE public.community_sessions (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT        NOT NULL,
  session     JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

ALTER TABLE public.community_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_community_sessions"
  ON public.community_sessions FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tout le monde peut lire les sessions communautaires
CREATE POLICY "authenticated_read_community"
  ON public.community_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.community_sessions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.community_sessions_id_seq TO authenticated;


-- ─── 8. RPC search_athletes ──────────────────────────────────────────────────
-- SECURITY DEFINER pour contourner RLS sur la recherche cross-users

CREATE FUNCTION public.search_athletes(search_term text)
RETURNS TABLE (user_id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.user_id, cp.first_name, cp.last_name
  FROM   public.climbing_plans cp
  WHERE  cp.user_id != auth.uid()
    AND  (cp.status IS NULL OR cp.status IN ('athlete', 'auto'))
    AND  (
      cp.first_name ILIKE '%' || search_term || '%'
      OR cp.last_name  ILIKE '%' || search_term || '%'
    )
  ORDER BY cp.first_name, cp.last_name
  LIMIT 15;
$$;

GRANT EXECUTE ON FUNCTION public.search_athletes(text) TO authenticated;


-- ─── 9. VÉRIFICATION ─────────────────────────────────────────────────────────
-- Exécute cette requête pour confirmer que tout est en place :

SELECT
  t.table_name,
  COUNT(p.policyname) AS nb_policies,
  bool_or(g.privilege_type = 'SELECT') AS has_select,
  bool_or(g.privilege_type = 'INSERT') AS has_insert,
  bool_or(g.privilege_type = 'UPDATE') AS has_update,
  bool_or(g.privilege_type = 'DELETE') AS has_delete
FROM information_schema.tables t
LEFT JOIN pg_policies p ON p.tablename = t.table_name AND p.schemaname = 'public'
LEFT JOIN information_schema.role_table_grants g
  ON g.table_name = t.table_name AND g.table_schema = 'public' AND g.grantee = 'authenticated'
WHERE t.table_schema = 'public'
  AND t.table_name IN ('climbing_plans','coach_athletes','sessions_catalog','session_blocks','session_feedbacks','community_sessions')
GROUP BY t.table_name
ORDER BY t.table_name;

-- Résultat attendu : 6 lignes, toutes avec nb_policies >= 1 et has_select/insert/update/delete = true
