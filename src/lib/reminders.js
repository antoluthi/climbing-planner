import { DATA } from "../theme/palette.js";
// ─── REMINDERS ───────────────────────────────────────────────────────────────
// Un rappel journalier, dans sa forme simple :
//
//   reminders = [{
//     id, name, color, createdAt,
//     recurrence: { kind: 'daily' | 'weekdays', days?: number[] },
//     startDate?, endDate?,
//     deletedAt?,          // ISO du jour de la suppression
//   }]
//   reminderState = { [reminderId]: { [dateStr]: true } }
//
// **Supprimer ne jette rien.** Un rappel supprimé quitte les listes et cesse de
// réclamer quoi que ce soit, mais ses coches restent, et les jours qu'il
// couvrait se **cochent et se décochent encore** depuis le journal de ces
// jours-là. D'où `deletedAt` plutôt qu'un retrait du tableau.
//
// ⚠️ `deletedAt` est une **date**, pas un booléen — et c'est toute la
// différence avec le drapeau `enabled` qu'il a remplacé. Un booléen consulté
// par `isReminderActiveOn` répond « non » pour *toutes* les dates, passé
// compris : couper un rappel effaçait alors son historique de la heatmap. Une
// date ne coupe qu'à partir d'elle.
//
// ⚠️ **Compromis assumé** : modifier les dates ou la récurrence d'un rappel
// existant **réécrit** ce que la heatmap dit de ses jours passés (« était-ce
// dû ce jour-là ? » se déduit de la définition courante). C'est le prix de la
// simplicité ; l'alternative — des blocs datés immuables — a été essayée et
// jugée trop lourde à l'usage.

// Palette autorisée pour les rappels.
export const REMINDER_COLORS = DATA.picker;

const DAY_LABELS_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const DAY_LABELS_TWO   = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function newReminderId() {
  return "rem_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function isDeleted(reminder) {
  return !!reminder?.deletedAt;
}

// Ce que montrent les listes de l'éditeur. L'historique, lui, passe par
// `getActiveRemindersForDate`, qui connaît encore les supprimés.
export function liveReminders(reminders) {
  return (reminders || []).filter(r => !isDeleted(r));
}

function matchesRecurrence(rec, date) {
  if (!rec || rec.kind === "daily") return true;
  if (rec.kind === "weekdays") {
    return Array.isArray(rec.days) && rec.days.includes(date.getDay());
  }
  return false;
}

// Le rappel était-il dû à cette date ?
export function isReminderActiveOn(reminder, date) {
  if (!reminder || !date) return false;
  const iso = toISODate(date);
  if (reminder.startDate && iso < reminder.startDate) return false;
  if (reminder.endDate && iso > reminder.endDate) return false;
  // Supprimé : plus rien à partir de ce jour-là, mais tout le passé demeure.
  if (reminder.deletedAt && iso >= reminder.deletedAt) return false;
  return matchesRecurrence(reminder.recurrence, date);
}

// Tous les rappels dus à une date, triés par createdAt asc.
export function getActiveRemindersForDate(reminders, date) {
  if (!Array.isArray(reminders) || !date) return [];
  return reminders
    .filter(r => isReminderActiveOn(r, date))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

// Supprime sans rien perdre : le rappel disparaît des listes, ses coches
// restent modifiables sur les jours qu'il couvrait.
export function softDeleteReminder(reminders, reminderId, today = new Date()) {
  const iso = toISODate(today);
  return (reminders || []).map(r => (r.id === reminderId ? { ...r, deletedAt: iso } : r));
}

// « à venir » · « en cours » · « terminé » — ce que la carte annonce.
export function reminderStatus(reminder, today = new Date()) {
  const iso = toISODate(today);
  if (!reminder) return "ended";
  if (reminder.deletedAt && iso >= reminder.deletedAt) return "ended";
  if (reminder.endDate && iso > reminder.endDate) return "ended";
  if (reminder.startDate && iso < reminder.startDate) return "upcoming";
  return "running";
}

// ⚠️ Le temps du verbe dépend de la date du jour : « depuis le 29 sept. » sur
// un rappel qui commence dans quatre jours se lit comme s'il courait déjà.
export function formatRange(reminder, today = new Date()) {
  if (!reminder) return "";
  const iso = toISODate(today);
  const f = d => {
    const x = fromISODate(d);
    return x ? x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
  };
  const { startDate: a, endDate: b } = reminder;
  if (a && b) return `du ${f(a)} au ${f(b)}`;
  if (a) return a > iso ? `à partir du ${f(a)}` : `depuis le ${f(a)}`;
  if (b) return `jusqu'au ${f(b)}`;
  return "sans fin";
}

// Jours dus et jours cochés entre deux dates incluses.
export function completionBetween(reminder, reminderState, from, to) {
  let done = 0, total = 0;
  for (let iso = from; iso && iso <= to; iso = shiftISO(iso, 1)) {
    const d = fromISODate(iso);
    if (!d || !isReminderActiveOn(reminder, d)) continue;
    total++;
    if (isReminderCheckedOn(reminderState, reminder?.id, iso)) done++;
  }
  return { done, total };
}

// ─── « X % », mais sur quoi ? ────────────────────────────────────────────────
// Un taux sur 30 jours glissants ment dès que le rappel n'a pas 30 jours : un
// rappel commencé avant-hier s'affichait à 7 % parce que 28 jours où il
// n'existait pas comptaient comme des échecs. Et sur un rappel qui commence la
// semaine prochaine, un pourcentage n'a aucun sens — on n'a rien pu rater.
//
// La fenêtre est donc bornée par le rappel lui-même, et le libellé dit lequel
// des cas s'applique : « 60 % » sur deux jours ne doit pas se lire « 60 % sur
// le mois ».
export const PROGRESS_WINDOW = 30;

export function reminderProgress(reminder, reminderState, today = new Date()) {
  const iso = toISODate(today);
  const status = reminderStatus(reminder, today);
  const none = { done: 0, total: 0, rate: null };

  if (status === "upcoming") {
    const days = daysBetween(iso, reminder.startDate);
    return {
      ...none, kind: "upcoming", days,
      label: days === 1 ? "commence demain"
           : days > 1 ? `commence dans ${days} jours`
           : "commence aujourd'hui",
    };
  }

  // Le dernier jour qui compte : aujourd'hui, ou la fin si elle est passée.
  const last = [reminder.endDate, reminder.deletedAt ? shiftISO(reminder.deletedAt, -1) : null, iso]
    .filter(Boolean).sort()[0];
  const start = reminder.startDate || (reminder.createdAt || "").slice(0, 10) || last;
  const elapsed = daysBetween(start, last) + 1;
  const full = elapsed >= PROGRESS_WINDOW;
  const from = full ? shiftISO(last, -(PROGRESS_WINDOW - 1)) : start;
  const { done, total } = completionBetween(reminder, reminderState, from, last);

  return {
    done, total, rate: total ? done / total : null,
    kind: status === "ended" ? "ended" : (full ? "window" : "sinceStart"),
    label: total === 0 ? "aucune échéance encore"
         : status === "ended" ? "sur toute sa durée"
         : full ? `${PROGRESS_WINDOW} derniers jours`
         : `depuis le ${fromISODate(start)?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
  };
}

// Nombre de jours de `a` à `b` (0 si même jour, négatif si b précède a).
export function daysBetween(a, b) {
  const da = fromISODate(a), db = fromISODate(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
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

// Décale une date ISO de n jours. En local (pas UTC) : `new Date("2026-09-01")`
// se lit à minuit UTC et recule d'un jour à l'ouest de Greenwich.
export function shiftISO(iso, days) {
  const d = fromISODate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function fromISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

