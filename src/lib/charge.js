import { DATA } from "../theme/palette.js";
export const VOLUME_ZONES = [
  { index: 1, label: "Spécifique",           range: "< 10 mouvements" },
  { index: 2, label: "Bloc intensif",         range: "10 – 25 mouvements" },
  { index: 3, label: "Endurance de puissance",range: "25 – 40 mouvements" },
  { index: 4, label: "Mixte",                 range: "40 – 60 mouvements" },
  { index: 5, label: "Contest / Volume",      range: "60 – 100 mouvements" },
  { index: 6, label: "Gros volume",           range: "> 100 mouvements" },
];

export const INTENSITY_ZONES = [
  { index: 1, label: "Récupération active",    pct: "< 45 %",     effort: "Continu léger",    recovery: "< 30 s" },
  { index: 2, label: "Endurance de force",     pct: "45 – 60 %",  effort: "Continu modéré",   recovery: "1 – 2 min" },
  { index: 3, label: "Seuil de puissance",     pct: "60 – 75 %",  effort: "Intervalles",      recovery: "2 – 3 min" },
  { index: 4, label: "Sub-maximale",           pct: "75 – 90 %",  effort: "Intensité haute",  recovery: "3 – 5 min" },
  { index: 5, label: "Maximale",               pct: "90 – 100 %", effort: "Effort maximal",   recovery: "5 – 10 min" },
  { index: 6, label: "Supra-maximale",         pct: "> 100 %",    effort: "Effort explosif",  recovery: "> 10 min" },
];

export const COMPLEXITY_ZONES = [
  { index: 1, label: "Familiarisation",        desc: "Geste simple déjà maîtrisé" },
  { index: 2, label: "Exercices simples",      desc: "Coordination simple" },
  { index: 3, label: "Exercices techniques",   desc: "Technique ciblée" },
  { index: 4, label: "Coordination normale",   desc: "Séquences variées" },
  { index: 5, label: "Coordination complexe",  desc: "Voies / Blocs techniques" },
  { index: 6, label: "Compétition",            desc: "Conditions de compétition" },
];

export function getNbMouvementsZone(nb) {
  if (!nb || nb <= 0) return 1;
  if (nb < 10)  return 1;
  if (nb < 25)  return 2;
  if (nb < 40)  return 3;
  if (nb < 60)  return 4;
  if (nb < 100) return 5;
  return 6;
}

// ─── Échelle de charge unifiée 0-10 ──────────────────────────────────────────
// Toutes les disciplines partagent la même unité : la charge de séance 0-10
// (équivalente au RPE de Borg CR-10). L'escalade garde son calculateur
// spécifique (mouvements × intensité × complexité, produit 1-216) mais celui-ci
// ne sert plus que d'assistant : son résultat est ramené sur 0-10.
// L'ancienne échelle (0-216) peut encore exister dans des données non migrées
// (catalogue coach, ligne cloud d'un athlète) → normalisation défensive.

// Calibré sur l'usage réel de l'ancienne échelle, pas sur son max théorique
// (216) : les séances pesaient 8-80 (bloc Grimpe type = 24, slider feedback
// plafonné à 30, rouge au-delà de 30). 4.8 mappe : 12→3 (léger), 24→5,
// 36→8 (séance complète soutenue), ≥48→10.
const LEGACY_CHARGE_DIVISOR = 4.8;

export function normalizeCharge10(c) {
  const n = Number(c) || 0;
  if (n <= 0) return 0;
  if (n <= 10) return Math.round(n);
  return Math.min(10, Math.max(1, Math.round(n / LEGACY_CHARGE_DIVISOR)));
}

// Charge effective d'une séance planifiée/réalisée :
// ressenti de l'athlète (feedback.rpe) > charge planifiée > legacy normalisé.
export function getSessionCharge(s) {
  if (!s) return 0;
  const fb = s.feedback;
  if (fb) {
    // Séance manquée = aucune charge encaissée.
    const missed = fb.status === "not_done" || (fb.status == null && fb.done === false);
    if (missed) return 0;
    if (fb.rpe != null) return normalizeCharge10(fb.rpe);
  }
  if (s.chargePlanned != null) return normalizeCharge10(s.chargePlanned);
  return normalizeCharge10(s.charge);
}

// Calculateur escalade : zones 1-6 → charge de séance 0-10.
export function climbingCharge10(volZone, intensityZone, complexityZone) {
  const product = (volZone || 1) * (intensityZone || 1) * (complexityZone || 1);
  return Math.min(10, Math.max(1, Math.round(product / LEGACY_CHARGE_DIVISOR)));
}

// Couleur d'un badge de zone 1-6 (tables de référence escalade).
export function getZoneColor(index, isDark = true) {
  return getChargeColor(Math.round((index || 1) * 10 / 6), isDark);
}

// Libellés Borg CR-10 — partagés entre le feedback athlète et les aides.
export const RPE_LABELS = {
  1: "Très facile — récupération.",
  2: "Facile — échauffement.",
  3: "Modéré — confortable.",
  4: "Un peu difficile.",
  5: "Difficile.",
  6: "Difficile, soutenu.",
  7: "Difficile mais soutenable.",
  8: "Très difficile.",
  9: "Maximal — limite.",
  10: "Maximum absolu.",
};

// Couleurs calibrées pour l'échelle 0-10 (séance) et les totaux journaliers
// (somme de séances, typiquement 0-20) : 0 repos · ≤3 léger · ≤6 modéré ·
// ≤9 soutenu · >9 très lourd.
export function getChargeColor(charge, isDark = true) {
  const scale = isDark ? DATA.charge.dark : DATA.charge.light;
  if (charge === 0) return scale[0];
  if (charge <= 3) return scale[1];
  if (charge <= 6) return scale[2];
  if (charge <= 9) return scale[3];
  return scale[4];
}
