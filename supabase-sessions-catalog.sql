-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : sessions_catalog
-- Catalogue des séances et exercices prédéfinis (remplace le const SESSIONS)
--
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- Ensuite modifiable via : Dashboard > Table Editor ou SQL direct
--
-- Exemples de manipulations de masse :
--   UPDATE sessions_catalog SET charge = ROUND(charge * 1.1) WHERE type = 'Grimpe';
--   UPDATE sessions_catalog SET is_active = false WHERE name ILIKE '%compète%';
--   INSERT INTO sessions_catalog (type, name, charge) VALUES ('Grimpe', 'Nouveau type', 30);
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions_catalog (
  id            INTEGER       PRIMARY KEY,
  type          TEXT          NOT NULL CHECK (type IN ('Grimpe', 'Exercice')),
  name          TEXT          NOT NULL,
  charge        INTEGER       NOT NULL DEFAULT 0,
  min_recovery  INTEGER,                        -- récupération minimale en heures
  estimated_time INTEGER,                       -- durée estimée en minutes
  description   TEXT,                           -- description / notes
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_sessions_catalog_type   ON sessions_catalog(type);
CREATE INDEX IF NOT EXISTS idx_sessions_catalog_active ON sessions_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_catalog_order  ON sessions_catalog(sort_order, id);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_sessions_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sessions_catalog_updated_at ON sessions_catalog;
CREATE TRIGGER trg_sessions_catalog_updated_at
  BEFORE UPDATE ON sessions_catalog
  FOR EACH ROW EXECUTE FUNCTION update_sessions_catalog_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE sessions_catalog ENABLE ROW LEVEL SECURITY;

-- Lecture publique (même sans auth) — c'est un catalogue partagé
CREATE POLICY "sessions_catalog_read_public"
  ON sessions_catalog FOR SELECT
  USING (true);

-- Les writes se font uniquement via le Dashboard Supabase / SQL Editor (service_role)
-- Pas de policy INSERT/UPDATE/DELETE côté client → sécurité par défaut

-- ── DONNÉES INITIALES ─────────────────────────────────────────────────────────
INSERT INTO sessions_catalog (id, type, name, charge, sort_order) VALUES
  -- Exercices
  ( 1, 'Exercice', 'Récup active',                              0,  10),
  ( 2, 'Exercice', 'Renfo antagoniste bas du corps',            3,  20),
  ( 3, 'Exercice', 'Renfo antagoniste haut du corps',           3,  30),
  ( 4, 'Exercice', 'Abdos au sol',                              6,  40),
  ( 5, 'Exercice', 'Travail de dalle équilibre',                6,  50),
  ( 6, 'Exercice', 'Anneaux / TRX (force)',                     8,  60),
  ( 7, 'Exercice', 'Force-endurance doigts',                   12,  70),
  ( 8, 'Exercice', 'Gainage suspendu (force-endurance)',        12,  80),
  ( 9, 'Exercice', 'Gullich (force-endurance)',                 12,  90),
  (10, 'Exercice', 'Tirage prise (force-endurance)',            12, 100),
  (11, 'Exercice', 'Gainage suspendu (force)',                  20, 110),
  (12, 'Exercice', 'Gullich (force)',                           20, 120),
  (13, 'Exercice', 'Tirage prise lestée (force)',               20, 130),
  (14, 'Exercice', 'Force max biceps',                          25, 140),
  (15, 'Exercice', 'Force doigts',                              25, 150),
  -- Grimpe
  (16, 'Grimpe',   'Récup active / mobilité',                   0, 160),
  (17, 'Grimpe',   'Bloc libre plaisir 2h max',                16, 170),
  (18, 'Grimpe',   'Voies qualitatif (4-5 essais)',             16, 180),
  (19, 'Grimpe',   'Journée en bloc extérieurs',               18, 190),
  (20, 'Grimpe',   'Endurance au seuil (doublettes etc)',       20, 200),
  (21, 'Grimpe',   'Journée en falaise diff',                   20, 210),
  (22, 'Grimpe',   'Empilement de bloc / fartlek',              24, 220),
  (23, 'Grimpe',   'Travail de blocs très durs',                24, 230),
  (24, 'Grimpe',   'Grande voie (250-300m)',                    24, 240),
  (25, 'Grimpe',   'Panneau : endurance de force / rési longue',24, 250),
  (26, 'Grimpe',   'Muscu dans le geste / PPO (F-E)',           27, 260),
  (27, 'Grimpe',   'Panneau : force-endurance / rési courte',   27, 270),
  (28, 'Grimpe',   'Travail de coordination complexe',          30, 280),
  (29, 'Grimpe',   'Bloc sur panneau / Moon / Kilter',          36, 290),
  (30, 'Grimpe',   'Pletnev biceps',                            40, 300),
  (31, 'Grimpe',   'Simulation compète',                        40, 310),
  (32, 'Grimpe',   'Week-end de compétition',                   54, 320)
ON CONFLICT (id) DO NOTHING;

-- Pour les prochains INSERT, utilise un id >= 100 (1-32 réservés aux sessions de base)
-- Exemple : INSERT INTO sessions_catalog (id, type, name, charge, sort_order) VALUES (100, 'Grimpe', 'Nouvelle séance', 28, 325);
