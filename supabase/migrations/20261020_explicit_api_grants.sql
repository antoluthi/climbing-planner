-- ─── Droits d'accès à l'API, écrits en toutes lettres ───────────────────────
-- Le 30 octobre 2026, Supabase cesse d'accorder d'office l'accès à l'API
-- (supabase-js, PostgREST) aux NOUVELLES tables du schéma public. Une table
-- créée sans GRANT répond alors « permission denied » (42501), même si une
-- policy RLS l'autorise : la policy choisit les lignes, le GRANT ouvre la table.
--
-- Les tables existantes gardent leurs droits : sur le projet actuel, ce fichier
-- ne change rien. Il écrit ce qui ne tenait qu'aux anciens droits par défaut,
-- pour qu'une base recréée depuis les migrations (nouveau projet, restauration)
-- se comporte comme celle d'aujourd'hui. Les droits de `authenticated` sont
-- déjà dans les migrations qui créent chaque table ; deux accès ne figuraient
-- nulle part :
--
--   · `anon` lit `climbing_plans` : les plannings publics. La policy
--     « Public read for public profiles » (20260517) ne laisse passer que les
--     lignes `is_public = true`. Sans ce GRANT, elle ne sert à rien.
--   · `service_role` lit `climbing_plans` : le serveur CalDAV et le flux iCal
--     (`api/`), qui retrouvent un planning par `data.profile.calendarToken`.
--
-- Lecture seule dans les deux cas : c'est tout ce que le code leur demande.
--
-- Idempotent : un droit déjà accordé ne change rien.

GRANT SELECT ON public.climbing_plans TO anon;
GRANT SELECT ON public.climbing_plans TO service_role;
