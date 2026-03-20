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

export function getChargeColor(charge, isDark = true) {
  if (isDark) {
    if (charge === 0) return "#4ade80";
    if (charge <= 12) return "#86efac";
    if (charge <= 20) return "#fbbf24";
    if (charge <= 30) return "#f97316";
    return "#f43f5e";
  }
  if (charge === 0) return "#16a34a";
  if (charge <= 12) return "#15803d";
  if (charge <= 20) return "#b45309";
  if (charge <= 30) return "#c2410c";
  return "#b91c1c";
}
