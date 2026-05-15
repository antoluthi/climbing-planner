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
