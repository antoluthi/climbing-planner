-- ─── climbing_plans.status : autoriser 'solo' ────────────────────────────────
-- La colonne a été créée avec CHECK (status IN ('coach','athlete','auto')),
-- avant que « athlète solo » ne devienne un choix explicite. Depuis, l'app
-- écrit 'solo' — et Postgres refusait l'écriture (23514, violation de
-- contrainte), silencieusement : l'utilisateur croyait avoir choisi son rôle,
-- `status` restait NULL, et l'onboarding revenait au démarrage suivant.
--
-- NULL garde son sens : « n'a jamais choisi ».
--
-- Idempotent : la contrainte est déposée puis recréée.

ALTER TABLE public.climbing_plans
  DROP CONSTRAINT IF EXISTS climbing_plans_status_check;

ALTER TABLE public.climbing_plans
  ADD CONSTRAINT climbing_plans_status_check
  CHECK (status IS NULL OR status IN ('coach', 'athlete', 'auto', 'solo'));
