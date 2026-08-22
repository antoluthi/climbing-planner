-- ─── session_feedbacks.session_id : INT → TEXT ───────────────────────────────
-- La colonne datait du catalogue numéroté. Une séance porte aujourd'hui un
-- identifiant généré côté client (`generateId()`, ex. « c_brmgrpkcmt3hp1ac ») :
-- chaque upsert de ressenti repartait en 400 / 22P02
--   invalid input syntax for type integer: "c_brmgrpkcmt3hp1ac"
-- et la table restait vide — l'historique « Retours athlètes » de la
-- bibliothèque n'avait donc jamais rien à afficher.
--
-- Idempotent : ne fait rien si la colonne est déjà en TEXT.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'session_feedbacks'
      AND column_name  = 'session_id'
      AND data_type   <> 'text'
  ) THEN
    ALTER TABLE public.session_feedbacks
      ALTER COLUMN session_id TYPE TEXT USING session_id::text;
  END IF;
END $$;
