import { DEFAULT_MESOCYCLES } from "./constants.js";
import { migrateWeekKeys } from "./helpers.js";

export function generateId() {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const DEFAULT_DATA = {
  weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES,
  sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, nutrition: {},
  profile: {}, customCycles: [], cyclesLocked: false, moveSuggestions: [],
  quickSessions: [], deadlines: [],
};

export function loadData() {
  try {
    const raw = localStorage.getItem("climbing_planner_v1");
    const parsed = raw ? JSON.parse(raw) : {};
    const result = { ...DEFAULT_DATA, ...parsed };
    if (!result.profile?.avatarDataUrl) {
      const legacy = localStorage.getItem("climbing_planner_photo");
      if (legacy) {
        result.profile = { ...(result.profile || {}), avatarDataUrl: legacy };
        localStorage.removeItem("climbing_planner_photo");
      }
    }
    if (result.profile) delete result.profile.role;
    return migrateWeekKeys(result);
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function saveData(data) {
  const { role: _role, ...profileWithoutRole } = data.profile ?? {};
  localStorage.setItem("climbing_planner_v1", JSON.stringify({ ...data, profile: profileWithoutRole }));
}
import { DEFAULT_MESOCYCLES } from "./constants.js";
import { migrateWeekKeys } from "./helpers.js";

export function generateId() {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const DEFAULT_DATA = {
  weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES,
  sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, nutrition: {},
  profile: {}, customCycles: [], cyclesLocked: false, moveSuggestions: [],
};

export function loadData() {
  try {
    const raw = localStorage.getItem("climbing_planner_v1");
    const parsed = raw ? JSON.parse(raw) : {};
    const result = { ...DEFAULT_DATA, ...parsed };
    if (!result.profile?.avatarDataUrl) {
      const legacy = localStorage.getItem("climbing_planner_photo");
      if (legacy) {
        result.profile = { ...(result.profile || {}), avatarDataUrl: legacy };
        localStorage.removeItem("climbing_planner_photo");
      }
    }
    if (result.profile) delete result.profile.role;
    return migrateWeekKeys(result);
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function saveData(data) {
  const { role: _role, ...profileWithoutRole } = data.profile ?? {};
  localStorage.setItem("climbing_planner_v1", JSON.stringify({ ...data, profile: profileWithoutRole }));
}
