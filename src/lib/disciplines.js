// ─── DISCIPLINES ──────────────────────────────────────────────────────────────
// Catalogue des disciplines supportées par le composer unifié.
// Chaque discipline définit ses types de blocs, son calculateur de charge,
// ses métriques optionnelles et son mode par défaut.

export const DISCIPLINES = {
  climbing: {
    id: "climbing",
    label: "Escalade",
    color: "#8b4c20",
    iconId: "climbing",
    blockTypes: ["Échauffement", "Grimpe", "Suspension", "Exercices", "Étirements", "Retour au calme"],
    chargeCalculator: "climbing-volume",
    metrics: [],
    defaultMode: "detailed",
    hasMinRecovery: true,
  },
  running: {
    id: "running",
    label: "Course",
    color: "#2563eb",
    iconId: "running",
    blockTypes: ["Échauffement", "Footing", "Fractionné", "Côtes", "Sortie longue", "Récup"],
    chargeCalculator: "rpe-duration",
    metrics: ["distanceKm", "elevationM", "pace"],
    defaultMode: "simple",
  },
  cycling: {
    id: "cycling",
    label: "Vélo",
    color: "#15803d",
    iconId: "cycling",
    blockTypes: ["Échauffement", "Z2", "Tempo", "Seuil", "VO2", "Récup"],
    chargeCalculator: "rpe-duration",
    metrics: ["distanceKm", "elevationM"],
    defaultMode: "simple",
  },
  strength: {
    id: "strength",
    label: "Renforcement",
    color: "#6d28d9",
    iconId: "strength",
    blockTypes: ["Échauffement", "Force max", "Hypertrophie", "Power", "Mobilité", "Retour calme"],
    chargeCalculator: "rpe-duration",
    metrics: ["sets", "reps", "weightKg"],
    defaultMode: "detailed",
  },
  mobility: {
    id: "mobility",
    label: "Mobilité",
    color: "#0891b2",
    iconId: "mobility",
    blockTypes: ["Mobilité", "Yoga", "Étirements", "Respiration", "Récup active"],
    chargeCalculator: "rpe-duration",
    metrics: [],
    defaultMode: "simple",
  },
  custom: {
    id: "custom",
    label: "Autre",
    color: "#8a7f70",
    iconId: "custom",
    blockTypes: ["Effort", "Repos", "Libre"],
    chargeCalculator: "rpe-duration",
    metrics: [],
    defaultMode: "simple",
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
  distanceKm:  { label: "Distance", suffix: "km", placeholder: "8.5", step: 0.1 },
  elevationM:  { label: "D+",       suffix: "m",  placeholder: "350", step: 5  },
  pace:        { label: "Allure",   suffix: "/km", placeholder: "5:30", step: 0, isText: true },
  sets:        { label: "Séries",   suffix: "",   placeholder: "4",   step: 1 },
  reps:        { label: "Reps",     suffix: "",   placeholder: "8",   step: 1 },
  weightKg:    { label: "Charge",   suffix: "kg", placeholder: "60",  step: 0.5 },
};
