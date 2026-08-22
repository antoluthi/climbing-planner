-- ─── climbing_plans.updated_at horodaté par le serveur ──────────────────────
-- Toute la synchronisation repose sur une question : « la ligne a-t-elle bougé
-- depuis mon dernier échange ? ». Tant que c'est l'appareil qui écrit cette
-- date, deux téléphones mal réglés suffisent à la fausser — et un `updated_at`
-- envoyé à la main peut même reculer.
--
-- Avec ce trigger, la date vient toujours de la même horloge, celle de
-- Postgres. Le client continue d'en envoyer une (l'app doit marcher avant que
-- cette migration soit passée), mais le serveur la remplace.
--
-- Idempotent : ré-exécutable sans risque.

CREATE OR REPLACE FUNCTION public.climbing_plans_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS climbing_plans_set_updated_at ON public.climbing_plans;
CREATE TRIGGER climbing_plans_set_updated_at
  BEFORE INSERT OR UPDATE ON public.climbing_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.climbing_plans_touch_updated_at();
