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
