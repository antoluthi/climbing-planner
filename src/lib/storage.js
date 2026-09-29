import { DATA } from "../theme/palette.js";
import { DEFAULT_MESOCYCLES } from "./constants.js";
import { migrateWeekKeys } from "./helpers.js";
import { dropSyncBase } from "./sync-meta.js";

export function generateId() {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Clé localStorage identifiant le DERNIER compte qui a possédé les données
// locales. Garde anti-fuite : sur un navigateur partagé, un nouveau compte ne
// doit jamais hériter (ni pousser vers son cloud) les données du précédent.
const OWNER_KEY = "climbing_planner_owner_v1";
export function getLocalDataOwner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
export function setLocalDataOwner(userId) {
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* ignore */ }
}
export function freshData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

const DEFAULT_DATA = {
  weeks: {}, weekMeta: {}, customSessions: [], mesocycles: DEFAULT_MESOCYCLES,
  sleep: [], hooper: [], notes: {}, creatine: {}, weight: {}, nutrition: {},
  profile: {}, customCycles: [], cyclesLocked: false, moveSuggestions: [],
  quickSessions: [], reminders: [], reminderState: {}, runBlocks: [],
  // Deux plans, deux verrous : figer sa grimpe ne fige pas sa course.
  runLocked: true,
  schemaVersion: 3,
};

// ─── Migration schemaVersion 2 → 3 → 4 → 5 → 6 → 7 ──────────────────────────
// v2 : discipline / mode / chargePlanned sur sessions et quickSessions.
// v3 : data.reminders / data.reminderState (+ rapatrie l'ancien data.creatine).
// v4 : entrées Hooper partielles → total null (sinon stats faussées).
// v5 : échelle de charge unifiée 0-10 — les charges escalade legacy
//      (vol×int×compl, 0-216) des séances ET de leurs blocs sont ramenées
//      sur 0-10 ; les feedbacks "adaptedCharge" legacy deviennent un rpe.
// v7 : un rappel porte des blocs datés (`periods`) — **annulée par v8**.
// v8 : retour à une plage unique à la racine (`startDate` / `endDate` /
//      `recurrence`), et `archivedAt` devient `deletedAt`. Un rappel se
//      modifie et se supprime d'une pièce ; ses coches, elles, restent.
//      Voir `lib/reminders.js`.
const SCHEMA_VERSION = 8;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function normalizeCharge(legacyCharge) {
  // Ancienne échelle escalade (vol × int × compl) → 0-10. Diviseur calibré
  // sur l'usage réel (voir lib/charge.js, LEGACY_CHARGE_DIVISOR).
  const c = Number(legacyCharge) || 0;
  if (c <= 10) return clamp(Math.round(c), 0, 10);
  return clamp(Math.round(c / 4.8), 1, 10);
}

function inferSessionMode(s) {
  if (s.endDate || s.isObjective || s.isQuick) return "event";
  return "simple";
}

// v6 : les blocs disparaissent. Leur contenu n'est pas jeté pour autant — il
// est replié dans les notes de la séance, seul endroit qui le montre encore.
function foldBlocksIntoNotes(out) {
  if (!Array.isArray(out.blocks) || out.blocks.length === 0) {
    delete out.blocks;
    return out;
  }
  const lines = out.blocks.map(b => {
    const head = [b.blockType || b.type, b.name].filter(Boolean).join(" — ");
    const meta = [b.duration ? `${b.duration} min` : null].filter(Boolean).join(" · ");
    const desc = b.description?.toString().trim();
    return [head, meta && `(${meta})`, desc && `\n${desc}`].filter(Boolean).join(" ");
  });
  const folded = lines.join("\n");
  out.notes = [out.notes, folded].filter(t => t && t.toString().trim()).join("\n\n");
  delete out.blocks;
  return out;
}

function migrateSession(s) {
  if (!s || typeof s !== "object") return s;
  if (s.schemaVersion === SCHEMA_VERSION) return s;
  const mode = inferSessionMode(s);
  const out = { ...s, schemaVersion: SCHEMA_VERSION };
  if (!out.discipline) out.discipline = "climbing";
  if (!out.mode) out.mode = mode;
  if (out.chargePlanned == null) out.chargePlanned = normalizeCharge(s.charge);
  // v5 : tout sur l'échelle 0-10 — charge de séance, charges des blocs,
  // et feedback legacy (adaptedCharge → rpe 0-10). Quand la charge est encore
  // legacy, chargePlanned (calculé en v2 avec un mauvais diviseur) est
  // recalculé au passage.
  if (Number(out.charge) > 10) {
    out.charge = normalizeCharge(out.charge);
    out.chargePlanned = out.charge;
  }
  if (out.feedback && out.feedback.rpe == null && out.feedback.adaptedCharge != null) {
    out.feedback = { ...out.feedback, rpe: normalizeCharge(out.feedback.adaptedCharge) };
  }
  // Historique : concatène warmup/main/cooldown dans les notes.
  if (!out.notes && (s.warmup || s.main || s.cooldown)) {
    out.notes = [s.warmup, s.main, s.cooldown].filter(Boolean).join("\n\n").trim();
  }
  return foldBlocksIntoNotes(out);
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
      color: DATA.picker[0],
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

// ── Migration v8 : les blocs d'un rappel redeviennent une plage unique ──
// La v7 avait découpé un rappel en blocs datés pour qu'une modification de ses
// dates ne réécrive pas l'historique. Le remède coûtait plus que le mal : on
// ne pouvait plus corriger un rappel en cours, il fallait en ouvrir un
// nouveau. On revient donc à la plage unique, et on assume qu'élargir les
// dates change ce que la heatmap dit du passé — les **coches**, elles, ne
// bougent jamais (`reminderState` est daté, voir `lib/reminders.js`).
//
// Les champs de la racine ont survécu à la v7 (elle les laissait en place),
// mais un bloc ouvert après coup les a rendus périmés : la plage se
// reconstitue donc **depuis les blocs** dès qu'il y en a — du début du
// premier à la fin du dernier, la récurrence du dernier étant la plus
// récemment voulue.
function flattenReminderPeriods(reminder) {
  if (!reminder || typeof reminder !== "object") return reminder;
  const { periods, archivedAt, ...rest } = reminder;
  const out = { ...rest };

  // `archivedAt` (v7) et `deletedAt` disent la même chose : à partir de ce
  // jour, le rappel ne réclame plus rien, et tout ce qui précède demeure.
  if (archivedAt && !out.deletedAt) out.deletedAt = archivedAt;

  if (!Array.isArray(periods)) return out;

  if (periods.length === 0) {
    // Un rappel sans aucun bloc ne réclamait plus rien. Le rendre à nouveau
    // quotidien le ferait sonner pour des mois où il n'existait pas : on le
    // marque supprimé à sa naissance, ce qui préserve ses coches sans rien
    // exiger.
    if (!out.deletedAt) out.deletedAt = toDateOnly(out.createdAt) || "1970-01-01";
    return out;
  }

  // Un bloc sans date de début commence « depuis toujours » : il trie en tête.
  const startOf = p => p?.startDate || "";
  const dated = [...periods].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const first = dated[0];
  const last  = dated[dated.length - 1];
  out.startDate  = first?.startDate || undefined;
  // Un dernier bloc encore ouvert veut dire « sans fin ».
  out.endDate    = last?.endDate || undefined;
  out.recurrence = last?.recurrence || out.recurrence || { kind: "daily" };
  return out;
}

function toDateOnly(iso) {
  if (typeof iso !== "string" || iso.length < 10) return null;
  return iso.slice(0, 10);
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

  // v8 : les blocs d'un rappel redeviennent une plage unique.
  const reminders = (withReminders.reminders || []).map(flattenReminderPeriods);

  // v4 : entrées Hooper partielles → total null (exclues des agrégats).
  const hooper = (withReminders.hooper || []).map(h => {
    const complete = [h.fatigue, h.stress, h.soreness, h.sleep].every(v => v != null);
    if (complete) return h;
    return { ...h, total: null };
  });

  return {
    ...withReminders,
    reminders,
    hooper,
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
  const json = JSON.stringify({ ...data, profile: profileWithoutRole });
  try {
    localStorage.setItem("climbing_planner_v1", json);
  } catch {
    // Plus de place : la base de synchronisation (une copie du planning) la
    // cède au planning lui-même. Sans elle, la fusion retombe sur deux voies ;
    // sans ceci, les modifications ne survivraient pas à un rechargement.
    dropSyncBase();
    try { localStorage.setItem("climbing_planner_v1", json); } catch { /* vraiment plein */ }
  }
}

