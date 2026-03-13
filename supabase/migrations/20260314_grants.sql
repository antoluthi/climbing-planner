-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — Grants manquants (cause de tous les 403)
-- À exécuter dans Supabase SQL Editor
-- Sûr à re-exécuter
-- ═══════════════════════════════════════════════════════════════════════════

-- Sans ces GRANTs, le rôle `authenticated` (= tout utilisateur connecté)
-- n'a aucun droit sur les tables même si les policies RLS sont correctes.
-- PostgREST retourne alors 403 / erreur 42501 (insufficient_privilege).

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT ALL ON TABLE public.climbing_plans      TO authenticated;
GRANT ALL ON TABLE public.coach_athletes       TO authenticated;
GRANT ALL ON TABLE public.sessions_catalog     TO authenticated;
GRANT ALL ON TABLE public.session_blocks       TO authenticated;
GRANT ALL ON TABLE public.session_feedbacks    TO authenticated;
GRANT ALL ON TABLE public.community_sessions   TO authenticated;

-- Sequences (pour les colonnes BIGSERIAL / SERIAL)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Vérification : doit lister toutes les tables ci-dessus avec des droits
SELECT grantee, table_name, privilege_type
FROM   information_schema.role_table_grants
WHERE  grantee = 'authenticated'
  AND  table_schema = 'public'
ORDER BY table_name, privilege_type;
