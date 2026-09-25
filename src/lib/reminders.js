import { DATA } from "../theme/palette.js";
// ─── REMINDERS ───────────────────────────────────────────────────────────────
// Système de rappels journaliers configurables.
//
//   reminders = [{
//     id, name, color, createdAt,
//     periods: [{ id, startDate?, endDate?, recurrence }]
//   }]
//   reminderState = { [reminderId]: { [dateStr]: true } }
//
// ⚠️ **Pourquoi des périodes et pas une plage.** Une coche est un **fait** daté :
// « j'ai fait ma suspension le 12 septembre ». Savoir qu'on était *censé* la
// faire ce jour-là, en revanche, se déduisait de la plage et de la récurrence
// **actuelles** — donc d'une opinion révisable. Modifier un rappel terminé pour
// repartir dessus ne perdait pas l'historique : il le **réécrivait**. Rétrécir
// la plage effaçait un mois de cases vertes ; l'étendre vers l'arrière
// *inventait* des échecs sur des jours où le rappel n'existait pas, peints en
// rouge dans la heatmap.
//
// Un rappel est donc une suite de **blocs datés** — comme un mésocycle ou un
// bloc de course, qui sont déjà modélisés ainsi dans l'app. On n'édite pas un
// bloc écoulé : on en ouvre un nouveau. Chaque jour passé se résout contre le
// bloc qui le couvrait, et devient de ce fait inatteignable.
//
// Les blocs ne se chevauchent jamais : `periodCovering` en renvoie donc **un**
// sans arbitrage arbitraire, et c'est la règle que l'éditeur fait respecter.

// Palette autorisée pour les rappels.
export const REMINDER_COLORS = DATA.picker;

const DAY_LABELS_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const DAY_LABELS_TWO   = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function newReminderId() {
  return "rem_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
export function newPeriodId() {
  return "per_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Les blocs d'un rappel, triés, quelle que soit la forme reçue.
//
// Un rappel d'avant la refonte porte `startDate` / `endDate` / `recurrence` à
// la racine : il se lit comme **un seul bloc**. La migration `v7` réécrit le
// stockage local, mais une ligne venue du cloud peut arriver non migrée — même
// raison que `normalizeCharge10` côté charges : on normalise à la volée plutôt
// que de supposer que tout le monde est à jour.
export function reminderPeriods(reminder) {
  if (!reminder) return [];
  if (Array.isArray(reminder.periods)) {
    return reminder.periods
      .filter(Boolean)
      .slice()
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  }
  // Pas de `periods` : forme d'avant la refonte. Même sans aucun champ de
  // planification, elle valait « tous les jours, sans fin » — rendre `[]` ici
  // **éteindrait** le rappel sans rien dire. Un `periods: []` explicite, lui,
  // est bien un rappel sans bloc : la branche au-dessus le respecte.
  return [{
    id: reminder.id ? `${reminder.id}_p0` : "p0",
    startDate: reminder.startDate || undefined,
    endDate: reminder.endDate || undefined,
    recurrence: reminder.recurrence || { kind: "daily" },
  }];
}

// Le bloc qui couvre cette date, ou null. Une date sans bloc n'a jamais rien
// réclamé — c'est ce qui rend l'historique insensible aux blocs suivants.
export function periodCovering(reminder, iso) {
  if (!iso) return null;
  for (const p of reminderPeriods(reminder)) {
    if (p.startDate && iso < p.startDate) continue;
    if (p.endDate && iso > p.endDate) continue;
    return p;
  }
  return null;
}

function matchesRecurrence(rec, date) {
  if (!rec || rec.kind === "daily") return true;
  if (rec.kind === "weekdays") {
    return Array.isArray(rec.days) && rec.days.includes(date.getDay());
  }
  return false;
}

// Renvoie true si le rappel était dû à la `date` (Date object).
//
// ⚠️ Plus aucun drapeau global ici. Un `enabled: false` faisait retourner false
// pour **toutes** les dates, passé compris : couper un rappel depuis le Compte
// effaçait tout son historique de la heatmap. Arrêter un rappel, c'est clore
// son bloc — ce qui n'a par construction aucun effet rétroactif.
export function isReminderActiveOn(reminder, date) {
  if (!reminder || !date) return false;
  const p = periodCovering(reminder, toISODate(date));
  return p ? matchesRecurrence(p.recurrence, date) : false;
}

// Renvoie tous les rappels actifs pour une date, triés par createdAt asc.
export function getActiveRemindersForDate(reminders, date) {
  if (!Array.isArray(reminders) || !date) return [];
  return reminders
    .filter(r => isReminderActiveOn(r, date))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

// ── L'état d'un rappel, et ce qu'on a le droit d'en faire ───────────────────

// Le bloc en cours ou à venir : celui qui n'est pas encore clos.
export function openPeriod(reminder, today = new Date()) {
  const iso = toISODate(today);
  return reminderPeriods(reminder).find(p => !p.endDate || p.endDate >= iso) || null;
}

export function lastPeriod(reminder) {
  const ps = reminderPeriods(reminder);
  return ps.length ? ps[ps.length - 1] : null;
}

// « à venir » · « en cours » · « terminé » — ce que la carte affiche et ce qui
// décide entre « Modifier » et « Reprendre ».
export function reminderStatus(reminder, today = new Date()) {
  const iso = toISODate(today);
  const open = openPeriod(reminder, today);
  if (!open) return "ended";
  if (open.startDate && open.startDate > iso) return "upcoming";
  return "running";
}

// Ce bloc a-t-il déjà des jours derrière lui ? C'est **la** question qui décide
// si on peut le retoucher : tant qu'aucun de ses jours n'est écoulé, le
// modifier ne réécrit rien.
export function periodHasElapsed(period, today = new Date()) {
  if (!period) return false;
  const iso = toISODate(today);
  return !period.startDate || period.startDate < iso;
}

// Clôt le bloc ouvert la veille de `fromISO` et en ajoute un nouveau.
// Immuable : rien de ce qui est écoulé n'est touché.
export function withNewPeriod(reminder, period, fromISO) {
  const ps = reminderPeriods(reminder);
  const eve = shiftISO(fromISO, -1);
  const closed = ps.map(p => {
    const stillOpen = !p.endDate || p.endDate >= fromISO;
    if (!stillOpen) return p;
    // Un bloc qui n'avait pas commencé est remplacé, pas clos sur une plage vide.
    if (p.startDate && p.startDate >= fromISO) return null;
    return { ...p, endDate: eve };
  }).filter(Boolean);
  return {
    ...reminder,
    periods: [...closed, { id: period.id || newPeriodId(), ...period }],
  };
}

// Remplace un bloc en place (seulement légitime s'il n'a pas de jours écoulés).
export function withUpdatedPeriod(reminder, periodId, patch) {
  const ps = reminderPeriods(reminder)
    .map(p => (p.id === periodId ? { ...p, ...patch } : p));
  return { ...reminder, periods: ps };
}

// Combien de jours dus dans ce bloc, et combien cochés. Sert à afficher
// l'historique bloc par bloc — « 28 sur 30 » se lit, « 93 % » beaucoup moins.
export function periodCompletion(reminder, period, reminderState, today = new Date()) {
  if (!period) return { done: 0, total: 0 };
  const todayISO = toISODate(today);
  const from = period.startDate || (reminder?.createdAt || "").slice(0, 10) || todayISO;
  const to = [period.endDate || todayISO, todayISO].sort()[0];   // jamais le futur
  let done = 0, total = 0;
  for (let iso = from; iso && iso <= to; iso = shiftISO(iso, 1)) {
    const d = fromISODate(iso);
    if (!d || !matchesRecurrence(period.recurrence, d)) continue;
    total++;
    if (isReminderCheckedOn(reminderState, reminder?.id, iso)) done++;
  }
  return { done, total };
}

export function formatPeriod(period) {
  if (!period) return "—";
  const f = iso => {
    const d = fromISODate(iso);
    return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
  };
  if (period.startDate && period.endDate) return `du ${f(period.startDate)} au ${f(period.endDate)}`;
  if (period.startDate) return `depuis le ${f(period.startDate)}`;
  if (period.endDate) return `jusqu'au ${f(period.endDate)}`;
  return "sans fin";
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

// Le bloc qu'une carte doit montrer : celui en cours, sinon le dernier. Les
// deux listes de rappels (CyclesView et CyclesTimeline) passent par ici — elles
// affichaient `reminder.recurrence`, qui n'existe plus à la racine, et deux
// copies auraient divergé au premier ajustement.
export function displayPeriod(reminder, today = new Date()) {
  return openPeriod(reminder, today) || lastPeriod(reminder);
}
