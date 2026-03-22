import { addDays } from "./helpers.js";
import { localDateStr } from "./helpers.js";

export const MESOCYCLES = [
  { label: "Mise en condition", color: "#c8906a" },
  { label: "Base orientée", color: "#60a5fa" },
  { label: "Pré-comp", color: "#f97316" },
  { label: "Comp / Objectif", color: "#f43f5e" },
  { label: "Récupération", color: "#a78bfa" },
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

export const CUSTOM_CYCLE_COLORS = [
  "#c8906a", "#22d3ee", "#f59e0b", "#f87171",
  "#a78bfa", "#fb923c", "#34d399", "#60a5fa",
  "#e879f9", "#facc15", "#94a3b8", "#ff6b9d",
];

export const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const BLOCK_TYPES = {
  "Échauffement":    { color: "#f97316", defaultCharge: 5,  defaultDuration: 15, hasCharge: false },
  "Grimpe":          { color: "#c8906a", defaultCharge: 24, defaultDuration: 90, hasCharge: true  },
  "Exercices":       { color: "#60a5fa", defaultCharge: 12, defaultDuration: 20, hasCharge: true  },
  "Suspension":      { color: "#a78bfa", defaultCharge: 0,  defaultDuration: 15, hasCharge: true  },
  "Étirements":      { color: "#f0abfc", defaultCharge: 2,  defaultDuration: 10, hasCharge: false },
  "Retour au calme": { color: "#94a3b8", defaultCharge: 3,  defaultDuration: 10, hasCharge: true  },
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

export function isDateInDeadline(deadline, date) {
  if (!deadline.startDate) return false;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(deadline.startDate + "T00:00:00");
  const startNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (!deadline.endDate) {
    return d.getTime() === startNorm.getTime();
  }
  const end = new Date(deadline.endDate + "T00:00:00");
  const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return d >= startNorm && d <= endNorm;
}

export function getDeadlinesForDate(deadlines, date) {
  return (deadlines || []).filter(dl => isDateInDeadline(dl, date));
}

export function getDayLogWarning(data, dateISO, dateObj) {
  const today = localDateStr(new Date());
  if (dateISO > today) return { hasWarning: false, hooperMissing: false, creatineMissing: false, isFuture: true };
  const hooperMissing = !(data.hooper || []).some(h => h.date === dateISO);
  const creatineCycles = (data.customCycles || []).filter(c =>
    c.name?.toLowerCase().includes("créatine") || c.name?.toLowerCase().includes("creatine")
  );
  const isInCreatineCycle = creatineCycles.some(c => isDateInCustomCycle(c, dateObj));
  const creatineMissing = isInCreatineCycle && !data.creatine?.[dateISO];
  return { hasWarning: hooperMissing || creatineMissing, hooperMissing, creatineMissing };
}

export function getMesoColor(mesocycles, label) {
  const found = (mesocycles || []).find(m => m.label === label)?.color;
  return found || MESOCYCLES.find(m => m.label === label)?.color || "#888";
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
