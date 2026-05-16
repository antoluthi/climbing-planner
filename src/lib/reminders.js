// ─── REMINDERS ───────────────────────────────────────────────────────────────
// Système de rappels journaliers configurables.
// Structure dans data :
//   reminders = [{
//     id, name, color,
//     recurrence: { kind: 'daily' | 'weekdays', days?: number[] },
//     startDate?, endDate?,
//     createdAt,
//   }]
//   reminderState = { [reminderId]: { [dateStr]: true } }

// Palette autorisée pour les rappels.
export const REMINDER_COLORS = [
  "#e0a875", // cuivre
  "#82c894", // menthe
  "#7da7f0", // bleu
  "#b89cf0", // violet
  "#f0a060", // orange
  "#f08070", // corail
  "#e6c46a", // ambre
  "#6a5d4c", // neutre
];

const DAY_LABELS_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const DAY_LABELS_TWO   = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function newReminderId() {
  return "rem_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Renvoie true si le rappel est actif à la `date` (Date object).
export function isReminderActiveOn(reminder, date) {
  if (!reminder || !date) return false;
  const iso = toISODate(date);

  if (reminder.startDate && iso < reminder.startDate) return false;
  if (reminder.endDate   && iso > reminder.endDate)   return false;

  const rec = reminder.recurrence;
  if (!rec || rec.kind === "daily") return true;
  if (rec.kind === "weekdays") {
    const dow = date.getDay();              // 0=dim, 6=sam
    return Array.isArray(rec.days) && rec.days.includes(dow);
  }
  return false;
}

// Renvoie tous les rappels actifs pour une date, triés par createdAt asc.
export function getActiveRemindersForDate(reminders, date) {
  if (!Array.isArray(reminders) || !date) return [];
  return reminders
    .filter(r => isReminderActiveOn(r, date))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export function isReminderCheckedOn(reminderState, reminderId, dateStr) {
  if (!reminderState || !reminderId || !dateStr) return false;
  return !!reminderState[reminderId]?.[dateStr];
}

// Toggle immutable du state.
export function toggleReminderCheck(reminderState, reminderId, dateStr) {
  const prev = reminderState || {};
  const forReminder = prev[reminderId] ? { ...prev[reminderId] } : {};
  if (forReminder[dateStr]) {
    delete forReminder[dateStr];
  } else {
    forReminder[dateStr] = true;
  }
  return { ...prev, [reminderId]: forReminder };
}

// Force un état précis (true ou false). Utilisé pour les opérations groupées.
export function setReminderCheck(reminderState, reminderId, dateStr, value) {
  const prev = reminderState || {};
  const forReminder = prev[reminderId] ? { ...prev[reminderId] } : {};
  if (value) forReminder[dateStr] = true;
  else delete forReminder[dateStr];
  return { ...prev, [reminderId]: forReminder };
}

// Supprime un rappel + son historique.
export function removeReminder(reminders, reminderState, reminderId) {
  const remNext = (reminders || []).filter(r => r.id !== reminderId);
  const stateNext = { ...(reminderState || {}) };
  delete stateNext[reminderId];
  return { reminders: remNext, reminderState: stateNext };
}

// Taux de complétion sur les N derniers jours (par défaut 30).
// Renvoie un nombre 0..1.
export function getReminderCompletionRate(reminder, reminderState, asOfDate = new Date(), windowDays = 30) {
  if (!reminder) return 0;
  let total = 0;
  let done = 0;
  const d = new Date(asOfDate);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < windowDays; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    if (!isReminderActiveOn(reminder, day)) continue;
    total++;
    if (isReminderCheckedOn(reminderState, reminder.id, toISODate(day))) done++;
  }
  return total === 0 ? 0 : done / total;
}

// Compte des rappels manqués pour une date (= actifs mais non cochés).
export function countMissedRemindersOn(reminders, reminderState, date) {
  const active = getActiveRemindersForDate(reminders, date);
  if (active.length === 0) return 0;
  const iso = toISODate(date);
  let missed = 0;
  for (const r of active) {
    if (!isReminderCheckedOn(reminderState, r.id, iso)) missed++;
  }
  return missed;
}

// Format humain de la récurrence.
export function formatRecurrence(recurrence) {
  if (!recurrence || recurrence.kind === "daily") return "Tous les jours";
  if (recurrence.kind === "weekdays") {
    const days = (recurrence.days || []).slice().sort((a, b) => a - b);
    if (days.length === 0) return "Aucun jour";
    if (days.length === 7) return "Tous les jours";
    // Détection des presets classiques
    const set = new Set(days);
    if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return "Semaine (Lun-Ven)";
    if (set.size === 2 && set.has(0) && set.has(6))            return "Week-end";
    // Sinon : liste compacte "L · M · V"
    return days.map(d => DAY_LABELS_SHORT[d]).join(" · ");
  }
  return "—";
}

// Helpers internes
export function toISODate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DAY_NAMES_SHORT = DAY_LABELS_SHORT;
export const DAY_NAMES_TWO   = DAY_LABELS_TWO;

// Presets de jours pour la modale d'édition
export const WEEKDAY_PRESETS = [
  { label: "Semaine (Lun-Ven)", days: [1, 2, 3, 4, 5] },
  { label: "Week-end",          days: [0, 6] },
  { label: "Toute la semaine",  days: [0, 1, 2, 3, 4, 5, 6] },
];
