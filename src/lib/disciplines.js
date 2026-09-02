import { DATA } from "../theme/palette.js";
// ─── DISCIPLINES ──────────────────────────────────────────────────────────────
// Catalogue des disciplines supportées par le composer unifié.
// Chaque discipline définit son calculateur de charge, ses métriques et sa
// couleur — celle qui teinte badges et pastilles dans toute l'app.

export const DISCIPLINES = {
  climbing: {
    id: "climbing",
    label: "Escalade",
    color: DATA.sports.climbing,
    iconId: "climbing",
    chargeCalculator: "climbing-volume",
    metrics: [],
    hasMinRecovery: true,
  },
  running: {
    id: "running",
    label: "Course",
    color: DATA.sports.running,
    iconId: "running",
    chargeCalculator: "rpe-duration",
    metrics: ["distanceKm", "runDuration", "pace", "elevationM"],
  },
  cycling: {
    id: "cycling",
    label: "Vélo",
    color: DATA.sports.cycling,
    iconId: "cycling",
    chargeCalculator: "rpe-duration",
    metrics: ["distanceKm", "elevationM"],
  },
  trail: {
    id: "trail",
    label: "Trail",
    color: DATA.sports.trail,
    iconId: "trail",
    chargeCalculator: "rpe-duration",
    metrics: ["distanceKm", "elevationM", "runDuration"],
  },
  strength: {
    id: "strength",
    label: "Renforcement",
    color: DATA.sports.strength,
    iconId: "strength",
    chargeCalculator: "rpe-duration",
    metrics: ["sets", "reps", "weightKg"],
  },
  mobility: {
    id: "mobility",
    label: "Mobilité",
    color: DATA.sports.mobility,
    iconId: "mobility",
    chargeCalculator: "rpe-duration",
    metrics: [],
  },
  custom: {
    id: "custom",
    label: "Autre",
    color: DATA.sports.custom,
    iconId: "custom",
    chargeCalculator: "rpe-duration",
    metrics: [],
  },
};

export function getDiscipline(id) {
  return DISCIPLINES[id] || DISCIPLINES.custom;
}

export function disciplineList() {
  return Object.values(DISCIPLINES);
}
// Libellés affichés pour les métriques optionnelles
export const METRIC_LABELS = {
  distanceKm:  { label: "Distance",     suffix: "km",  placeholder: "8.5",  step: 0.1 },
  elevationM:  { label: "D+",           suffix: "m",   placeholder: "350",  step: 5 },
  pace:        { label: "Allure",       suffix: "/km", placeholder: "5:30", step: 0, isText: true },
  runDuration: { label: "Durée course", suffix: "",    placeholder: "42:00", step: 0, isText: true },
  sets:        { label: "Séries",       suffix: "",    placeholder: "4",    step: 1 },
  reps:        { label: "Reps",         suffix: "",    placeholder: "8",    step: 1 },
  weightKg:    { label: "Charge",       suffix: "kg",  placeholder: "60",   step: 0.5 },
};

// ─── FILTRE PAR DISCIPLINE ───────────────────────────────────────────────────
// Isoler un sport dans les stats se fait en un seul endroit : on ne garde que
// les séances retenues dans `weeks`, et tout ce qui en dérive suit — charge,
// écart, qualité, heatmap. Poids, Hooper et sommeil ne dépendent d'aucun sport
// et restent intacts, puisqu'ils voyagent dans le même objet.
//
// Sans filtre on renvoie l'objet d'origine, pas une copie : un `useMemo` qui
// changerait d'identité à chaque rendu ferait retracer tous les graphes.
export function filterDataBySports(data, sports) {
  if (!data || !sports || sports.length === 0 || sports.length === disciplineList().length) return data;
  const keep = new Set(sports);
  const weeks = {};
  for (const [k, days] of Object.entries(data.weeks || {})) {
    weeks[k] = (days || []).map(d => (d || []).filter(s => keep.has(s?.discipline || "climbing")));
  }
  return { ...data, weeks };
}

/** Ce qu'affiche la puce du filtre : « Tous les sports », un nom, ou un compte. */
export function sportFilterLabel(selected) {
  if (!selected || selected.length === 0) return "Tous les sports";
  if (selected.length === 1) return getDiscipline(selected[0]).label;
  return `${selected.length} sports`;
}
