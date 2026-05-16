import { DEFAULT_MESOCYCLES } from "./constants.js";
import { migrateWeekKeys } from "./helpers.js";

export function generateId() {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const DEFAULT_DATA = {
  weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES,
  sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, nutrition: {},
  profile: {}, customCycles: [], cyclesLocked: false, moveSuggestions: [],
  quickSessions: [], reminders: [], reminderState: {}, schemaVersion: 3,
};

// ─── Migration schemaVersion 2 → 3 ────────────────────────────────────────────
// Ajoute discipline / mode / chargePlanned aux sessions et quickSessions
// existantes (v2), puis data.reminders / data.reminderState avec migration
// auto de data.creatine vers un rappel "Créatine" daily (v3).
const SCHEMA_VERSION = 3;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function normalizeCharge(legacyCharge) {
  // L'ancienne échelle escalade allait de 0 à ~216 (vol × int × compl).
  // Si la valeur tient déjà dans 0-10, on garde telle quelle.
  const c = Number(legacyCharge) || 0;
  if (c <= 10) return clamp(Math.round(c), 0, 10);
  return clamp(Math.round(c / 21.6), 0, 10);
}

function inferSessionMode(s) {
  if (s.mode) return s.mode;
  if (s.endDate || s.isObjective || s.isQuick) return "event";
  if (Array.isArray(s.blocks) && s.blocks.length > 0) return "detailed";
  if ((s.warmup || s.main || s.cooldown)?.toString().trim()) return "simple";
  return "detailed";
}

function migrateSession(s) {
  if (!s || typeof s !== "object") return s;
  if (s.schemaVersion === SCHEMA_VERSION) return s;
  const mode = inferSessionMode(s);
  const out = { ...s, schemaVersion: SCHEMA_VERSION };
  if (!out.discipline) out.discipline = "climbing";
  if (!out.mode) out.mode = mode;
  if (out.chargePlanned == null) out.chargePlanned = normalizeCharge(s.charge);
  // En mode 'simple' historique : concatène warmup/main/cooldown dans notes.
  if (mode === "simple" && !out.notes && (s.warmup || s.main || s.cooldown)) {
    out.notes = [s.warmup, s.main, s.cooldown].filter(Boolean).join("\n\n").trim();
  }
  return out;
}

// ── Migration v3 : reminders/reminderState + créatine héritée ──
function migrateReminders(data) {
  if (data.reminders && data.reminderState) return data;
  const reminders     = Array.isArray(data.reminders) ? [...data.reminders] : [];
  const reminderState = (typeof data.reminderState === "object" && data.reminderState) ? { ...data.reminderState } : {};

  const oldCreatine = data.creatine || {};
  const hasAnyCreatine = Object.keys(oldCreatine).length > 0;

  // Crée un rappel "Créatine" par défaut si aucun rappel n'existe encore.
  // Si l'utilisateur a déjà coché de la créatine, on importe l'historique.
  if (reminders.length === 0) {
    const creatineId = "rem_creatine_" + Date.now().toString(36);
    reminders.push({
      id: creatineId,
      name: "Créatine",
      color: "#e0a875",
      recurrence: { kind: "daily" },
      createdAt: new Date().toISOString(),
    });
    if (hasAnyCreatine) {
      reminderState[creatineId] = { ...oldCreatine };
    }
  }
  // data.creatine est laissé en place pour rollback safety (read-only désormais).
  return { ...data, reminders, reminderState };
}

export function migrateData(data) {
  if (!data || data.schemaVersion === SCHEMA_VERSION) return data;
  const weeks = { ...(data.weeks || {}) };
  for (const wKey of Object.keys(weeks)) {
    const days = weeks[wKey];
    if (!Array.isArray(days)) continue;
    weeks[wKey] = days.map(daySessions =>
      Array.isArray(daySessions) ? daySessions.map(migrateSession) : daySessions
    );
  }
  const quickSessions = (data.quickSessions || []).map(qs => ({
    ...migrateSession({ ...qs, mode: "event" }),
  }));
  const customSessions = (data.customSessions || []).map(migrateSession);

  // v3 : ajoute reminders / reminderState (+ rapatrie l'ancien data.creatine).
  const withReminders = migrateReminders({
    ...data,
    weeks,
    quickSessions,
    customSessions,
  });

  return {
    ...withReminders,
    schemaVersion: SCHEMA_VERSION,
  };
}

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
    return migrateData(migrateWeekKeys(result));
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function saveData(data) {
  const { role: _role, ...profileWithoutRole } = data.profile ?? {};
  localStorage.setItem("climbing_planner_v1", JSON.stringify({ ...data, profile: profileWithoutRole }));
}

