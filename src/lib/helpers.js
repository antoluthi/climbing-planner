import { getSessionCharge } from "./charge.js";
export function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDate(date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function weekKey(monday) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calcEndTime(startTime, duration) {
  if (!startTime || !duration) return null;
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + Number(duration);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function migrateWeekKeys(data) {
  const weeks = data?.weeks;
  if (!weeks) return data;
  const oldKeys = Object.keys(weeks).filter(k => {
    const d = new Date(k + "T12:00:00");
    return d.getDay() === 0;
  });
  if (oldKeys.length === 0) return data;
  const newWeeks = { ...weeks };
  oldKeys.forEach(k => {
    const corrected = localDateStr(addDays(new Date(k + "T12:00:00"), 1));
    if (!newWeeks[corrected]) newWeeks[corrected] = newWeeks[k];
    delete newWeeks[k];
  });
  return { ...data, weeks: newWeeks };
}

// Une échéance : elle vit dans data.quickSessions, couvre parfois plusieurs
// jours, et n'a ni heure ni durée.
export function isEventItem(s) {
  return s?.mode === "event" || s?.isQuick === true;
}

export function getDaySessions(data, date) {
  const dateStr = localDateStr(date);
  const monday = getMondayOf(date);
  const wKey = weekKey(monday);
  const ws = data.weeks?.[wKey];
  const day = date.getDay();
  const idx = day === 0 ? 6 : day - 1;
  const weekSessions = ws?.[idx] || [];
  // Une échéance peut s'étaler sur plusieurs jours : elle apparaît sur chacun
  // d'eux, pas seulement le premier.
  const events = (data.quickSessions || []).filter(e =>
    e.startDate && e.startDate <= dateStr && (e.endDate || e.startDate) >= dateStr);
  return [...weekSessions, ...events];
}

export function getDayCharge(data, date) {
  // Somme des charges de séance sur l'échelle unifiée 0-10 (ressenti > planifié
  // > legacy normalisé) — voir lib/charge.js.
  return getDaySessions(data, date).reduce((a, s) => a + getSessionCharge(s), 0);
}

export function getMonthWeeks(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMondayOf(firstDay);
  const weeks = [];
  let d = new Date(startMonday);
  while (d <= lastDay) {
    weeks.push(new Date(d));
    d = addDays(d, 7);
  }
  return weeks;
}

// Renvoie la dernière valeur de poids connue (incluant today si présent),
// ou null si aucune valeur n'a été enregistrée.
export function getLastKnownWeight(data, todayISO) {
  const w = data?.weight || {};
  const dates = Object.keys(w).filter(d => w[d] != null);
  if (dates.length === 0) return null;
  // Préfère today si dispo, sinon la date la plus récente <= today.
  if (todayISO && w[todayISO] != null) return w[todayISO];
  const past = todayISO ? dates.filter(d => d <= todayISO) : dates;
  const pool = past.length ? past : dates;
  pool.sort((a, b) => b.localeCompare(a));
  return w[pool[0]] ?? null;
}

// Y a-t-il quelque chose au journal de ce jour-là ? Bien-être, poids, repas ou
// note : une seule de ces quatre choses suffit à dire « rempli ». Définie ici
// parce que deux écrans posent la même question — le bloc journal du calendrier
// et la pastille de chaque jour de la bande semaine — et qu'ils doivent
// répondre pareil.
export function hasDayLog(data, dateStr) {
  if (!data || !dateStr) return false;
  const hooper = (data.hooper || []).some(h => h.date === dateStr);
  const weight = data.weight?.[dateStr] != null;
  const note = !!(data.notes?.[dateStr] || "").trim();
  const meals = (data.nutrition?.[dateStr] || []).length > 0;
  return hooper || weight || note || meals;
}

// ─── Retrouver une séance ouverte ────────────────────────────────────────────
// Une fenêtre de séance s'ouvre à une position (semaine, jour, rang). Mais une
// synchronisation peut réordonner la journée pendant qu'elle est ouverte : la
// position seule désignerait alors **une autre séance**, et le ressenti — ou
// la suppression — partirait sur elle. On garde donc l'`id` à l'ouverture, et
// on retrouve la séance par lui : à sa place si elle y est toujours, sinon dans
// le même jour, la même semaine, puis partout (déplacée ailleurs pendant qu'on
// la regardait). Sans `id` (anciennes données), la position fait foi.
// Rend `{ weekKey, dayIndex, sessionIndex }`, ou null si elle a disparu.
export function locateSession(weeks, ref) {
  if (!ref) return null;
  const { weekKey: wk, dayIndex: di, sessionIndex: si, sessionId: id } = ref;
  const at = weeks?.[wk]?.[di]?.[si];
  if (id == null) return at ? { weekKey: wk, dayIndex: di, sessionIndex: si } : null;
  if (at?.id === id) return { weekKey: wk, dayIndex: di, sessionIndex: si };
  const find = (w, d) => (weeks?.[w]?.[d] || []).findIndex(s => s?.id === id);
  const inDay = find(wk, di);
  if (inDay >= 0) return { weekKey: wk, dayIndex: di, sessionIndex: inDay };
  const order = [wk, ...Object.keys(weeks || {}).filter(k => k !== wk)];
  for (const w of order) {
    const days = weeks?.[w];
    if (!Array.isArray(days)) continue;
    for (let d = 0; d < days.length; d++) {
      const i = find(w, d);
      if (i >= 0) return { weekKey: w, dayIndex: d, sessionIndex: i };
    }
  }
  return null;
}
