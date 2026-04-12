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
