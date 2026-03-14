-- ═══════════════════════════════════════════════════════════════════════════
-- PLANIF ESCALADE — Migration : config JSONB pour les blocs Suspension
-- À exécuter dans Supabase SQL Editor
-- Sûr à re-exécuter (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Ajoute la colonne config JSONB sur session_blocks pour stocker les
-- paramètres spécifiques à chaque type de bloc (ex: config de suspension).
ALTER TABLE public.session_blocks
  ADD COLUMN IF NOT EXISTS config JSONB;

COMMENT ON COLUMN public.session_blocks.config IS
  'Paramètres spécifiques au type de bloc. Pour Suspension : { armMode, supportType, gripSize, gripType, hangTime, restTime, sets, reps, targetWeight, targetWeightLeft, targetWeightRight }';
