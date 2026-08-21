import { DATA } from "../theme/palette.js";
import { addDays } from "./helpers.js";
import { localDateStr } from "./helpers.js";

// Les couleurs sont recopiées dans data.mesocycles (éditables par l'utilisateur)
// : elles doivent être fixes, pas déclinées par thème.
export const MESOCYCLES = [
  { label: "Mise en condition", color: DATA.picker[10] },
  { label: "Base orientée",     color: DATA.picker[5] },
  { label: "Pré-comp",          color: DATA.picker[0] },
  { label: "Comp / Objectif",   color: DATA.picker[9] },
  { label: "Récupération",      color: DATA.picker[6] },
];

export const DEFAULT_MESOCYCLES = MESOCYCLES.map((m, i) => ({
  id: `m_default_${i}`,
  label: m.label,
  color: m.color,
  durationWeeks: 4,
  startDate: "",
  description: "",
  microcycles: [],
}));

// Palette proposée au choix de l'utilisateur, enregistrée avec le cycle.
export const CUSTOM_CYCLE_COLORS = DATA.picker;

export const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// defaultCharge sur l'échelle unifiée 0-10 : une séance = somme de ses blocs,
// plafonnée à 10 (bloc principal ≈ 5, annexes 1-3).
export const BLOCK_TYPES = {
  "Échauffement":    { color: DATA.blocks["Échauffement"], defaultCharge: 1, defaultDuration: 15, hasCharge: false },
  "Grimpe":          { color: DATA.blocks["Grimpe"], defaultCharge: 5, defaultDuration: 90, hasCharge: true  },
  "Exercices":       { color: DATA.blocks["Exercices"], defaultCharge: 3, defaultDuration: 20, hasCharge: true  },
  "Suspension":      { color: DATA.blocks["Suspension"], defaultCharge: 0, defaultDuration: 15, hasCharge: true  },
  "Étirements":      { color: DATA.blocks["Étirements"], defaultCharge: 1, defaultDuration: 10, hasCharge: false },
  "Retour au calme": { color: DATA.blocks["Retour au calme"], defaultCharge: 1, defaultDuration: 10, hasCharge: true  },
};

export const GRIP_TYPES = ["Semi-arquée", "Arquée", "Tendu", "Pincée", "Monoigt", "2 doigts", "3 doigts"];

export const DEFAULT_SUSPENSION_CONFIG = {
  armMode: "two",
  supportType: "wall",
  gripSize: 20,
  gripType: "Semi-arquée",
  hangTime: 7,
  restTime: 53,
  sets: 6,
  reps: 1,
  targetWeight: 0,
  targetWeightLeft: 0,
  targetWeightRight: 0,
};

export function isDateInCustomCycle(cycle, date) {
  if (!cycle.startDate) return false;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(cycle.startDate + "T00:00:00");
  const startNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (!cycle.isRepetitive) {
    if (!cycle.endDate) return false;
    const end = new Date(cycle.endDate + "T00:00:00");
    const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= startNorm && d <= endNorm;
  }
  if (d < startNorm) return false;
  const msPerDay = 24 * 3600 * 1000;
  const elapsed = Math.round((d - startNorm) / msPerDay);
  const onDays = (cycle.onWeeks || 4) * 7;
  const offDays = (cycle.offWeeks || 2) * 7;
  return (elapsed % (onDays + offDays)) < onDays;
}

export function getCustomCyclesForDate(customCycles, date) {
  return (customCycles || []).filter(cc => isDateInCustomCycle(cc, date));
}

export function getDayLogWarning(data, dateISO, dateObj) {
  const today = localDateStr(new Date());
  if (dateISO > today) return { hasWarning: false, hooperMissing: false, creatineMissing: false, isFuture: true };
  // Une entrée Hooper partielle (total null) compte comme manquante.
  const hooperMissing = !(data.hooper || []).some(h => h.date === dateISO && h.total != null);
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));
  const creatineMissing = isInCreatineCycle && !data.creatine?.[dateISO];
  return { hasWarning: hooperMissing || creatineMissing, hooperMissing, creatineMissing };
}

export function getMesoColor(mesocycles, label) {
  const found = (mesocycles || []).find(m => m.label === label)?.color;
  return found || MESOCYCLES.find(m => m.label === label)?.color || DATA.fallback;
}

export function getMesoForDate(mesocycles, date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (const meso of (mesocycles || [])) {
    if (!meso.startDate) continue;
    const start = new Date(meso.startDate);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, meso.durationWeeks * 7);
    if (d >= start && d < end) {
      let microStart = new Date(start);
      for (const micro of (meso.microcycles || [])) {
        const microEnd = addDays(microStart, micro.durationWeeks * 7);
        if (d >= microStart && d < microEnd) {
          return { meso, micro };
        }
        microStart = new Date(microEnd);
      }
      return { meso, micro: null };
    }
  }
  return null;
}
