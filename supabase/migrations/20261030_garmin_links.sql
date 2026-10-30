-- ─── Garmin Connect : la clé d'API personnelle de chaque compte ─────────────
-- Garmin permet de générer une clé qui donne accès à ses propres données
-- (sommeil, VFC, Body Battery, activités…). La fonction `api/garmin` l'échange
-- contre un jeton de 24 h et lit les nuits pour l'app.
--
-- ⚠️ Cette table est fermée à tous les clients. La clé vaut jusqu'à un an
-- d'accès aux données de santé du compte Garmin :
--   · RLS activée et **aucune policy** : anon et authenticated ne voient
--     aucune ligne, pas même la leur ;
--   · aucun GRANT à anon ni à authenticated (REVOKE au cas où d'anciens droits
--     par défaut en auraient donné) ;
--   · seul `service_role` y touche, depuis le serveur (`api/_garmin-handler.js`).
-- L'app ne revoit jamais la clé, seulement ses quatre derniers caractères.
--
-- Depuis le 30 octobre 2026, une nouvelle table n'a plus aucun droit d'office :
-- sans le GRANT à service_role, le serveur lui-même recevrait 42501.
--
-- Idempotent : ré-exécutable sans risque.

CREATE TABLE IF NOT EXISTS public.garmin_links (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key          text NOT NULL,
  key_hint         text NOT NULL DEFAULT '',
  -- Le dernier jeton obtenu, réutilisé tant qu'il lui reste plus d'une heure.
  access_token     text,
  token_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_sync_at     timestamptz,
  last_error       text
);

ALTER TABLE public.garmin_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.garmin_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garmin_links TO service_role;
