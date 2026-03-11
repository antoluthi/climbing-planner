-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : community_sessions
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_sessions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id  TEXT        NOT NULL,         -- id local de la séance (string)
  session     JSONB       NOT NULL,         -- objet séance complet (title, blocks, charge…)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, session_id)
);

-- Index pour requêtes rapides
CREATE INDEX IF NOT EXISTS idx_community_sessions_user   ON community_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_community_sessions_updated ON community_sessions(updated_at DESC);

-- Row Level Security
ALTER TABLE community_sessions ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs connectés peuvent lire toutes les séances
CREATE POLICY "community_sessions_read_all"
  ON community_sessions FOR SELECT
  TO authenticated
  USING (true);

-- Un utilisateur ne peut insérer que ses propres séances
CREATE POLICY "community_sessions_insert_own"
  ON community_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Un utilisateur ne peut modifier que ses propres séances
CREATE POLICY "community_sessions_update_own"
  ON community_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Un utilisateur ne peut supprimer que ses propres séances
CREATE POLICY "community_sessions_delete_own"
  ON community_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
